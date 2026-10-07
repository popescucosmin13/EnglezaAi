// Vorbește: tipurile de conversații (§10), lumi (§19), traseul IT (§20),
// moduri de dificultate (§23), „Explică-mi ziua" (§10.7), chat + Mirror + raport.

import { useEffect, useRef, useState } from 'react';
import type { Profile, Utterance, Session, SessionReport, SessionType, CorrectionMode, Cefr } from '../types';
import { defaultProfile, getProfile, getMemory, getSessions, saveSession } from '../db/db';
import { on, emit } from '../events';
import { formatMemoryForPrompt } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import MirrorModal from '../components/MirrorModal';
import ReportView from '../components/ReportView';
import { ROLEPLAY_SCENARIOS, WORLDS, IT_TRACK, DIFFICULTY_MODES, type DifficultyDef } from '../content';
import { targetExpressionsForToday, addVocabItem } from '../logic/engine';
import { chatJson } from '../api/openrouter';
import { buildMyDayPrompt } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { hasOpenRouterKey } from '../settings';
import { Icon, type IconName } from '../components/Icon';
import TutorSessionHeader from '../components/TutorSessionHeader';

interface ChatSetup {
  type: SessionType;
  scenarioId?: string;
  scenarioTitle?: string;
  scenarioPersona?: string;
  guided?: boolean;
  correctionMode: CorrectionMode;
  targets: string[];
}

const CONVO_TYPES: { type: SessionType; icon: IconName; titleRo: string; descRo: string }[] = [
  { type: 'free', icon: 'message', titleRo: 'Conversație liberă', descRo: 'Vorbești despre orice; AI-ul pune întrebări scurte' },
  { type: 'guided', icon: 'compass', titleRo: 'Conversație ghidată', descRo: 'Primești idei de răspuns și expresii utile' },
  { type: 'nohelp', icon: 'ban', titleRo: 'Fără ajutor', descRo: 'Fără sugestii sau corecturi — feedback la final' },
  { type: 'rapid', icon: 'zap', titleRo: 'Conversație rapidă', descRo: 'Întrebări neașteptate, reduci timpul de gândire' },
  { type: 'professional', icon: 'briefcase', titleRo: 'Mod profesional', descRo: 'Ședințe, clienți, incidente — ton formal' },
  { type: 'myday', icon: 'calendar', titleRo: 'Explică-mi ziua', descRo: 'Povestești în română → înveți varianta engleză' },
];

type TalkMenuSection = 'conversations' | 'roleplay' | 'worlds' | 'it';

const DIFFICULTY_ICONS: Record<DifficultyDef['id'], IconName> = {
  patient: 'user',
  normal: 'message',
  intensive: 'flame',
  professional: 'briefcase',
  exam: 'graduation',
};

const TALK_MENU_SECTIONS: { id: TalkMenuSection; label: string; icon: IconName }[] = [
  { id: 'conversations', label: 'Conversații', icon: 'message' },
  { id: 'roleplay', label: 'Jocuri de rol', icon: 'presentation' },
  { id: 'worlds', label: 'Lumi', icon: 'globe' },
  { id: 'it', label: 'Engleză IT', icon: 'laptop' },
];

export default function Talk({ preview = false }: { preview?: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(() => preview ? { ...defaultProfile(), onboarded: true, testDone: true } : null);
  const [view, setView] = useState<'menu' | 'chat' | 'report' | 'myday'>('menu');
  const [setup, setSetup] = useState<ChatSetup | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyDef>(DIFFICULTY_MODES[1]);
  const [openWorld, setOpenWorld] = useState<string | null>(null);
  const [showIT, setShowIT] = useState(false);
  const [menuSection, setMenuSection] = useState<TalkMenuSection>('conversations');
  const [result, setResult] = useState<{ session: Session; report?: SessionReport } | null>(null);
  const [mirrorTurn, setMirrorTurn] = useState<Utterance | null>(null);
  const [examLeft, setExamLeft] = useState<number | null>(null);
  const [memoryContext, setMemoryContext] = useState('');

  useEffect(() => {
    if (preview) return;
    getProfile().then((p) => setProfile(p));
    getMemory().then((m) => setMemoryContext(formatMemoryForPrompt(m))).catch(() => {});
  }, [preview]);

  // dacă rămânem pe ecranul de raport, raportul apărut în fundal se aplică live, fără reîncărcare
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

  // raportul afișat direct aici se marchează „văzut", altfel notificarea de „raport nou" rămâne aprinsă degeaba
  useEffect(() => {
    if (result?.session.reportStatus === 'ready' && !result.session.reportSeen) {
      const seen = { ...result.session, reportSeen: true };
      setResult({ session: seen, report: seen.report });
      void saveSession(seen).catch(() => {});
      emit('engleza-report-seen', seen.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.session.id, result?.session.reportStatus]);

  if (!profile) return <div className="page" />;
  if (view === 'chat' && setup) {
    return (
      <ActiveChat
        profile={profile}
        setup={setup}
        memoryContext={memoryContext}
        difficulty={difficulty}
        examLeft={examLeft}
        setExamLeft={setExamLeft}
        onMirror={setMirrorTurn}
        mirrorTurn={mirrorTurn}
        onDone={(r) => {
          setResult(r);
          setView('report');
        }}
        onCancel={() => setView('menu')}
      />
    );
  }
  if (view === 'report' && result) {
    return (
      <div className="page">
        <h1><Icon name="clipboard" size={24} />Raportul sesiunii</h1>
        {result.session.reportStatus === 'pending' && (
          <div className="info-banner">
            <Icon name="loader" size={16} className="icon-spin" /> Raportul complet se generează
            încă — poți pleca oricând, te anunțăm în Progres → Istoric sesiuni când e gata.
          </div>
        )}
        <ReportView session={result.session} report={result.report} />
        <div className="btn-row">
          <button className="btn-primary" onClick={() => setView('menu')}>Înapoi la conversații</button>
        </div>
      </div>
    );
  }
  if (view === 'myday') {
    return <MyDaySetup profile={profile} onStart={(s) => { setSetup(s); setView('chat'); }} onBack={() => setView('menu')} />;
  }

  async function startChat(partial: Omit<ChatSetup, 'correctionMode' | 'targets'>, diffOverride?: DifficultyDef) {
    if (partial.type === 'myday') {
      setView('myday');
      return;
    }
    // Cardul „Mod examen" schimbă dificultatea și pornește sesiunea în același click. setDifficulty e
    // asincron, deci nu ne putem baza pe closure-ul `difficulty` (ar fi cel vechi → examenul rămânea
    // fără cronometru). Folosim dificultatea explicită și sincronizăm și starea pentru ActiveChat.
    const diff = diffOverride ?? difficulty;
    const targets = await targetExpressionsForToday().catch(() => []);
    const noCorrections = partial.type === 'nohelp' || partial.type === 'rapid' || partial.type === 'exam';
    const mode: CorrectionMode = diff.correctionOverride ?? (noCorrections ? 'final' : profile!.correctionMode);
    if (diffOverride) setDifficulty(diffOverride);
    setSetup({ ...partial, correctionMode: mode, targets });
    if (diff.timeLimitMin) setExamLeft(diff.timeLimitMin * 60);
    else setExamLeft(null);
    setView('chat');
  }

  const guidedConversation = CONVO_TYPES.find((item) => item.type === 'guided')!;
  const freeConversation = CONVO_TYPES.find((item) => item.type === 'free')!;
  const rapidConversation = CONVO_TYPES.find((item) => item.type === 'rapid')!;
  const examDifficulty = DIFFICULTY_MODES.find((item) => item.id === 'exam')!;

  const sectionNavigation = (
    <nav className="talk-section-navigation" aria-label="Secțiunile modulului Vorbește">
      {TALK_MENU_SECTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={menuSection === item.id ? 'selected' : ''}
          aria-pressed={menuSection === item.id}
          onClick={() => setMenuSection(item.id)}
        >
          <Icon name={item.icon} size={23} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="page talk-modern">
      <header className="talk-modern-header">
        <Icon name="mic" size={31} />
        <div>
          <h1>Vorbește</h1>
          <p>Ce vrei să exersezi acum?</p>
        </div>
      </header>

      {!hasOpenRouterKey() && <div className="error-banner">Tutorul este temporar indisponibil. Încearcă din nou puțin mai târziu.</div>}

      <section className="talk-difficulty-summary" aria-label="Dificultatea selectată">
        <div>
          <span>Ritm și corectare</span>
          <strong>{difficulty.titleRo}</strong>
          <p>{difficulty.descRo.replace(', ', ' · ')}</p>
        </div>
        <span className="talk-difficulty-adjust" aria-hidden="true"><Icon name="sliders" size={23} /></span>
      </section>

      <div className="talk-difficulty-options" role="group" aria-label="Alege dificultatea">
        {DIFFICULTY_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={difficulty.id === item.id ? 'selected' : ''}
            aria-pressed={difficulty.id === item.id}
            title={item.descRo}
            onClick={() => setDifficulty(item)}
          >
            <Icon name={DIFFICULTY_ICONS[item.id]} size={24} />
            <span>{item.titleRo}</span>
          </button>
        ))}
      </div>

      {menuSection !== 'conversations' && sectionNavigation}

      {menuSection === 'conversations' && (
        <section className="talk-conversation-library">
          <h2 className="talk-content-title">Alege o conversație</h2>

          <div className="talk-guided-feature">
            <span className="talk-feature-icon"><Icon name={guidedConversation.icon} size={31} /></span>
            <div>
              <strong>{guidedConversation.titleRo}</strong>
              <p>Idei de răspuns și expresii utile</p>
            </div>
            <button type="button" className="talk-start-button" onClick={() => startChat({ type: 'guided', guided: true })}>
              Începe <Icon name="arrowUpRight" size={17} />
            </button>
          </div>

          <div className="talk-feature-pair">
            {[freeConversation, rapidConversation].map((item) => (
              <button
                key={item.type}
                type="button"
                className="talk-feature-card"
                onClick={() => startChat({ type: item.type })}
              >
                <span className="talk-feature-icon"><Icon name={item.icon} size={25} /></span>
                <strong>{item.titleRo}</strong>
                <span>{item.descRo}</span>
                <Icon name="arrowUpRight" size={18} className="talk-card-arrow" />
              </button>
            ))}
          </div>

          <h2 className="talk-content-title talk-more-title">Mai multe opțiuni</h2>
          <div className="talk-option-list">
            <button type="button" onClick={() => startChat({ type: 'nohelp' })}>
              <Icon name="ban" size={25} />
              <span><strong>Fără ajutor</strong><small>Fără sugestii sau corecturi — feedback la final</small></span>
              <Icon name="arrowUpRight" size={17} />
            </button>
            <button type="button" onClick={() => startChat({ type: 'professional' })}>
              <Icon name="briefcase" size={25} />
              <span><strong>Mod profesional</strong><small>Ședințe, clienți, incidente — ton formal</small></span>
              <Icon name="arrowUpRight" size={17} />
            </button>
            <button type="button" onClick={() => startChat({ type: 'myday' })}>
              <Icon name="calendar" size={25} />
              <span><strong>Explică-mi ziua</strong><small>Povestești în română → înveți varianta engleză</small></span>
              <Icon name="arrowUpRight" size={17} />
            </button>
            <button type="button" onClick={() => startChat({ type: 'exam', scenarioTitle: 'Mod examen' }, examDifficulty)}>
              <Icon name="graduation" size={25} />
              <span><strong>Mod examen</strong><small>Pregătire pentru examene și certificări</small></span>
              <Icon name="arrowUpRight" size={17} />
            </button>
          </div>

          {sectionNavigation}
        </section>
      )}

      {menuSection === 'roleplay' && (
        <section className="talk-module-section">
          <div className="talk-module-heading"><span>Exersează situații reale</span><h2>Jocuri de rol</h2></div>
          <div className="scenario-grid talk-roleplay-grid">
            {ROLEPLAY_SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                className="scenario-card"
                onClick={() => startChat({
                  type: scenario.professional ? 'professional' : 'roleplay',
                  scenarioId: scenario.id,
                  scenarioTitle: scenario.titleRo,
                  scenarioPersona: scenario.persona,
                })}
              >
                {scenario.professional && <span className="badge">PRO</span>}
                <span className="scenario-icon"><Icon name={scenario.icon} size={27} /></span>
                <strong>{scenario.titleRo}</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {menuSection === 'worlds' && (
        <section className="talk-module-section">
          <div className="talk-module-heading"><span>Conținut potrivit nivelului tău</span><h2>Lumi pe niveluri</h2></div>
          {WORLDS.map((world) => (
            <div key={world.id} className="card talk-world-card">
              <button type="button" onClick={() => setOpenWorld(openWorld === world.id ? null : world.id)}>
                <span><Icon name={world.icon} size={20} /><strong>{world.titleRo}</strong></span>
                <span className="badge soft">{world.level}</span>
                <Icon name={openWorld === world.id ? 'chevronUp' : 'chevronDown'} size={18} />
              </button>
              {openWorld === world.id && (
                <div className="chip-row">
                  {world.topics.map((topic) => (
                    <button key={topic.id} className="chip" onClick={() => startChat({
                      type: 'roleplay',
                      scenarioId: `${world.id}_${topic.id}`,
                      scenarioTitle: `${world.titleRo}: ${topic.titleRo}`,
                      scenarioPersona: topic.prompt,
                    })}>
                      {topic.titleRo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {menuSection === 'it' && (
        <section className="talk-module-section">
          <div className="talk-module-heading"><span>Engleză profesională pentru tehnologie</span><h2>Traseul IT</h2></div>
          <div className="card talk-it-card">
            <button type="button" onClick={() => setShowIT(!showIT)}>
              <span><Icon name="laptop" size={23} /><strong>15 module pentru engleza profesională IT</strong></span>
              <Icon name={showIT ? 'chevronUp' : 'chevronDown'} size={18} />
            </button>
            {showIT && (
              <div className="talk-it-modules">
                {IT_TRACK.map((module, index) => (
                  <button key={module.id} type="button" onClick={() => startChat({
                    type: 'professional',
                    scenarioId: module.id,
                    scenarioTitle: module.titleRo,
                    scenarioPersona: module.prompt,
                  })}>
                    <span>{index + 1}</span><strong>{module.titleRo}</strong><Icon name="arrowUpRight" size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Chat activ ----------
function ActiveChat({
  profile,
  setup,
  memoryContext,
  difficulty,
  examLeft,
  setExamLeft,
  onDone,
  onCancel,
  onMirror,
  mirrorTurn,
}: {
  profile: Profile;
  setup: ChatSetup;
  memoryContext?: string;
  difficulty: DifficultyDef;
  examLeft: number | null;
  setExamLeft: (n: number | null) => void;
  onDone: (r: { session: Session; report?: SessionReport }) => void;
  onCancel: () => void;
  onMirror: (t: Utterance | null) => void;
  mirrorTurn: Utterance | null;
}) {
  const chat = useVoiceChat({
    type: setup.type,
    scenarioId: setup.scenarioId,
    scenarioTitle: setup.scenarioTitle,
    scenarioPersona: setup.scenarioPersona,
    profile,
    difficulty,
    correctionMode: setup.correctionMode,
    targetExpressions: setup.targets,
    guided: setup.guided,
    memoryContext,
  });
  const started = useRef(false);
  const finishing = useRef(false);
  const [analyzingTs, setAnalyzingTs] = useState<number | null>(null);

  /** Mirror la cerere: analizează doar replica apăsată, nu toată conversația (§ optimizare tokeni). */
  async function openMirror(t: Utterance) {
    if (t.analysis) { onMirror(t); return; }
    if (analyzingTs != null) return;
    setAnalyzingTs(t.ts);
    const analyzed = await chat.analyzeTurnOnDemand(t.ts).catch(() => undefined);
    setAnalyzingTs(null);
    if (analyzed) onMirror(analyzed);
  }

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      chat.start('The session starts now. Greet the learner briefly in character and ask your first question. 1-2 sentences.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // timer pentru modul examen (§23)
  useEffect(() => {
    if (examLeft == null) return;
    if (examLeft <= 0) {
      end();
      return;
    }
    const t = setTimeout(() => setExamLeft(examLeft - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examLeft]);

  async function end() {
    if (finishing.current) return;
    finishing.current = true;
    const r = await chat.finish({ withReport: true });
    onDone(r);
  }

  return (
    <div className="page chat tutor-session-page">
      <TutorSessionHeader
        title={setup.scenarioTitle ?? CONVO_TYPES.find((c) => c.type === setup.type)?.titleRo ?? 'Conversație'}
        stepLabel="Conversație"
        detail={`${difficulty.titleRo} · corectare ${setup.correctionMode === 'discreet' ? 'discretă' : setup.correctionMode === 'immediate' ? 'imediată' : 'la final'}`}
        timeLabel={examLeft != null ? `${Math.floor(examLeft / 60)}:${String(examLeft % 60).padStart(2, '0')}` : undefined}
        actionLabel={chat.busy === 'ending' ? 'Analizez…' : 'Încheie'}
        onAction={end}
        onBack={onCancel}
        disabled={chat.busy === 'ending'}
      />
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
        contextLabel={setup.scenarioTitle ?? CONVO_TYPES.find((c) => c.type === setup.type)?.titleRo ?? 'Conversație liberă'}
      />
      {mirrorTurn && (
        <MirrorModal
          turn={mirrorTurn}
          profile={profile}
          contextText={chat.turns.slice(-6).map((t) => `${t.role}: ${t.text}`).join('\n')}
          onClose={() => onMirror(null)}
        />
      )}
    </div>
  );
}

// ---------- Explică-mi ziua (§10.7) ----------
function MyDaySetup({ profile, onStart, onBack }: { profile: Profile; onStart: (s: ChatSetup) => void; onBack: () => void }) {
  const [story, setStory] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ englishVersion: string; expressions: { en: string; ro: string }[]; conversationTopic: string } | null>(null);
  const recorder = useRef(new Recorder());

  async function mic() {
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setStory((s) => (s ? s + ' ' : '') + text);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  async function transform() {
    setBusy(true);
    setError('');
    try {
      const res = await chatJson<NonNullable<typeof result>>([
        { role: 'system', content: buildMyDayPrompt(profile) },
        { role: 'user', content: story },
      ], {
        feature: 'my_day',
        maxTokens: 1500,
        validate: (v: any) => typeof v?.englishVersion === 'string' && Array.isArray(v?.expressions),
      });
      setResult(res);
      // expresiile intră în vocabular (§10.7 pasul 2)
      for (const e of res.expressions) {
        if (!e?.en) continue;
        await addVocabItem({ word: e.en, translation: e.ro ?? '', kind: 'expression', example: res.englishVersion.split('.')[0] });
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  return (
    <div className="page">
      <h1><Icon name="calendar" size={24} />Explică-mi ziua</h1>
      <p className="muted">Povestește în română ce ai făcut azi sau o situație de la muncă. O transform în lecția ta de engleză.</p>
      {error && <div className="error-banner">{error}</div>}
      {!result && (
        <>
          <textarea rows={5} value={story} onChange={(e) => setStory(e.target.value)} placeholder="Ex: Azi un utilizator nu a mai avut acces la fișierele vechi din OneDrive din cauza unui mismatch de identificator…" />
          <div className="btn-row">
            <button className={recording ? 'btn-danger' : ''} onClick={mic} disabled={busy && !recording}>
              <Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Oprește' : 'Dictează'}
            </button>
            <button className="btn-primary" onClick={transform} disabled={!story.trim() || busy}>
              {busy ? 'Se transformă…' : 'Transformă în engleză →'}
            </button>
            <button className="btn-ghost" onClick={onBack}>← Înapoi</button>
          </div>
        </>
      )}
      {result && (
        <>
          <h2>Povestea ta în engleză</h2>
          <div className="card">
            <p>{result.englishVersion}</p>
            <button className="btn-ghost" onClick={() => speak(result.englishVersion, 0.92)}><Icon name="volume" />Ascultă</button>
          </div>
          <h2>Expresiile-cheie (salvate în vocabular)</h2>
          {result.expressions.map((e, i) => (
            <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <strong>{e.en}</strong>
                <div className="tiny">{e.ro}</div>
              </div>
              <button className="btn-ghost" onClick={() => speak(e.en, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
            </div>
          ))}
          <div className="btn-row">
            <button
              className="btn-primary"
              onClick={() =>
                onStart({
                  type: 'myday',
                  scenarioTitle: 'Ziua ta, în engleză',
                  scenarioPersona: `${result.conversationTopic}. Make the learner retell and discuss this exact situation in English.`,
                  correctionMode: profile.correctionMode,
                  targets: result.expressions.map((e) => e.en),
                })
              }
            >
              <Icon name="mic" />Pornește conversația pe situația ta
            </button>
          </div>
        </>
      )}
    </div>
  );
}
