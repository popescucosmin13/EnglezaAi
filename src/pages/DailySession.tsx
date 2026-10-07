// Sesiunea zilnică ghidată (§9): încălzire → recapitulare activă → microlecție →
// conversație principală → corectare (max 3) → provocare finală. Durata se scalează după obiectivul zilnic.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile, DailyPlan, Microlesson, Utterance, Session, SessionReport, AnalyzedError } from '../types';
import { getProfile, savePlan, updateActivity, addXp, getMistakes, getPronResults, getMemory, getCachedLesson, cacheLesson, getSessions, saveSession, todayStr } from '../db/db';
import { SOUND_LABELS } from '../logic/pron';
import { getOrCreateDailyPlan, targetExpressionsForToday, formatMemoryForPrompt } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import MirrorModal from '../components/MirrorModal';
import TimeUpModal from '../components/TimeUpModal';
import ReportView from '../components/ReportView';
import { DIFFICULTY_MODES, ROLEPLAY_SCENARIOS, IT_TRACK, WORLDS } from '../content';
import { chatJson } from '../api/openrouter';
import { buildMicrolessonPrompt, isMicrolessonShape } from '../prompts';
import { speak } from '../audio/tts';
import { on, emit } from '../events';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import TutorSessionHeader from '../components/TutorSessionHeader';
import { TappableText } from '../components/TappableText';
import { useAccess } from '../access/AccessContext';

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
    const draft = JSON.parse(localStorage.getItem(DAILY_UI_DRAFT_KEY) || 'null') as DailyUiDraft | null;
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
  return 'Casual conversation adapted to the learner\'s goals.';
}

export default function DailySession() {
  const navigate = useNavigate();
  const access = useAccess();
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
      const p = await getProfile();
      const dailyPlan = await getOrCreateDailyPlan();
      // memoria pe termen lung: profesorul variază subiectele și continuă firele deschise
      await getMemory().then((m) => setMemoryContext(formatMemoryForPrompt(m))).catch(() => {});
      const uiDraft = readDailyUiDraft(dailyPlan.date);
      if (uiDraft) {
        setPhaseIdx(uiDraft.phaseIdx);
        setPhaseElapsed(uiDraft.phaseElapsed);
        setLesson(uiDraft.lesson);
      }
      setProfile(p);
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
    try { localStorage.setItem(DAILY_UI_DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage indisponibil */ }
  }, [plan, phaseIdx, phaseElapsed, lesson]);

  // dacă rămânem pe ecranul de rezultat, raportul apărut în fundal se aplică live, fără reîncărcare
  useEffect(() => on('engleza-report-ready', (id) => {
    setResult((r) => {
      if (!r || r.session.id !== id || r.session.reportStatus !== 'pending') return r;
      void getSessions().then((sessions) => {
        const updated = sessions.find((s) => s.id === id);
        if (updated) setResult({ session: updated, report: updated.report });
      });
      return r;
    });
  }), []);

  // raportul afișat direct aici (fără să treci prin Progres → Istoric) se marchează „văzut",
  // altfel notificarea de „raport nou" ar rămâne aprinsă degeaba
  useEffect(() => {
    if (result?.session.reportStatus === 'ready' && !result.session.reportSeen) {
      const seen = { ...result.session, reportSeen: true };
      setResult({ session: seen, report: seen.report });
      void saveSession(seen).catch(() => {});
      emit('engleza-report-seen', seen.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.session.id, result?.session.reportStatus]);

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

  // cronometrul fazei
  useEffect(() => {
    if (!plan || phaseIdx >= PHASES.length || alreadyDone) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setPhaseElapsed((e) => e + 1);
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
    const p = PHASES[next];
    if (p.id === 'recap') {
      const mistakes = await getMistakes();
      const old = mistakes.filter((m) => m.status !== 'mastered').slice(0, 2);
      // închide bucla de pronunție: cuvintele rostite greșit recent revin obligatoriu în recapitulare
      const pron = await getPronResults().catch(() => []);
      const badWords = [...new Set(pron.slice(-30).flatMap((r) => r.wordScores.filter((w) => w.score < 60).map((w) => w.word)))].slice(0, 3);
      chat.setPhase(
        `ACTIVE RECAP (3 min): make the learner USE previously learned material. Steer so they need: the target expressions, and correct forms of these past mistakes: ${old.map((m) => `"${m.corrected}"`).join(', ') || 'their common structures'}. Ask questions whose natural answers require them.${badWords.length > 0 ? ` Also steer the conversation so the learner must SAY these previously mispronounced words: ${badWords.join(', ')}.` : ''}`
      );
      await chat.aiTurn('(Move to the active recap phase now — transition naturally with your next question.)');
    } else if (p.id === 'lesson') {
      await loadLesson();
    } else if (p.id === 'main') {
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
    } else if (p.id === 'correction') {
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
    } else if (p.id === 'challenge') {
      chat.setPhase(
        'FINAL CHALLENGE (2 min): ask the learner to redo a part of today\'s conversation using the corrected forms. Pick a moment where they made a mistake, set the scene again, and let them retry. Acknowledge improvement.'
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
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(lesson.voiceExercise));
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
    if (t.analysis) { setMirrorTurn(t); return; }
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
      localStorage.removeItem(DAILY_UI_DRAFT_KEY);
      chat.clearSavedDraft();
      navigate('/');
      return;
    }
    finishing.current = true;
    try {
      const r = await chat.finish({ withReport: access.isPro });
      localStorage.removeItem(DAILY_UI_DRAFT_KEY);
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
      <div className="page">
        {loadError ? (
          <div className="error-banner">
            Nu am putut pregăti sesiunea: {loadError}
            <div className="btn-row"><button onClick={loadPlan}>Reîncearcă</button></div>
          </div>
        ) : (
          <p><span className="spinner" /> Se pregătește sesiunea…</p>
        )}
      </div>
    );
  }

  if (alreadyDone) {
    return (
      <div className="page">
        <h1><Icon name="checkCircle" size={24} />Sesiunea zilnică e finalizată</h1>
        <div className="card">
          <p className="muted">
            Ai terminat deja lecția de azi — bravo! Poți redeschide oricând raportul complet de azi cu butonul de mai jos.
            Mâine primești un plan nou.
          </p>
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={openTodayReport} disabled={reopening}>
            {reopening ? <><span className="spinner" /> Se încarcă…</> : 'Vezi raportul de azi'}
          </button>
          <button onClick={() => navigate('/')}>Înapoi acasă</button>
          <button onClick={() => navigate('/progress')}>Vezi progresul</button>
          {access.isPro ? <button className="btn-ghost" onClick={() => setExtraSession(true)}>Mai vreau o sesiune azi</button> : null}
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="page">
        <h1><Icon name="checkCircle" size={24} />Sesiunea zilei — gata!</h1>
        {result.session.reportStatus === 'pending' && (
          <div className="info-banner">
            <Icon name="loader" size={16} className="icon-spin" /> Raportul complet (greșeli, exerciții,
            scor) se generează încă — poți pleca oricând, te anunțăm în Progres → Istoric sesiuni
            când e gata. Dacă rămâi pe acest ecran, apare automat.
          </div>
        )}
        <ReportView session={result.session} report={result.report} />
        <div className="btn-row">
          <button className="btn-primary" onClick={() => navigate('/')}>Înapoi acasă</button>
        </div>
      </div>
    );
  }

  const timeLeft = Math.max(0, phaseDurationSec - phaseElapsed);
  const overtime = phaseElapsed >= phaseDurationSec;

  return (
      <div className="page chat tutor-session-page">
      {chat.resumedDraft && <div className="info-banner"><Icon name="undo" size={16} /> Lecția a fost reluată de unde ai rămas.</div>}
      <TutorSessionHeader
        title={phase.titleRo}
        stepLabel={`${phaseIdx + 1} din ${PHASES.length}`}
        detail={`${plan.grammarFocusLabel} · ${plan.conversationScenarioTitle}`}
        timeLabel={`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
        currentStep={phaseIdx + 1}
        totalSteps={PHASES.length}
        actionLabel={phaseIdx === PHASES.length - 1 ? 'Încheie' : overtime ? 'Continuă' : 'Următoarea'}
        onAction={nextPhase}
        onBack={() => navigate('/')}
        disabled={chat.busy === 'ending'}
      />

      {phase.id === 'lesson' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lessonBusy && <p><span className="spinner" /> Se generează microlecția…</p>}
          {!lessonBusy && !lesson && (
            <div className="card">
              <p className="muted">Microlecția nu s-a putut genera — poți trece direct la conversație.</p>
            </div>
          )}
          {lesson && (
            <>
              <div className="card">
                <span className="badge">Regula zilei</span>
                <h3>{lesson.rule}</h3>
                <p className="muted">{lesson.explanationRo}</p>
              </div>
              <div className="card">
                <h3>Exemple</h3>
                {lesson.examples.map((ex, i) => (
                  <p key={i} style={{ margin: '6px 0' }}>
                    <strong>{ex.en}</strong>
                    <br />
                    <span className="tiny">{ex.ro}</span>
                    <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(ex.en, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button>
                  </p>
                ))}
                <h3>Din contextul tău</h3>
                {lesson.personalExamples.map((ex, i) => (
                  <p key={i} style={{ margin: '6px 0' }}>
                    {ex} <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(ex, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button>
                  </p>
                ))}
              </div>
              <div className="card">
                <h3>Expresiile-țintă</h3>
                <div className="chip-row">
                  {lesson.targetPhrases.map((p, i) => (
                    <span key={i} className="chip selected">{p}</span>
                  ))}
                </div>
                <h3><Icon name="mic" />Exercițiu vocal — rostește:</h3>
                <p style={{ fontSize: '1.05rem' }}>{lesson.voiceExercise}</p>
                <div className="btn-row">
                  <button className="btn-ghost" onClick={() => speak(lesson.voiceExercise, 0.9)}><Icon name="volume" />Ascultă</button>
                  <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={voiceExercise}>
                    <Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Oprește' : 'Rostește'}
                  </button>
                  {voiceScore != null && (
                    <span className={voiceScore >= 80 ? 'ws-good' : 'ws-mid'} style={{ padding: '4px 10px', borderRadius: 10 }}>
                      {voiceScore}%
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : phase.id === 'correction' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {correctionBusy ? (
            <div className="card"><p><span className="spinner" /> Se analizează greșelile de azi…</p></div>
          ) : (
          <>
          <p className="muted">Cele mai importante {topErrors.length} greșeli de azi:</p>
          {topErrors.length === 0 && <div className="card"><p><Icon name="party" size={17} /> Nicio greșeală majoră până acum. Excelent!</p></div>}
          {topErrors.map((e, i) => (
            <div key={i} className="card">
              <div className="mirror-row mirror-said"><span className="lbl">Ai spus</span>{e.originalFragment}</div>
              <div className="mirror-row mirror-correct">
                <span className="lbl">Corect</span><TappableText text={e.correctFragment} />
                <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(e.correctFragment, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
              <p className="tiny">{e.explanationRo}</p>
            </div>
          ))}
          </>
          )}
        </div>
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
          onPhraseLearned={(p) => chat.addTarget(p)}
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
    </div>
  );
}
