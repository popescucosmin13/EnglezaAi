// Progres real (§25): indicatori măsurați, scor compozit, misiuni (§24), raport săptămânal (§26).

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import type { Profile, Session, Mistake, VocabItem, WeeklyReport, DailyActivity, WeeklyQuizResult, WeeklyQuizItem, MistakeCategory } from '../types';
import { COMPETENCY_LABELS_RO, CATEGORY_LABELS_RO, SESSION_TYPE_LABELS_RO } from '../types';
import { getProfile, getSessions, getMistakes, getVocab, getReports, saveReport, getAllActivity, getQuizResults, saveQuizResult, todayStr, updateActivity, getCachedQuizCues, cacheQuizCues, saveSession } from '../db/db';
import { computeIndicators, dayTrend, buildWeeklyStats, isoWeekId, daysAgoStr, weeklyMissionProgress } from '../logic/metrics';
import { compositeScore, competencyLevelsFromScores, reviewMistake, dedupeMistakes } from '../logic/engine';
import { WEEKLY_MISSIONS, ninetyDayStage, normalizeProgramDuration } from '../content';
import { chatText, chatJson } from '../api/openrouter';
import { buildWeeklyReportPrompt, buildQuizCuesPrompt } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import { on, emit } from '../events';
import { LineChart } from '../components/Charts';
import Markdown from '../components/Markdown';
import ReportView from '../components/ReportView';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import { getBossResults } from '../microlearning/state';
import type { BossResult } from '../microlearning/types';

/** Secunde → „45 min" / „2 h 15 m", pentru afișarea timpului petrecut în aplicație. */
function fmtDuration(sec: number): string {
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} h ${m} m` : `${h} h`;
}

function reportInputHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

type Tab = 'now' | 'tests' | 'history';

export default function Progress() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('now');
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

  // dacă rămâi pe Progres cât se generează un raport în fundal, Istoricul se reîmprospătează singur
  useEffect(() => on('engleza-report-ready', () => {
    void getSessions().then(setSessions).catch(() => {});
  }), []);

  if (!profile) {
    if (loadError) {
      return (
        <div className="page">
          <div className="error-banner">
            Nu am putut încărca progresul: {loadError}
            <div className="btn-row"><button onClick={load}>Reîncearcă</button></div>
          </div>
        </div>
      );
    }
    return (
      <SkeletonGroup>
        <Skeleton width={150} height={30} />
        <div className="stat-grid" style={{ marginTop: 14 }}>
          <Skeleton height={72} radius={14} />
          <Skeleton height={72} radius={14} />
          <Skeleton height={72} radius={14} />
        </div>
        <Skeleton height={170} radius={14} style={{ marginTop: 18 }} />
        <Skeleton height={90} radius={14} style={{ marginTop: 12 }} />
      </SkeletonGroup>
    );
  }

  const week = computeIndicators(sessions, vocab, daysAgoStr(7));
  const trend = dayTrend(sessions);
  const wm = weeklyMissionProgress(acts, sessions, vocab);
  const displayedCompetencyLevels = competencyLevelsFromScores(profile.scores);
  const daysSince = Math.floor((Date.now() - new Date(profile.startDate + 'T00:00:00').getTime()) / 86400000);
  const programDuration = normalizeProgramDuration(profile.programDurationDays);

  // Timp petrecut învățând în aplicație: total, azi, media/zi și seria ultimelor 14 zile.
  const appByDate = new Map(acts.map((d) => [d.date, d.appActiveSec ?? 0]));
  const totalAppSec = acts.reduce((a, d) => a + (d.appActiveSec ?? 0), 0);
  const todayAppSec = appByDate.get(todayStr()) ?? 0;
  const activeDays = acts.filter((d) => (d.appActiveSec ?? 0) > 0).length;
  const avgDaySec = activeDays > 0 ? Math.round(totalAppSec / activeDays) : 0;
  const appSeries = Array.from({ length: 14 }, (_, i) => daysAgoStr(13 - i)).map((date) => ({
    label: date.slice(5),
    value: Math.round((appByDate.get(date) ?? 0) / 60),
  }));
  const stage = ninetyDayStage(daysSince, programDuration);

  async function makeReport() {
    if (!hasOpenRouterKey()) {
      setError('Testul este temporar indisponibil. Încearcă din nou puțin mai târziu.');
      return;
    }
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
    <div className="page">
      <h1><Icon name="trending" size={24} />Progres</h1>
      <p className="muted">
        Ziua {Math.min(daysSince + 1, programDuration)}/{programDuration} · {stage.stage} · scor general <strong>{compositeScore(profile.scores)}/100</strong>
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        <button className={tab === 'now' ? 'active' : ''} onClick={() => setTab('now')}>Acum</button>
        <button className={tab === 'tests' ? 'active' : ''} onClick={() => setTab('tests')}>Teste &amp; rapoarte</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Istoric</button>
      </div>

      {tab === 'now' && (
        <>
          <h2>Indicatori reali (7 zile)</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{week.minutesSpoken}</div><div className="label">minute vorbite</div></div>
            <div className="stat-tile"><div className="value">{week.wordsPerMinute ?? '—'}</div><div className="label">cuvinte / minut</div></div>
            <div className="stat-tile"><div className="value">{week.avgPauseSec ?? '—'}</div><div className="label">pauza medie (s)</div></div>
            <div className="stat-tile"><div className="value">{week.errorsPer100 ?? '—'}</div><div className="label">greșeli / 100 cuvinte</div></div>
            <div className="stat-tile"><div className="value">{week.activeExpressions}</div><div className="label">expresii active</div></div>
            <div className="stat-tile"><div className="value">{week.noHelpConvos}</div><div className="label">conversații fără ajutor</div></div>
          </div>

          <h2><Icon name="clock" size={16} />Timp de învățare</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{fmtDuration(todayAppSec)}</div><div className="label">azi</div></div>
            <div className="stat-tile"><div className="value">{fmtDuration(totalAppSec)}</div><div className="label">total</div></div>
            <div className="stat-tile"><div className="value">{fmtDuration(avgDaySec)}</div><div className="label">media / zi activă</div></div>
            <div className="stat-tile"><div className="value">{activeDays}</div><div className="label">zile active</div></div>
          </div>
          <div className="card">
            <LineChart points={appSeries} yLabel="Minute în aplicație pe zi (ultimele 14 zile)" />
            <p className="tiny">Timp activ în aplicație — se numără doar cât ești efectiv în aplicație și interacționezi.</p>
          </div>

          <h2>Competențele tale</h2>
          <div className="card">
            {(Object.keys(profile.scores) as (keyof Profile['scores'])[]).map((k) => (
              <div key={k} style={{ margin: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span>{COMPETENCY_LABELS_RO[k]}</span>
                  <span className="tiny">{displayedCompetencyLevels[k]} · {profile.scores[k]}/100</span>
                </div>
                <div className="bar"><div style={{ width: `${profile.scores[k]}%` }} /></div>
              </div>
            ))}
            <p className="tiny">Scorurile folosesc până la 10 conversații și 30 de exerciții recente. Conversația, gramatica și vocabularul se actualizează după minimum 3 sesiuni, iar pronunția și înțelegerea după minimum 5 exerciții.</p>
          </div>

          <h2>Greșeli / 100 de cuvinte</h2>
          <div className="card">
            <LineChart
              points={trend.filter((d) => d.errorsPer100 != null).map((d) => ({ label: d.date.slice(5), value: d.errorsPer100! }))}
              yLabel="Greșeli la 100 de cuvinte"
            />
          </div>

          <h2>Misiunile săptămânii</h2>
          <div className="card">
            {WEEKLY_MISSIONS.map((m) => {
              const prog = Math.min(wm[m.id] ?? 0, m.target);
              const done = prog >= m.target;
              return (
                <div key={m.id} className={`routine-item ${done ? 'done' : ''}`}>
                  <span className="check"><Icon name={done ? 'checkCircle' : 'square'} size={18} /></span>
                  <span style={{ flex: 1 }}>{m.titleRo}</span>
                  <span className="tiny">{prog}/{m.target} · +{m.xp} XP</span>
                </div>
              );
            })}
          </div>

          {profile.topProblems.length > 0 && (
            <>
              <h2>Problemele identificate la test</h2>
              <div className="card">
                {profile.topProblems.map((p, i) => (
                  <p key={i} style={{ margin: '5px 0' }}>{i + 1}. {p}</p>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'tests' && (
        <>
          <h2>Boss Battle — transfer săptămânal</h2>
          <div className="card boss-summary">
            {bossResults.length > 0 ? (
              <>
                <div>
                  <strong>Ultimul scor: {bossResults[bossResults.length - 1].score}/100</strong>
                  <p className="tiny">{bossResults[bossResults.length - 1].weekId} · {bossResults[bossResults.length - 1].correct}/{bossResults[bossResults.length - 1].cards} răspunsuri corecte</p>
                </div>
                {bossResults.length > 1 && (
                  <span className="level-pill">
                    {bossResults[bossResults.length - 1].score - bossResults[bossResults.length - 2].score >= 0 ? '+' : ''}
                    {bossResults[bossResults.length - 1].score - bossResults[bossResults.length - 2].score} vs. anterior
                  </span>
                )}
              </>
            ) : <p className="muted">Încă nu ai un rezultat. Testul combină greșeli, vocabular, ascultare și transfer.</p>}
            <button className="btn-primary" onClick={() => navigate('/boss')}><Icon name="trophy" />Începe Boss Battle</button>
          </div>

          <h2>Testul săptămânii — fără indicii</h2>
          <WeeklyQuiz mistakes={mistakes} />

          <h2>Raport săptămânal</h2>
          <div className="btn-row">
            <button className="btn-primary" onClick={makeReport} disabled={busy}>
              <Icon name={busy ? 'loader' : 'clipboard'} className={busy ? 'icon-spin' : undefined} />{busy ? 'Se generează…' : 'Generează raportul săptămânii'}
            </button>
            <button onClick={() => navigate('/test')}><Icon name="graduation" />Refă testul de nivel</button>
          </div>
          {reports.map((r) => (
            <div key={r.weekId} className="card clickable" onClick={() => setOpenReport(openReport === r.weekId ? null : r.weekId)}>
              <strong>Raport {r.weekId}</strong> <span className="tiny">· {r.createdAt.slice(0, 10)}</span>
              {openReport === r.weekId && <Markdown text={r.markdown} />}
            </div>
          ))}
        </>
      )}

      {tab === 'history' && (
        <>
          <h2>Istoric sesiuni</h2>
          <SessionHistory sessions={sessions} onSessionSeen={(s) => setSessions((all) => all.map((x) => (x.id === s.id ? s : x)))} />
        </>
      )}
    </div>
  );
}

// ---------- Istoric sesiuni: toate rapoartele, grupate pe categorii + „de repetat" ----------
function categoriesInSession(session: Session): MistakeCategory[] {
  const set = new Set<MistakeCategory>();
  for (const t of session.turns) {
    if (t.role !== 'user' || !t.analysis) continue;
    for (const e of t.analysis.errors) set.add(e.category);
  }
  return [...set];
}

function SessionHistory({ sessions, onSessionSeen }: { sessions: Session[]; onSessionSeen: (s: Session) => void }) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<MistakeCategory | null>(null);

  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const availableCategories = [...new Set(sorted.flatMap((s) => categoriesInSession(s)))].sort((a, b) =>
    CATEGORY_LABELS_RO[a].localeCompare(CATEGORY_LABELS_RO[b])
  );
  const filtered = categoryFilter ? sorted.filter((s) => categoriesInSession(s).includes(categoryFilter)) : sorted;

  async function toggleOpen(s: Session) {
    setOpenId((cur) => (cur === s.id ? null : s.id));
    if (openId !== s.id && !s.reportSeen) {
      const updated = { ...s, reportSeen: true };
      onSessionSeen(updated);
      await saveSession(updated).catch(() => {});
      emit('engleza-report-seen', s.id); // stinge bulina roșie din nav imediat
    }
  }

  if (sorted.length === 0) return <p className="muted">Nicio sesiune încă.</p>;

  return (
    <>
      {availableCategories.length > 0 && (
        <div className="chip-row">
          <button className={`chip ${categoryFilter == null ? 'selected' : ''}`} onClick={() => setCategoryFilter(null)}>Toate</button>
          {availableCategories.map((c) => (
            <button key={c} className={`chip ${categoryFilter === c ? 'selected' : ''}`} onClick={() => setCategoryFilter(c)}>
              {CATEGORY_LABELS_RO[c]}
            </button>
          ))}
        </div>
      )}
      {filtered.map((s) => {
        const cats = categoriesInSession(s);
        return (
          <div key={s.id} className="card clickable" onClick={() => toggleOpen(s)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <strong>{SESSION_TYPE_LABELS_RO[s.type]}</strong>{' '}
                <span className="tiny">{s.startedAt.slice(0, 10)}{s.scenarioTitle ? ` · ${s.scenarioTitle}` : ''}</span>
                {s.reportStatus === 'ready' && !s.reportSeen && <span className="badge" style={{ marginLeft: 6 }}>nou</span>}
              </div>
              <span className="tiny" style={{ flex: '0 0 auto' }}>
                {s.reportStatus === 'pending' ? <><span className="spinner" /> se generează…</> : s.report ? `scor ${s.report.generalScore}/100` : `${s.errorCount} greșeli`}
              </span>
            </div>
            {cats.length > 0 && (
              <div className="chip-row" style={{ marginTop: 6, marginBottom: 0 }}>
                {cats.map((c) => <span key={c} className="chip">{CATEGORY_LABELS_RO[c]}</span>)}
              </div>
            )}
            {openId === s.id && (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
                <ReportView session={s} report={s.report} />
                {cats.length > 0 && (
                  <div className="btn-row">
                    {cats.map((c) => (
                      <button key={c} onClick={() => navigate(`/practice?tab=mistakes&category=${c}`)}>
                        <Icon name="rotate" size={15} />Repetă {CATEGORY_LABELS_RO[c]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------- Testul săptămânal fără indicii (§P1) ----------
// 3 probleme vechi, indiciu doar în română, verificare vorbită, comparație săptămână/săptămână.
function WeeklyQuiz({ mistakes }: { mistakes: Mistake[] }) {
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

  const eligible = dedupeMistakes(
    mistakes.filter((m) => m.status !== 'mastered' && m.firstSeenAt.slice(0, 10) < daysAgoStr(3) && m.corrected.trim().split(/\s+/).length >= 2)
  )
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
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
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
    <div className="card">
      {error && <div className="error-banner">{error}</div>}
      {!items && !saved && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            3 probleme vechi, indiciu doar în română, fără forma corectă la vedere. Rezultatul se compară cu săptămâna trecută.
          </p>
          {eligible.length === 0 ? (
            <p className="tiny">Încă nu există greșeli suficient de vechi (minimum 3 zile) pentru test.</p>
          ) : (
            <button className="btn-primary" onClick={startQuiz} disabled={busy || !hasOpenRouterKey()}>
              <Icon name={busy ? 'loader' : 'flask'} className={busy ? 'icon-spin' : undefined} />{busy ? 'Se pregătește…' : thisWeekDone ? 'Refă testul săptămânii' : `Începe testul (${eligible.length} probleme)`}
            </button>
          )}
        </>
      )}
      {items && (
        <>
          <p className="tiny" style={{ fontWeight: 700 }}>Problema {idx + 1}/{items.length}</p>
          <p style={{ fontSize: '1.05rem' }}>{items[idx].cueRo}</p>
          <p className="tiny">Spune propoziția în engleză:</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Răspunsul tău în engleză…" onKeyDown={(e) => e.key === 'Enter' && submit(answer)} />
            <button className={recording ? 'btn-danger' : ''} onClick={mic} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
          </div>
          <div className="btn-row">
            <button className="btn-primary" onClick={() => submit(answer)} disabled={!answer.trim()}>Trimite</button>
            <button className="btn-ghost" onClick={() => setItems(null)}>Renunț</button>
          </div>
        </>
      )}
      {saved && (
        <>
          <p style={{ fontWeight: 700 }}>Rezultat: {saved.score}/100</p>
          {saved.items.map((it, i) => (
            <p key={i} className="tiny" style={{ margin: '4px 0' }}>
              {it.ok ? '✓' : '✗'} {it.cueRo}<br />
              <span style={{ opacity: 0.8 }}>Ai spus: „{it.saidEn}"</span>
              {!it.ok && <> · corect: <strong>{it.expectedEn}</strong></>}
            </p>
          ))}
          <button className="btn-ghost" onClick={() => setSaved(null)}>Închide</button>
        </>
      )}
      {last && prev && prev !== last && (
        <p className="tiny" style={{ marginTop: 8 }}>
          <Icon name="barChart" size={15} /> Săptămâna trecută vs. acum: <strong>{prev.score}</strong> → <strong>{last.score}</strong>
          {last.score > prev.score ? <> — progres real! <Icon name="party" size={15} /></> : last.score < prev.score ? ' — mai lucrăm.' : ' — constant.'}
          {(() => {
            const repeat = last.items.filter((it) => prev.items.some((p2) => p2.mistakeId === it.mistakeId));
            const improved = repeat.filter((it) => it.ok && !prev.items.find((p2) => p2.mistakeId === it.mistakeId)!.ok).length;
            return repeat.length > 0 ? ` Pe aceleași probleme: ${improved}/${repeat.length} rezolvate acum față de data trecută.` : '';
          })()}
        </p>
      )}
      {history.length > 0 && !saved && (
        <p className="tiny" style={{ marginTop: 8 }}>
          Istoric: {history.slice(-6).map((h) => `${h.weekId.slice(5)}: ${h.score}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
