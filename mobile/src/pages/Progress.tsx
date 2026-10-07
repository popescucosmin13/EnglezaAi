// Progres real (§25): indicatori măsurați, scor compozit, misiuni (§24), raport săptămânal (§26).
// Portat de pe web; testul săptămânal folosește Recorder + STT nativ.

import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import type { Profile, Session, Mistake, VocabItem, WeeklyReport, DailyActivity, WeeklyQuizResult, WeeklyQuizItem, MistakeCategory } from '../types';
import { CATEGORY_LABELS_RO, COMPETENCY_LABELS_RO, SESSION_TYPE_LABELS_RO } from '../types';
import { getProfile, getSessions, getMistakes, getVocab, getReports, saveReport, getAllActivity, getQuizResults, saveQuizResult, saveSession, todayStr, updateActivity, getCachedQuizCues, cacheQuizCues } from '../db/db';
import { computeIndicators, dayTrend, buildWeeklyStats, isoWeekId, daysAgoStr, weeklyMissionProgress } from '../logic/metrics';
import { compositeScore, competencyLevelsFromScores, reviewMistake } from '../logic/engine';
import { WEEKLY_MISSIONS, ninetyDayStage, normalizeProgramDuration } from '../content';
import { chatText, chatJson } from '../api/openrouter';
import { buildWeeklyReportPrompt, buildQuizCuesPrompt } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import { LineChart } from '../components/Charts';
import Markdown from '../components/Markdown';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import ReportView from '../components/ReportView';
import { getBossResults } from '../microlearning/state';
import type { BossResult } from '../microlearning/types';
import { Screen, H1, H2, Card, Banner, Button, ButtonRow, StatGrid, StatTile, Bar, RoutineItem, Tiny, Muted, Skeleton, Field, IconButton, TabsBar, Chip, ChipRow, Pill } from '../ui';
import { usePalette } from '../theme';

function fmtDuration(sec: number): string {
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return minutes ? `${hours} h ${minutes} m` : `${hours} h`;
}

function reportInputHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export default function Progress() {
  const p = usePalette();
  const [tab, setTab] = useState<'now' | 'tests' | 'history'>('now');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [acts, setActs] = useState<DailyActivity[]>([]);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [bossResults, setBossResults] = useState<BossResult[]>([]);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [loadError, setLoadError] = useState('');

  async function load() {
    setLoadError('');
    try {
      setProfile(await getProfile());
      setSessions(await getSessions());
      setMistakes(await getMistakes());
      setVocab(await getVocab());
      setActs(await getAllActivity());
      setReports(await getReports());
      setBossResults(await getBossResults());
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!profile) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Banner kind="error">Nu am putut încărca progresul: {loadError}</Banner>
            <ButtonRow>
              <Button title="Reîncearcă" onPress={load} />
            </ButtonRow>
          </>
        ) : (
          <View accessibilityLabel="Se încarcă">
            <Skeleton width={150} height={30} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1 }}>
                  <Skeleton height={72} radius={14} />
                </View>
              ))}
            </View>
            <Skeleton height={170} radius={14} style={{ marginTop: 18 }} />
            <Skeleton height={90} radius={14} style={{ marginTop: 12 }} />
          </View>
        )}
      </Screen>
    );
  }

  const week = computeIndicators(sessions, vocab, daysAgoStr(7));
  const trend = dayTrend(sessions);
  const wm = weeklyMissionProgress(acts, sessions, vocab);
  const displayedCompetencyLevels = competencyLevelsFromScores(profile.scores);
  const daysSince = Math.floor((Date.now() - new Date(profile.startDate + 'T00:00:00').getTime()) / 86400000);
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const stage = ninetyDayStage(daysSince, programDuration);
  const appByDate = new Map(acts.map((day) => [day.date, day.appActiveSec ?? 0]));
  const totalAppSec = acts.reduce((sum, day) => sum + (day.appActiveSec ?? 0), 0);
  const todayAppSec = appByDate.get(todayStr()) ?? 0;
  const activeDays = acts.filter((day) => (day.appActiveSec ?? 0) > 0).length;
  const avgDaySec = activeDays ? Math.round(totalAppSec / activeDays) : 0;
  const appSeries = Array.from({ length: 14 }, (_, index) => daysAgoStr(13 - index)).map((date) => ({
    label: date.slice(5),
    value: Math.round((appByDate.get(date) ?? 0) / 60),
  }));

  async function makeReport() {
    setBusy(true);
    setError('');
    try {
      const stats = buildWeeklyStats(sessions, mistakes, vocab);
      const weekId = isoWeekId();
      const inputHash = reportInputHash(stats);
      const cached = reports.find((r) => r.weekId === weekId && r.inputHash === inputHash);
      if (cached) {
        setOpenReport(cached.weekId);
        setBusy(false);
        return;
      }
      const markdown = await chatText(
        [{ role: 'user', content: buildWeeklyReportPrompt(stats) }],
        { feature: 'weekly_report', maxTokens: 1500 }
      );
      const r: WeeklyReport = { weekId, markdown, createdAt: new Date().toISOString(), inputHash };
      await saveReport(r);
      setReports(await getReports());
      setOpenReport(r.weekId);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="trending" size={24} />
        <H1 style={{ marginVertical: 0 }}>Progres</H1>
      </View>
      <Muted>
        Ziua {Math.min(daysSince + 1, programDuration)}/{programDuration} · {stage.stage} · scor general{' '}
        <Text style={{ fontWeight: '700' }}>{compositeScore(profile.scores)}/100</Text>
      </Muted>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <TabsBar
        tabs={[
          { key: 'now', label: 'Acum' },
          { key: 'tests', label: 'Teste & rapoarte' },
          { key: 'history', label: 'Istoric' },
        ]}
        active={tab}
        onChange={(value) => setTab(value as 'now' | 'tests' | 'history')}
      />

      {tab === 'now' ? <>
      <H2>Indicatori reali (7 zile)</H2>
      <StatGrid>
        <StatTile value={week.minutesSpoken} label="minute vorbite" />
        <StatTile value={week.wordsPerMinute ?? '—'} label="cuvinte / minut" />
        <StatTile value={week.avgPauseSec ?? '—'} label="pauza medie (s)" />
        <StatTile value={week.errorsPer100 ?? '—'} label="greșeli / 100 cuvinte" />
        <StatTile value={week.activeExpressions} label="expresii active" />
        <StatTile value={week.noHelpConvos} label="conversații fără ajutor" />
      </StatGrid>

      <H2>Timp de învățare</H2>
      <StatGrid>
        <StatTile value={fmtDuration(todayAppSec)} label="azi" />
        <StatTile value={fmtDuration(totalAppSec)} label="total" />
        <StatTile value={fmtDuration(avgDaySec)} label="media / zi activă" />
        <StatTile value={activeDays} label="zile active" />
      </StatGrid>
      <Card>
        <LineChart points={appSeries} yLabel="Minute în aplicație pe zi (ultimele 14 zile)" />
        <Tiny>Timpul este numărat doar cât aplicația este activă și ai interacționat în ultimele 90 de secunde.</Tiny>
      </Card>

      <H2>Competențele tale</H2>
      <Card>
        {(Object.keys(profile.scores) as (keyof Profile['scores'])[]).map((k) => (
          <View key={k} style={{ marginVertical: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: p.ink, fontSize: 14 }}>{COMPETENCY_LABELS_RO[k]}</Text>
              <Tiny>
                {displayedCompetencyLevels[k]} · {profile.scores[k]}/100
              </Tiny>
            </View>
            <Bar ratio={profile.scores[k] / 100} />
          </View>
        ))}
        <Tiny>Scorurile folosesc până la 10 conversații și 30 de exerciții recente. Conversația, gramatica și vocabularul se actualizează după minimum 3 sesiuni, iar pronunția și înțelegerea după minimum 5 exerciții.</Tiny>
      </Card>

      <H2>Greșeli / 100 de cuvinte</H2>
      <Card>
        <LineChart
          points={trend.filter((d) => d.errorsPer100 != null).map((d) => ({ label: d.date.slice(5), value: d.errorsPer100! }))}
          yLabel="Greșeli la 100 de cuvinte"
        />
      </Card>

      <H2>Misiunile săptămânii</H2>
      <Card>
        {WEEKLY_MISSIONS.map((m, i) => {
          const prog = Math.min(wm[m.id] ?? 0, m.target);
          const done = prog >= m.target;
          return (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <RoutineItem done={done} last={i === WEEKLY_MISSIONS.length - 1}>
                  {m.titleRo}
                </RoutineItem>
              </View>
              <Tiny>
                {prog}/{m.target} · +{m.xp} XP
              </Tiny>
            </View>
          );
        })}
      </Card>

      {profile.topProblems.length > 0 ? <>
        <H2>Problemele identificate la test</H2>
        <Card>
          {profile.topProblems.map((problem, index) => <Text key={`${problem}-${index}`} style={{ color: p.ink, fontSize: 15, marginVertical: 5 }}>{index + 1}. {problem}</Text>)}
        </Card>
      </> : null}
      </> : null}

      {tab === 'tests' ? <>
      <H2>Boss Battle — transfer săptămânal</H2>
      <Card>
        {bossResults.length ? <>
          <Text style={{ color: p.ink, fontWeight: '800', fontSize: 17 }}>Ultimul scor: {bossResults.at(-1)!.score}/100</Text>
          <Tiny>{bossResults.at(-1)!.weekId} · {bossResults.at(-1)!.correct}/{bossResults.at(-1)!.cards} răspunsuri corecte</Tiny>
          {bossResults.length > 1 ? <Pill kind="xp">{bossResults.at(-1)!.score - bossResults.at(-2)!.score >= 0 ? '+' : ''}{bossResults.at(-1)!.score - bossResults.at(-2)!.score} vs. anterior</Pill> : null}
        </> : <Muted>Încă nu ai un rezultat. Testul combină greșeli, vocabular, ascultare și transfer.</Muted>}
        <Button title="Începe Boss Battle" variant="primary" icon="trophy" onPress={() => router.push('/boss')} style={{ marginTop: 12 }} />
      </Card>

      <H2>Testul săptămânii — fără indicii</H2>
      <WeeklyQuiz mistakes={mistakes} />

      <H2>Raport săptămânal</H2>
      <ButtonRow>
        <Button
          title={busy ? 'Se generează…' : 'Generează raportul săptămânii'}
          variant="primary"
          icon={busy ? undefined : 'clipboard'}
          busy={busy}
          onPress={makeReport}
          disabled={busy}
        />
        <Button title="Refă testul de nivel" icon="graduation" onPress={() => router.push('/test')} />
      </ButtonRow>
      {reports.map((r) => (
        <Card key={r.weekId} onPress={() => setOpenReport(openReport === r.weekId ? null : r.weekId)}>
          <Text style={{ color: p.ink }}>
            <Text style={{ fontWeight: '700' }}>Raport {r.weekId}</Text>
            <Tiny> · {r.createdAt.slice(0, 10)}</Tiny>
          </Text>
          {openReport === r.weekId && <Markdown text={r.markdown} />}
        </Card>
      ))}
      </> : null}

      {tab === 'history' ? <>
        <H2>Istoric sesiuni</H2>
        <SessionHistory sessions={sessions} onSessionSeen={(session) => setSessions((all) => all.map((item) => item.id === session.id ? session : item))} />
      </> : null}
    </Screen>
  );
}

function categoriesInSession(session: Session): MistakeCategory[] {
  const categories = new Set<MistakeCategory>();
  for (const turn of session.turns) {
    if (turn.role !== 'user' || !turn.analysis) continue;
    for (const error of turn.analysis.errors) categories.add(error.category);
  }
  return [...categories];
}

function SessionHistory({ sessions, onSessionSeen }: { sessions: Session[]; onSessionSeen: (session: Session) => void }) {
  const p = usePalette();
  const [openId, setOpenId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<MistakeCategory | null>(null);
  const sorted = [...sessions].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const availableCategories = [...new Set(sorted.flatMap(categoriesInSession))]
    .sort((left, right) => CATEGORY_LABELS_RO[left].localeCompare(CATEGORY_LABELS_RO[right]));
  const filtered = categoryFilter ? sorted.filter((session) => categoriesInSession(session).includes(categoryFilter)) : sorted;

  async function toggleOpen(session: Session) {
    const opening = openId !== session.id;
    setOpenId(opening ? session.id : null);
    if (opening && !session.reportSeen) {
      const updated = { ...session, reportSeen: true };
      onSessionSeen(updated);
      await saveSession(updated).catch(() => {});
    }
  }

  if (!sorted.length) return <Muted>Nicio sesiune încă.</Muted>;
  return <>
    {availableCategories.length ? <ChipRow>
      <Chip label="Toate" selected={categoryFilter == null} onPress={() => setCategoryFilter(null)} />
      {availableCategories.map((category) => <Chip key={category} label={CATEGORY_LABELS_RO[category]} selected={categoryFilter === category} onPress={() => setCategoryFilter(category)} />)}
    </ChipRow> : null}
    {filtered.map((session) => {
      const categories = categoriesInSession(session);
      return <Card key={session.id} onPress={() => void toggleOpen(session)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: p.ink, fontWeight: '800' }}>{SESSION_TYPE_LABELS_RO[session.type]}</Text>
            <Tiny>{session.startedAt.slice(0, 10)}{session.scenarioTitle ? ` · ${session.scenarioTitle}` : ''}</Tiny>
          </View>
          <Tiny>{session.reportStatus === 'pending' ? 'se generează…' : session.report ? `scor ${session.report.generalScore}/100` : `${session.errorCount} greșeli`}</Tiny>
        </View>
        {session.reportStatus === 'ready' && !session.reportSeen ? <Pill kind="xp">raport nou</Pill> : null}
        {categories.length ? <ChipRow>{categories.map((category) => <Chip key={category} label={CATEGORY_LABELS_RO[category]} />)}</ChipRow> : null}
        {openId === session.id ? <View style={{ marginTop: 8 }}>
          <ReportView session={session} report={session.report} />
          {categories.length ? <ButtonRow>{categories.map((category) => <Button key={category} title={`Repetă ${CATEGORY_LABELS_RO[category]}`} icon="rotate" onPress={() => router.push('/practice')} />)}</ButtonRow> : null}
        </View> : null}
      </Card>;
    })}
  </>;
}

// ---------- Testul săptămânal fără indicii (§P1) ----------
// 3 probleme vechi, indiciu doar în română, verificare vorbită, comparație săptămână/săptămână.
function WeeklyQuiz({ mistakes }: { mistakes: Mistake[] }) {
  const p = usePalette();
  const [history, setHistory] = useState<WeeklyQuizResult[]>([]);
  const [items, setItems] = useState<{ mistake: Mistake; cueRo: string }[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<WeeklyQuizItem[]>([]);
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<WeeklyQuizResult | null>(null);
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getQuizResults().then(setHistory).catch(() => {});
  }, []);

  const eligible = mistakes
    .filter((m) => m.status !== 'mastered' && m.firstSeenAt.slice(0, 10) < daysAgoStr(3) && m.corrected.trim().split(/\s+/).length >= 2)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 3);

  const thisWeekDone = history.some((h) => h.weekId === isoWeekId());

  async function startQuiz() {
    setBusy(true);
    setError('');
    setSaved(null);
    try {
      const weekId = isoWeekId();
      const mistakeIds = eligible.map((m) => m.id);
      // reîncercarea aceleiași săptămâni, pe aceleași greșeli, nu regenerează indiciile
      const cachedCues = await getCachedQuizCues(weekId, mistakeIds).catch(() => undefined);
      const cues = cachedCues ?? (await chatJson<{ cues: string[] }>(
        [{ role: 'user', content: buildQuizCuesPrompt(eligible) }],
        // Indicii în română, citite direct de utilizator — calitatea primează asupra costului.
        { tier: 'utility', feature: 'weekly_quiz_cues', maxTokens: 900, validate: (v: any) => Array.isArray(v?.cues) && v.cues.length >= eligible.length }
      )).cues;
      if (!cachedCues) await cacheQuizCues(weekId, mistakeIds, cues).catch(() => {});
      setItems(eligible.map((m, i) => ({ mistake: m, cueRo: cues[i] })));
      setIdx(0);
      setAnswers([]);
      setAnswer('');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function submit(text: string) {
    if (!items || !text.trim()) return;
    const { mistake, cueRo } = items[idx];
    const ok = sttDiffAssessment(mistake.corrected, text).accuracyScore >= 70;
    await reviewMistake(mistake, ok ? 'good' : 'fail').catch(() => {});
    const entry: WeeklyQuizItem = { mistakeId: mistake.id, cueRo, expectedEn: mistake.corrected, saidEn: text.trim(), ok };
    const all = [...answers, entry];
    setAnswers(all);
    setAnswer('');
    if (idx + 1 < items.length) {
      setIdx(idx + 1);
    } else {
      const result: WeeklyQuizResult = {
        weekId: isoWeekId(),
        date: todayStr(),
        items: all,
        score: Math.round((all.filter((a) => a.ok).length / all.length) * 100),
      };
      await saveQuizResult(result).catch((e) => setError(String(e?.message ?? e)));
      await updateActivity({ testDone: true }).catch(() => {});
      setSaved(result);
      setItems(null);
      setHistory((h) => [...h, result]);
    }
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        await submit(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  const last = saved ?? history[history.length - 1];
  const prev = history.filter((h) => h !== last).slice(-1)[0];

  return (
    <Card>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!items && !saved && (
        <>
          <Muted style={{ marginBottom: 8 }}>
            3 probleme vechi, indiciu doar în română, fără forma corectă la vedere. Rezultatul se compară cu săptămâna trecută.
          </Muted>
          {eligible.length === 0 ? (
            <Tiny>Încă nu există greșeli suficient de vechi (minimum 3 zile) pentru test.</Tiny>
          ) : (
            <Button
              title={busy ? 'Se pregătește…' : thisWeekDone ? 'Refă testul săptămânii' : `Începe testul (${eligible.length} probleme)`}
              variant="primary"
              icon={busy ? undefined : 'flask'}
              busy={busy}
              onPress={startQuiz}
              disabled={busy || !hasOpenRouterKey()}
            />
          )}
        </>
      )}
      {items && (
        <>
          <Tiny style={{ fontWeight: '700' }}>
            Problema {idx + 1}/{items.length}
          </Tiny>
          <Text style={{ color: p.ink, fontSize: 16.5, marginVertical: 6 }}>{items[idx].cueRo}</Text>
          <Tiny>Spune propoziția în engleză:</Tiny>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field value={answer} onChange={setAnswer} placeholder="Răspunsul tău în engleză…" />
            </View>
            <IconButton
              icon={recording ? 'stop' : 'mic'}
              size={22}
              color={recording ? p.danger : p.ink2}
              onPress={mic}
              style={{
                borderWidth: 1,
                borderColor: recording ? p.danger : p.border,
                borderRadius: 12,
                padding: 11,
                backgroundColor: recording ? p.dangerSoft : p.card,
              }}
            />
          </View>
          <ButtonRow style={{ marginBottom: 0 }}>
            <Button title="Trimite" variant="primary" onPress={() => submit(answer)} disabled={!answer.trim()} />
            <Button title="Renunț" variant="ghost" onPress={() => setItems(null)} />
          </ButtonRow>
        </>
      )}
      {saved && (
        <>
          <Text style={{ color: p.ink, fontWeight: '700', fontSize: 16 }}>Rezultat: {saved.score}/100</Text>
          {saved.items.map((it, i) => (
            <View key={i} style={{ marginVertical: 4 }}>
              <Tiny>
                {it.ok ? '✓' : '✗'} {it.cueRo}
              </Tiny>
              <Tiny style={{ opacity: 0.8 }}>Ai spus: „{it.saidEn}"</Tiny>
              {!it.ok && (
                <Tiny>
                  corect: <Text style={{ fontWeight: '700' }}>{it.expectedEn}</Text>
                </Tiny>
              )}
            </View>
          ))}
          <Button title="Închide" variant="ghost" onPress={() => setSaved(null)} />
        </>
      )}
      {last && prev && prev !== last && (
        <Tiny style={{ marginTop: 8 }}>
          Săptămâna trecută vs. acum: <Text style={{ fontWeight: '700' }}>{prev.score}</Text> →{' '}
          <Text style={{ fontWeight: '700' }}>{last.score}</Text>
          {last.score > prev.score ? ' — progres real!' : last.score < prev.score ? ' — mai lucrăm.' : ' — constant.'}
          {(() => {
            const repeat = last.items.filter((it) => prev.items.some((p2) => p2.mistakeId === it.mistakeId));
            const improved = repeat.filter((it) => it.ok && !prev.items.find((p2) => p2.mistakeId === it.mistakeId)!.ok).length;
            return repeat.length > 0 ? ` Pe aceleași probleme: ${improved}/${repeat.length} rezolvate acum față de data trecută.` : '';
          })()}
        </Tiny>
      )}
      {history.length > 0 && !saved && (
        <Tiny style={{ marginTop: 8 }}>
          Istoric: {history.slice(-6).map((h) => `${h.weekId.slice(5)}: ${h.score}`).join(' · ')}
        </Tiny>
      )}
    </Card>
  );
}
