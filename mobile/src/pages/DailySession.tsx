// Sesiunea zilnică ghidată (§9): încălzire → recapitulare activă → microlecție →
// conversație principală → corectare (max 3) → provocare finală. Durata se scalează după obiectivul zilnic.
// Portat de pe web: draft UI pe storage, timer pe AppState, navigare expo-router.

import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import type { Profile, DailyPlan, Microlesson, Utterance, Session, SessionReport, AnalyzedError } from '../types';
import { getProfile, savePlan, updateActivity, addXp, getMistakes, getPronResults, getMemory, getCachedLesson, cacheLesson, getSessions, todayStr } from '../db/db';
import { SOUND_LABELS } from '../logic/pron';
import { getOrCreateDailyPlan, targetExpressionsForToday, formatMemoryForPrompt } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import TutorSessionHeader from '../components/TutorSessionHeader';
import MirrorModal from '../components/MirrorModal';
import TimeUpModal from '../components/TimeUpModal';
import ReportView from '../components/ReportView';
import { DIFFICULTY_MODES, ROLEPLAY_SCENARIOS, IT_TRACK, WORLDS } from '../content';
import { chatJson } from '../api/openrouter';
import { buildMicrolessonPrompt, isMicrolessonShape } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import { TappableText } from '../components/TappableText';
import { storage } from '../storage';
import { Screen, H1, H3, Card, Banner, Button, ButtonRow, Chip, ChipRow, Tiny, Muted, P, Pill, Spinner, IconButton } from '../ui';
import { usePalette } from '../theme';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';

type Phase = 'warmup' | 'recap' | 'lesson' | 'main' | 'correction' | 'challenge' | 'done';
const PHASES: { id: Phase; titleRo: string; share: number; chat: boolean }[] = [
  { id: 'warmup', titleRo: 'Încălzire', share: 2 / 20, chat: true },
  { id: 'recap', titleRo: 'Recapitulare activă', share: 3 / 20, chat: true },
  { id: 'lesson', titleRo: 'Microlecție', share: 3 / 20, chat: false },
  { id: 'main', titleRo: 'Conversația principală', share: 8 / 20, chat: true },
  { id: 'correction', titleRo: 'Corectare', share: 2 / 20, chat: false },
  { id: 'challenge', titleRo: 'Provocare finală', share: 2 / 20, chat: true },
];

const DAILY_UI_DRAFT_KEY = `englezaai.daily-ui.${todayStr()}`;

interface DailyUiDraft {
  date: string;
  phaseIdx: number;
  phaseElapsed: number;
  lesson: Microlesson | null;
}

function readDailyUiDraft(date: string): DailyUiDraft | null {
  try {
    const draft = JSON.parse(storage.getItem(DAILY_UI_DRAFT_KEY) || 'null') as DailyUiDraft | null;
    return draft?.date === date && draft.phaseIdx >= 0 && draft.phaseIdx < PHASES.length ? draft : null;
  } catch {
    return null;
  }
}

function scenarioPersona(id: string): string {
  const rp = ROLEPLAY_SCENARIOS.find((s) => s.id === id);
  if (rp) return rp.persona;
  const it = IT_TRACK.find((m) => m.id === id);
  if (it) return it.prompt;
  for (const w of WORLDS) for (const t of w.topics) if (`${w.id}_${t.id}` === id) return t.prompt;
  return "Casual conversation adapted to the learner's goals.";
}

export default function DailySession() {
  const p = usePalette();
  const access = useRevenueCat();
  useKeepAwake();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [lesson, setLesson] = useState<Microlesson | null>(null);
  const [lessonBusy, setLessonBusy] = useState(false);
  const [voiceScore, setVoiceScore] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [mirrorTurn, setMirrorTurn] = useState<Utterance | null>(null);
  const [analyzingTs, setAnalyzingTs] = useState<number | null>(null);
  const [result, setResult] = useState<{ session: Session; report?: SessionReport } | null>(null);
  const [topErrors, setTopErrors] = useState<AnalyzedError[]>([]);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const recorder = useRef(new Recorder());
  const started = useRef(false);
  const finishing = useRef(false);
  const [timeUpPrompt, setTimeUpPrompt] = useState(false);
  // Planul de azi e deja finalizat — arătăm asta explicit; utilizatorul poate porni voluntar încă o sesiune.
  const [extraSession, setExtraSession] = useState(false);
  const timeUpSnoozedAt = useRef(-1); // phaseElapsed la ultima amânare; -1 = neîntrebat încă
  const [memoryContext, setMemoryContext] = useState('');

  const difficulty = DIFFICULTY_MODES.find((d) => d.id === (profile?.aiSpeed === 'lent' ? 'patient' : profile?.aiSpeed === 'provocare' ? 'intensive' : 'normal')) ?? DIFFICULTY_MODES[1];

  const chat = useVoiceChat({
    type: 'daily',
    scenarioTitle: 'Sesiunea zilnică',
    profile: profile ?? ({} as Profile),
    difficulty,
    correctionMode: profile?.correctionMode ?? 'immediate',
    grammarFocus: plan?.grammarFocusLabel,
    resumeKey: `daily-${todayStr()}`,
    memoryContext,
  });

  // După finalizare phaseIdx devine PHASES.length; fără clamp, phase.share ar arunca
  // TypeError chiar în randarea ecranului de raport (ecran negru).
  const phase = PHASES[phaseIdx] ?? PHASES[PHASES.length - 1];
  const targetMinutes = plan ? (access.isPro ? plan.targetMinutes : Math.min(5, plan.targetMinutes)) : 5;
  const phaseDurationSec = plan ? Math.max(access.isPro ? 60 : 30, Math.round(phase.share * targetMinutes * 60)) : 60;

  const [loadError, setLoadError] = useState('');

  async function loadPlan() {
    setLoadError('');
    try {
      const prof = await getProfile();
      const dailyPlan = await getOrCreateDailyPlan();
      // memoria pe termen lung: profesorul variază subiectele și continuă firele deschise
      await getMemory().then((m) => setMemoryContext(formatMemoryForPrompt(m))).catch(() => {});
      const uiDraft = readDailyUiDraft(dailyPlan.date);
      if (uiDraft) {
        setPhaseIdx(uiDraft.phaseIdx);
        setPhaseElapsed(uiDraft.phaseElapsed);
        setLesson(uiDraft.lesson);
      }
      setProfile(prof);
      setPlan(dailyPlan);
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }
  useEffect(() => {
    void loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!plan || phaseIdx >= PHASES.length) return;
    const draft: DailyUiDraft = { date: plan.date, phaseIdx, phaseElapsed, lesson };
    storage.setItem(DAILY_UI_DRAFT_KEY, JSON.stringify(draft));
  }, [plan, phaseIdx, phaseElapsed, lesson]);

  const alreadyDone = Boolean(plan?.completed) && !extraSession && !result;

  // pornirea fazei 1 după încărcare
  useEffect(() => {
    if (!profile || !plan || started.current || alreadyDone) return;
    started.current = true;
    (async () => {
      if (!chat.hasSavedDraft()) {
        const targets = await targetExpressionsForToday().catch(() => []);
        chat.setTargets(targets);
        chat.setPhase(
          "WARM-UP (2 min): ask about the learner's day — what they did, what's coming up. Light and friendly. One short question at a time."
        );
      }
      await chat.start('The daily session starts with the warm-up. Greet the learner and ask about their day. 1-2 sentences.');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, plan, extraSession]);

  // cronometrul fazei — nu curge cât timp aplicația e în fundal (echivalentul visibilityState)
  useEffect(() => {
    if (!plan || phaseIdx >= PHASES.length || alreadyDone) return;
    const t = setInterval(() => {
      if (AppState.currentState === 'active') setPhaseElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [plan, phaseIdx, alreadyDone]);

  // popup „timpul a expirat” — apare doar între replici, după ce profesorul/elevul termină
  useEffect(() => {
    if (!plan || phaseIdx >= PHASES.length || alreadyDone) return;
    const overtime = phaseElapsed >= phaseDurationSec;
    const snoozed = timeUpSnoozedAt.current >= 0 && phaseElapsed < timeUpSnoozedAt.current + 120;
    const wantPrompt = overtime && !snoozed && !timeUpPrompt;
    // cât așteptăm decizia, hands-free nu repornește microfonul
    chat.suspendAutoRecord(wantPrompt || timeUpPrompt);
    if (wantPrompt && chat.busy === 'idle') setTimeUpPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseElapsed, chat.busy, timeUpPrompt, plan, phaseIdx, phaseDurationSec]);

  function stayInPhase() {
    timeUpSnoozedAt.current = phaseElapsed; // reîntrebăm după încă 2 minute
    setTimeUpPrompt(false);
    chat.suspendAutoRecord(false);
    chat.resumeListening();
  }

  function advanceFromPrompt() {
    setTimeUpPrompt(false);
    chat.suspendAutoRecord(false);
    void nextPhase();
  }

  async function nextPhase() {
    const next = phaseIdx + 1;
    setTimeUpPrompt(false);
    timeUpSnoozedAt.current = -1;
    if (next >= PHASES.length) return endSession();
    setPhaseIdx(next);
    setPhaseElapsed(0);
    const ph = PHASES[next];
    if (ph.id === 'recap') {
      const mistakes = await getMistakes();
      const old = mistakes.filter((m) => m.status !== 'mastered').slice(0, 2);
      // închide bucla de pronunție: cuvintele rostite greșit recent revin obligatoriu în recapitulare
      const pron = await getPronResults().catch(() => []);
      const badWords = [...new Set(pron.slice(-30).flatMap((r) => r.wordScores.filter((w) => w.score < 60).map((w) => w.word)))].slice(0, 3);
      chat.setPhase(
        `ACTIVE RECAP (3 min): make the learner USE previously learned material. Steer so they need: the target expressions, and correct forms of these past mistakes: ${old.map((m) => `"${m.corrected}"`).join(', ') || 'their common structures'}. Ask questions whose natural answers require them.${badWords.length > 0 ? ` Also steer the conversation so the learner must SAY these previously mispronounced words: ${badWords.join(', ')}.` : ''}`
      );
      await chat.aiTurn('(Move to the active recap phase now — transition naturally with your next question.)');
    } else if (ph.id === 'lesson') {
      await loadLesson();
    } else if (ph.id === 'main') {
      // situația salvată de utilizator („pentru mâine") are prioritate ca scenariu real (§P1)
      const persona = plan!.situationText
        ? `The learner saved this real situation from their life/work to practice: "${plan!.situationText}". Recreate it as a realistic roleplay: you play the other party (colleague, client, manager...). Make the learner handle the situation in English, properly and completely.`
        : scenarioPersona(plan!.conversationScenario);
      const soundLabel = SOUND_LABELS[plan!.pronunciationFocus] ?? plan!.pronunciationFocus;
      chat.setPhase(
        `MAIN CONVERSATION (8 min) — scenario: ${persona}\nStay in this scenario. Force the grammar focus of the day (${plan!.grammarFocusLabel}) and the target phrases from the microlesson. Pronunciation focus of the day: the sound "${soundLabel}" — naturally include words containing it so the learner practices it.`
      );
      if (lesson) chat.setTargets(lesson.targetPhrases);
      await chat.aiTurn(`(Move to the main conversation now: start the scenario "${plan!.conversationScenarioTitle}" naturally.)`);
    } else if (ph.id === 'correction') {
      // Un singur batch economic: evaluator AI + LanguageTool în paralel, apoi max 3 greșeli.
      setCorrectionBusy(true);
      try {
        const analyzed = await chat.analyzePending();
        const errs = analyzed.filter((t) => t.role === 'user').flatMap((t) => t.analysis?.errors ?? []);
        const rank = (e: AnalyzedError) => (e.severity === 'high' ? 3 : e.severity === 'medium' ? 2 : 1);
        setTopErrors([...errs].sort((a, b) => rank(b) - rank(a)).slice(0, 3));
      } finally {
        setCorrectionBusy(false);
      }
    } else if (ph.id === 'challenge') {
      chat.setPhase(
        "FINAL CHALLENGE (2 min): ask the learner to redo a part of today's conversation using the corrected forms. Pick a moment where they made a mistake, set the scene again, and let them retry. Acknowledge improvement."
      );
      await chat.aiTurn('(Move to the final challenge now: ask the learner to redo part of the conversation with the correct forms.)');
    }
  }

  async function loadLesson() {
    if (!plan || !profile) return;
    if (plan.microlesson) {
      setLesson(plan.microlesson);
      return;
    }
    setLessonBusy(true);
    try {
      // cache Firestore per focus gramatical: aceeași lecție nu se regenerează în altă zi (economie de tokeni)
      const cacheKey = `daily-${plan.grammarFocus}`;
      let l = await getCachedLesson(cacheKey).catch(() => undefined);
      if (!l) {
        const mistakes = (await getMistakes()).filter((m) => m.category === plan.grammarFocus);
        l = await chatJson<Microlesson>([{ role: 'user', content: buildMicrolessonPrompt(profile, plan.grammarFocusLabel, mistakes) }], {
          feature: 'microlesson_daily', maxTokens: 1600, validate: isMicrolessonShape,
        });
        await cacheLesson(cacheKey, l).catch(() => {});
      }
      setLesson(l);
      const updated = { ...plan, microlesson: l };
      setPlan(updated);
      await savePlan(updated);
    } catch (e) {
      console.warn('Microlecția a eșuat:', e);
      setLesson(null);
    }
    setLessonBusy(false);
  }

  async function voiceExercise() {
    if (!lesson) return;
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(lesson.voiceExercise));
        await audio.dispose();
        const res = sttDiffAssessment(lesson.voiceExercise, text);
        setVoiceScore(res.accuracyScore);
        await addXp(res.accuracyScore >= 80 ? 12 : 6);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  /** Mirror la cerere: analizează doar replica apăsată, nu toată conversația (§ optimizare tokeni). */
  async function openMirror(t: Utterance) {
    if (t.analysis) {
      setMirrorTurn(t);
      return;
    }
    if (analyzingTs != null) return;
    setAnalyzingTs(t.ts);
    const analyzed = await chat.analyzeTurnOnDemand(t.ts).catch(() => undefined);
    setAnalyzingTs(null);
    if (analyzed) setMirrorTurn(analyzed);
  }

  // Raportul zilei rămâne re-deschizabil: îl reîncărcăm din sesiunea salvată azi (§ nu se mai pierde).
  async function openTodayReport() {
    setReopening(true);
    try {
      const sessions = await getSessions();
      const s = [...sessions].reverse().find((x) => x.type === 'daily' && todayStr(new Date(x.startedAt)) === todayStr());
      if (s) setResult({ session: s, report: s.report });
    } catch (e) {
      console.warn('Nu am putut încărca raportul de azi:', e);
    }
    setReopening(false);
  }

  async function endSession() {
    if (finishing.current) return;
    // Fără nicio replică vorbită nu există ce raporta: un ecran plin de zerouri ar fi derutant.
    if (!chat.turns.some((t) => t.role === 'user')) {
      storage.removeItem(DAILY_UI_DRAFT_KEY);
      chat.clearSavedDraft();
      router.replace('/');
      return;
    }
    finishing.current = true;
    try {
      const r = await chat.finish({ withReport: access.isPro });
      storage.removeItem(DAILY_UI_DRAFT_KEY);
      if (plan) {
        // marcarea planului/activității nu are voie să blocheze afișarea raportului
        await savePlan({ ...plan, completed: true }).catch((e) => console.warn('savePlan a eșuat:', e));
        await updateActivity({ lessonDone: true }).catch((e) => console.warn('updateActivity a eșuat:', e));
        await addXp(20).catch(() => {});
      }
      setResult(r);
      setPhaseIdx(PHASES.length); // done
    } catch (e) {
      console.warn('Finalizarea a eșuat:', e);
      finishing.current = false; // butonul rămâne funcțional pentru o nouă încercare
    }
  }

  if (!profile || !plan) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Banner kind="error">Nu am putut pregăti sesiunea: {loadError}</Banner>
            <ButtonRow>
              <Button title="Reîncearcă" onPress={loadPlan} />
            </ButtonRow>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <Spinner />
            <Muted>Se pregătește sesiunea…</Muted>
          </View>
        )}
      </Screen>
    );
  }

  if (alreadyDone) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkCircle" size={24} color={p.success} />
          <H1 style={{ marginVertical: 0, flexShrink: 1 }}>Sesiunea zilnică e finalizată</H1>
        </View>
        <Card>
          <Muted>
            Ai terminat deja lecția de azi — bravo! Poți redeschide oricând raportul complet de azi cu butonul de mai jos.
            Mâine primești un plan nou.
          </Muted>
        </Card>
        <ButtonRow>
          <Button title={reopening ? 'Se încarcă…' : 'Vezi raportul de azi'} variant="primary" onPress={openTodayReport} disabled={reopening} />
          <Button title="Înapoi acasă" onPress={() => router.replace('/')} />
          <Button title="Vezi progresul" onPress={() => router.replace('/(tabs)/progress')} />
          {access.isPro ? <Button title="Mai vreau o sesiune azi" variant="ghost" onPress={() => setExtraSession(true)} /> : null}
        </ButtonRow>
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkCircle" size={24} color={p.success} />
          <H1 style={{ marginVertical: 0, flexShrink: 1 }}>Sesiunea zilei — gata!</H1>
        </View>
        <ReportView session={result.session} report={result.report} />
        <ButtonRow>
          <Button title="Înapoi acasă" variant="primary" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  const timeLeft = Math.max(0, phaseDurationSec - phaseElapsed);
  const overtime = phaseElapsed >= phaseDurationSec;

  return (
    <Screen scroll={false} style={{ width: '100%', maxWidth: 430, alignSelf: 'center' }}>
      {chat.resumedDraft && <Banner kind="info">Lecția a fost reluată de unde ai rămas.</Banner>}
      <TutorSessionHeader
        title={phase.titleRo}
        stepLabel={`${phaseIdx + 1} din ${PHASES.length}`}
        detail={`${plan.grammarFocusLabel} · ${plan.conversationScenarioTitle}`}
        timeLabel={`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
        currentStep={phaseIdx + 1}
        totalSteps={PHASES.length}
        actionLabel={phaseIdx === PHASES.length - 1 ? 'Încheie' : overtime ? 'Continuă' : 'Următoarea'}
        onAction={nextPhase}
        onBack={() => router.replace('/')}
        disabled={chat.busy === 'ending'}
      />

      {phase.id === 'lesson' ? (
        <ScrollView style={{ flex: 1 }}>
          {lessonBusy && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Spinner />
              <Muted>Se generează microlecția…</Muted>
            </View>
          )}
          {!lessonBusy && !lesson && (
            <Card>
              <Muted>Microlecția nu s-a putut genera — poți trece direct la conversație.</Muted>
            </Card>
          )}
          {lesson && (
            <>
              <Card>
                <Pill kind="badge">Regula zilei</Pill>
                <H3>{lesson.rule}</H3>
                <Muted>{lesson.explanationRo}</Muted>
              </Card>
              <Card>
                <H3 style={{ marginTop: 0 }}>Exemple</H3>
                {lesson.examples.map((ex, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: p.ink, fontSize: 15 }}>{ex.en}</Text>
                      <Tiny>{ex.ro}</Tiny>
                    </View>
                    <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(ex.en, 0.92)} />
                  </View>
                ))}
                <H3>Din contextul tău</H3>
                {lesson.personalExamples.map((ex, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
                    <Text style={{ flex: 1, color: p.ink, fontSize: 15 }}>{ex}</Text>
                    <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(ex, 0.92)} />
                  </View>
                ))}
              </Card>
              <Card>
                <H3 style={{ marginTop: 0 }}>Expresiile-țintă</H3>
                <ChipRow>
                  {lesson.targetPhrases.map((phrase, i) => (
                    <Chip key={i} label={phrase} selected />
                  ))}
                </ChipRow>
                <H3>Exercițiu vocal — rostește:</H3>
                <P style={{ fontSize: 17 }}>{lesson.voiceExercise}</P>
                <ButtonRow style={{ marginBottom: 0 }}>
                  <Button title="Ascultă" variant="ghost" icon="volume" onPress={() => void speak(lesson.voiceExercise, 0.9)} />
                  <Button
                    title={recording ? 'Oprește' : 'Rostește'}
                    variant={recording ? 'danger' : 'primary'}
                    icon={recording ? 'stop' : 'mic'}
                    onPress={voiceExercise}
                  />
                  {voiceScore != null && (
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        backgroundColor: voiceScore >= 80 ? p.successSoft : p.warnSoft,
                      }}
                    >
                      <Text style={{ fontWeight: '700', color: voiceScore >= 80 ? p.success : p.warnInk }}>{voiceScore}%</Text>
                    </View>
                  )}
                </ButtonRow>
              </Card>
            </>
          )}
        </ScrollView>
      ) : phase.id === 'correction' ? (
        <ScrollView style={{ flex: 1 }}>
          {correctionBusy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Spinner />
              <Muted>Se analizează greșelile de azi…</Muted>
            </View>
          ) : (
          <>
          <Muted>Cele mai importante {topErrors.length} greșeli de azi:</Muted>
          {topErrors.length === 0 && (
            <Card>
              <P>Nicio greșeală majoră până acum. Excelent!</P>
            </Card>
          )}
          {topErrors.map((e, i) => (
            <Card key={i}>
              <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.dangerSoft }}>
                <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
                  Ai spus
                </Text>
                <Text style={{ color: p.ink, fontSize: 15.5 }}>{e.originalFragment}</Text>
              </View>
              <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.successSoft }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
                    Corect
                  </Text>
                  <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(e.correctFragment, 0.9)} />
                </View>
                <TappableText text={e.correctFragment} color={p.ink} style={{ fontSize: 15.5 }} />
              </View>
              <Tiny>{e.explanationRo}</Tiny>
            </Card>
          ))}
          </>
          )}
        </ScrollView>
      ) : (
        <ChatView
          turns={chat.turns}
          busy={chat.busy}
          interim={chat.interim}
          hints={chat.hints}
          error={chat.error}
          onMic={chat.micPress}
          onSend={chat.sendUserText}
          onOpenMirror={openMirror}
          analyzingTs={analyzingTs}
          showMistakeTags={true}
          handsFree={chat.handsFree}
          onToggleHandsFree={() => chat.setHandsFree(!chat.handsFree)}
          profile={profile}
          onPhraseLearned={(phrase) => chat.addTarget(phrase)}
          contextLabel={plan.conversationScenarioTitle}
        />
      )}
      {timeUpPrompt && (
        <TimeUpModal
          stepTitle={phase.titleRo}
          nextLabel={phaseIdx === PHASES.length - 1 ? 'Încheie sesiunea' : 'Pasul următor →'}
          allowStay={access.isPro}
          onStay={stayInPhase}
          onNext={advanceFromPrompt}
        />
      )}
      {mirrorTurn && (
        <MirrorModal
          turn={mirrorTurn}
          profile={profile}
          contextText={chat.turns.slice(-6).map((t) => `${t.role}: ${t.text}`).join('\n')}
          onClose={() => setMirrorTurn(null)}
        />
      )}
    </Screen>
  );
}
