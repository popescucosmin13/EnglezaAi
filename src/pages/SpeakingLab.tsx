// Speaking Lab (§ modul nou, optimizat pentru tokeni): un singur engine, o coadă de item-uri, faze.
//
// Bugetul de tokeni al modulului:
//   • Metricile de fluență (warm-up + summary) ............. 0 tokeni (fluency.ts, pe client)
//   • RESCUE ............................................... dicționar/cache întâi, LLM doar pe miss
//   • Free talk ........................................... reutilizează conversația existentă
//   • Diagnosticul de la Repair ........................... reutilizează batch-ul plătit (analyzePending)
//   • Transformation + Recap .............................. 0 tokeni (producție deterministă)
// Singurul cost nou real e RESCUE-ul pe miss (output minuscul, rezultatul se cache-uiește).

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile, Session, Utterance, RescueEvent, UtteranceAnalysis } from '../types';
import { CATEGORY_LABELS_RO } from '../types';
import { getProfile, getMistakes, getVocab, saveSession, bumpActivity, addXp, getSessions } from '../db/db';
import { isDue } from '../srs/ladder';
import { prioritizeMistakes, dedupeMistakes, targetExpressionsForToday, containsExpression } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import FluencyTrend from '../components/FluencyTrend';
import { DIFFICULTY_MODES } from '../content';
import { rescueWord, saveRescueToQueue } from '../api/rescue';
import { computeFluency } from '../logic/fluency';
import { buildFreeTalkTopicPrompt } from '../prompts';
import { chatJson } from '../api/openrouter';
import { hasOpenRouterKey } from '../settings';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { Icon } from '../components/Icon';
import TutorSessionHeader from '../components/TutorSessionHeader';

type Phase = 'intro' | 'session' | 'summary';

export default function SpeakingLab() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [finished, setFinished] = useState<Session | null>(null);

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {});
    getSessions().then(setPastSessions).catch(() => {});
  }, []);

  if (!profile) return <div className="page" />;

  if (phase === 'session') {
    return (
      <LabSession
        profile={profile}
        onDone={(s) => { setFinished(s); setPhase('summary'); }}
        onCancel={() => setPhase('intro')}
      />
    );
  }

  if (phase === 'summary' && finished) {
    return (
      <div className="page">
        <h1><Icon name="flask" size={24} />Sesiune terminată</h1>
        <p className="muted">Producție sub presiune de timp — exact ce antrenează vorbirea reală. Iată fluența ta azi:</p>
        <FluencyTrend sessions={[...pastSessions, finished]} latest={finished.fluency} />
        {finished.rescues && finished.rescues.length > 0 && (
          <>
            <h2><Icon name="lightbulb" size={18} />Cuvinte salvate azi</h2>
            {finished.rescues.map((r, i) => (
              <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <strong>{r.enWord}</strong> <span className="tiny muted">({r.roTerm})</span>
                </div>
                <button className="btn-ghost" onClick={() => speak(r.enWord, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
            ))}
            <p className="tiny muted">Sunt deja în coada ta de vocabular, cu propoziția în care te-ai blocat.</p>
          </>
        )}
        <div className="btn-row">
          <button className="btn-primary" onClick={() => { setFinished(null); setPhase('intro'); }}>Încă o sesiune</button>
          <button className="btn-ghost" onClick={() => navigate('/progress')}>Vezi progresul</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1><Icon name="flask" size={24} />Speaking Lab</h1>
      <p className="muted">
        Atacă direct două blocaje: cuvintele care nu-ți vin în timp real și gramatica pe care o știi
        dar n-o produci când vorbești. O sesiune scurtă, cu faze clare.
      </p>
      {!hasOpenRouterKey() && <div className="error-banner">Tutorul este temporar indisponibil. Încearcă din nou puțin mai târziu.</div>}

      <div className="card">
        <strong className="icon-label"><Icon name="compass" size={16} />Cum decurge</strong>
        <ol className="tiny" style={{ marginTop: 8, lineHeight: 1.8 }}>
          <li><strong>Încălzire</strong> — câteva item-uri scadente, rapid, fără feedback</li>
          <li><strong>Conversație liberă</strong> — flow, zero întreruperi; apeși <em>Ajutor</em> când un cuvânt nu-ți vine</li>
          <li><strong>Reparare</strong> — top 3 greșeli, le rostești corect</li>
          <li><strong>Transformare</strong> — aceeași idee, alt timp / întrebare</li>
          <li><strong>Recapitulare</strong> — cuvintele salvate azi, în propoziții noi</li>
        </ol>
      </div>

      <FluencyTrend sessions={pastSessions} />

      <div className="btn-row">
        <button className="btn-primary" onClick={() => setPhase('session')} disabled={!hasOpenRouterKey()}>
          <Icon name="mic" />Începe sesiunea
        </button>
      </div>
    </div>
  );
}

// ---------- Item de încălzire (RO→EN, verificare deterministă, 0 tokeni) ----------
interface WarmupItem { cueRo: string; answer: string; kind: 'vocab' | 'mistake' }

// ---------- Sarcină de reparare (recast vocal) ----------
interface RepairItem { originalFragment: string; corrected: string; correctFragment: string; explanationRo: string }

type SubPhase = 'warmup' | 'talk' | 'analyzing' | 'repair' | 'transform' | 'recap';

function LabSession({ profile, onDone, onCancel }: { profile: Profile; onDone: (s: Session) => void; onCancel: () => void }) {
  const chat = useVoiceChat({
    type: 'lab',
    profile,
    difficulty: DIFFICULTY_MODES[1],
    correctionMode: 'final', // free talk-ul rămâne neîntrerupt (§5)
    resumeKey: undefined,
  });

  const [sub, setSub] = useState<SubPhase>('warmup');
  const [prepError, setPrepError] = useState('');
  const rescues = useRef<RescueEvent[]>([]);
  const startedTalk = useRef(false);
  const finalizing = useRef(false);

  // date pregătite la montare
  const [warmup, setWarmup] = useState<WarmupItem[] | null>(null);
  const [topicEn, setTopicEn] = useState('Let\'s just chat. Tell me about your day so far.');

  useEffect(() => {
    void prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepare() {
    try {
      const [mistakes, vocab] = await Promise.all([getMistakes(), getVocab()]);
      const dueMistakes = prioritizeMistakes(dedupeMistakes(mistakes).filter((m) => isDue(m.review) && m.status !== 'mastered')).slice(0, 4);
      const dueVocab = vocab.filter((v) => isDue(v.review) && v.translation).slice(0, 4);
      const items: WarmupItem[] = [
        ...dueVocab.map((v) => ({ cueRo: v.translation, answer: v.word, kind: 'vocab' as const })),
        ...dueMistakes.map((m) => ({ cueRo: m.promptRo || m.corrected, answer: m.corrected, kind: 'mistake' as const })),
      ].slice(0, 6);
      setWarmup(items);

      // tema de free talk pe tier IEFTIN, din tag-urile slabe; fallback determinist dacă eșuează
      const weakTags = [...new Set(dueMistakes.map((m) => CATEGORY_LABELS_RO[m.category]))].slice(0, 3);
      const targets = await targetExpressionsForToday().catch(() => []);
      chat.setTargets(targets);
      if (weakTags.length > 0 && hasOpenRouterKey()) {
        try {
          const res = await chatJson<{ topicEn: string }>(
            [{ role: 'user', content: buildFreeTalkTopicPrompt(profile, weakTags, []) }],
            { tier: 'free', temperature: 0.6, feature: 'lab_topic', maxTokens: 200, validate: (v) => typeof (v as { topicEn?: unknown })?.topicEn === 'string' }
          );
          if (res.topicEn?.trim()) setTopicEn(res.topicEn.trim());
        } catch { /* păstrăm tema implicită */ }
      }
    } catch (e: any) {
      setPrepError(String(e?.message ?? e));
      setWarmup([]);
    }
  }

  function enterTalk() {
    setSub('talk');
    if (!startedTalk.current) {
      startedTalk.current = true;
      chat.start(`Start a relaxed free-talk session with this opening topic. Say it warmly and ask ONE question. Keep it to 1-2 sentences. Topic: ${topicEn}`);
    }
  }

  /** Extrage sarcinile de reparare din analizele deja făcute (batch-ul plătit), top 3 după severitate. */
  function repairItemsFromTurns(turns: Utterance[]): RepairItem[] {
    const out: RepairItem[] = [];
    const seen = new Set<string>();
    const analyses = turns.filter((t) => t.role === 'user' && t.analysis).map((t) => t.analysis as UtteranceAnalysis);
    const withErrors = analyses.filter((a) => a.errors.length > 0);
    // severitate: high întâi
    withErrors.sort((a, b) => (b.errors.some((e) => e.severity === 'high') ? 1 : 0) - (a.errors.some((e) => e.severity === 'high') ? 1 : 0));
    for (const a of withErrors) {
      const e = a.errors[0];
      const key = e.correctFragment.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ originalFragment: e.originalFragment, corrected: a.corrected, correctFragment: e.correctFragment, explanationRo: e.explanationRo });
      if (out.length >= 3) break;
    }
    return out;
  }

  const [repair, setRepair] = useState<RepairItem[]>([]);
  const [transformBases, setTransformBases] = useState<string[]>([]);

  async function endTalk() {
    setSub('analyzing'); // ecran de așteptare cât rulează batch-ul (nu montăm reparare cu items goale)
    // reutilizează batch-ul de analiză (utility + LanguageTool gratuit) — nu un apel nou
    const enriched = await chat.analyzePending().catch(() => chat.turns);
    const items = repairItemsFromTurns(enriched);
    // baze pentru transformare: propozițiile proprii corectate, suficient de lungi
    const bases = enriched
      .filter((t) => t.role === 'user' && t.analysis)
      .map((t) => (t.analysis as UtteranceAnalysis).corrected)
      .filter((s) => s.trim().split(/\s+/).length >= 4)
      .slice(0, 3);
    setRepair(items);
    setTransformBases(bases);
    // rutăm doar spre faze cu conținut; dacă nu e nimic de făcut, finalizăm direct
    if (items.length > 0) setSub('repair');
    else if (bases.length > 0) setSub('transform');
    else if (rescues.current.length > 0) setSub('recap');
    else void finalize();
  }

  async function finalize() {
    if (finalizing.current) return;
    finalizing.current = true;
    // finish() salvează sesiunea (type 'lab') și rulează processSessionEnd; fără raport narativ (tokeni).
    const { session } = await chat.finish({ withReport: false });
    session.fluency = computeFluency(session.turns, session.userSpeakingSec);
    if (rescues.current.length > 0) session.rescues = rescues.current;
    try { await saveSession(session); } catch (e) { console.warn('Salvarea sesiunii Lab a eșuat:', e); }
    onDone(session);
  }

  function addRescue(ev: RescueEvent) {
    rescues.current = [...rescues.current, ev];
    chat.addTarget(ev.enWord);
    void saveRescueToQueue(ev);
  }

  // ---------- Randare per sub-fază ----------
  if (warmup === null) {
    return <div className="page"><p><span className="spinner" /> Se pregătește sesiunea…</p></div>;
  }

  return (
    <div className={`page chat ${sub === 'talk' ? 'tutor-session-page' : ''}`}>
      {sub === 'talk' ? (
        <TutorSessionHeader
          title="Conversație"
          stepLabel="2 din 6"
          detail="Speaking Lab · vorbește liber, corectăm la final"
          currentStep={2}
          totalSteps={6}
          actionLabel="Corectează"
          onAction={endTalk}
          onBack={onCancel}
          disabled={!chat.turns.some((turn) => turn.role === 'user')}
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong className="icon-label"><Icon name="flask" size={18} />Speaking Lab · {SUB_LABELS[sub]}</strong>
          <button className="btn-ghost" onClick={onCancel} aria-label="Renunță">✕</button>
        </div>
      )}
      {prepError && <div className="error-banner">{prepError}</div>}

      {sub === 'warmup' && (
        <WarmupPhase items={warmup} onDone={enterTalk} />
      )}

      {sub === 'talk' && (
        <>
          <RescueBar profile={profile} lastUserText={[...chat.turns].reverse().find((t) => t.role === 'user')?.text ?? ''} onRescued={addRescue} />
          <ChatView
            turns={chat.turns}
            busy={chat.busy}
            interim={chat.interim}
            hints={chat.hints}
            error={chat.error}
            onMic={chat.micPress}
            onSend={chat.sendUserText}
            showMistakeTags={false}
            handsFree={chat.handsFree}
            onToggleHandsFree={() => chat.setHandsFree(!chat.handsFree)}
            profile={profile}
            onPhraseLearned={(p) => chat.addTarget(p)}
            contextLabel="Speaking Lab · conversație liberă"
          />
        </>
      )}

      {sub === 'analyzing' && (
        <div className="card"><p><span className="spinner" /> Îți analizez conversația pentru pasul de reparare…</p></div>
      )}

      {sub === 'repair' && (
        <RepairPhase items={repair} onDone={() => (transformBases.length > 0 ? setSub('transform') : rescues.current.length > 0 ? setSub('recap') : void finalize())} onFinalizeIfEmpty={finalize} />
      )}

      {sub === 'transform' && (
        <TransformPhase bases={transformBases} onDone={() => (rescues.current.length > 0 ? setSub('recap') : void finalize())} />
      )}

      {sub === 'recap' && (
        <RecapPhase rescues={rescues.current} onDone={finalize} />
      )}
    </div>
  );
}

const SUB_LABELS: Record<SubPhase, string> = {
  warmup: 'Încălzire',
  talk: 'Conversație',
  analyzing: 'Analiză',
  repair: 'Reparare',
  transform: 'Transformare',
  recap: 'Recapitulare',
};

// ---------- Bara RESCUE ----------
function RescueBar({ profile, lastUserText, onRescued }: { profile: Profile; lastUserText: string; onRescued: (ev: RescueEvent) => void }) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RescueEvent | null>(null);
  const recorder = useRef(new Recorder());
  const [recording, setRecording] = useState(false);

  async function ask(roTerm: string) {
    if (!roTerm.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const ev = await rescueWord({ trigger: 'explicit', roTerm, contextBefore: lastUserText, contextAfter: '', profile });
    setBusy(false);
    if (ev) {
      setResult(ev);
      onRescued(ev);
      void speak(ev.enWord, 0.92);
      setTerm('');
    }
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setTerm(text);
      } catch { /* fără transcriere */ }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { /* fără microfon */ }
  }

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="tiny" style={{ marginBottom: 6 }}><Icon name="lightbulb" size={13} /> Ți-a lipsit un cuvânt? Scrie-l în română — îl primești pe loc, fără să oprești conversația.</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ex: aspirator" onKeyDown={(e) => e.key === 'Enter' && ask(term)} disabled={busy} />
        <button className={recording ? 'btn-danger' : ''} onClick={mic} aria-label="Dictează" disabled={busy}><Icon name={recording ? 'stop' : 'mic'} /></button>
        <button className="btn-primary" onClick={() => ask(term)} disabled={!term.trim() || busy}>{busy ? <span className="spinner" /> : 'Ajutor'}</button>
      </div>
      {result && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: '1.1rem' }}>{result.enWord}</strong>
          {result.alternatives && result.alternatives.length > 0 && <span className="tiny muted">/ {result.alternatives.join(', ')}</span>}
          <button className="btn-ghost" onClick={() => speak(result.enWord, 0.9)} aria-label="Ascultă"><Icon name="volume" size={15} /></button>
          <span className="tiny muted" style={{ marginLeft: 'auto' }}>salvat în vocabular</span>
        </div>
      )}
    </div>
  );
}

// ---------- Faza de încălzire (0 tokeni) ----------
function WarmupPhase({ items, onDone }: { items: WarmupItem[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [reveal, setReveal] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef(new Recorder());

  if (items.length === 0) {
    return (
      <div className="card">
        <p className="muted">Nimic scadent de încălzit — intri direct în conversație.</p>
        <button className="btn-primary" onClick={onDone}><Icon name="mic" />Începe conversația</button>
      </div>
    );
  }

  const item = items[idx];
  const ok = reveal && containsExpression(answer, item.answer);

  function next() {
    setAnswer(''); setReveal(false);
    if (idx + 1 >= items.length) onDone();
    else setIdx(idx + 1);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setAnswer(text); setReveal(true);
      } catch { /* fără transcriere */ }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { /* fără microfon */ }
  }

  return (
    <div className="card">
      <div className="tiny muted">{idx + 1} / {items.length} · spune rapid în engleză</div>
      <p style={{ fontSize: '1.15rem', fontWeight: 600 }}>„{item.cueRo}"</p>
      {!reveal ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="…spune sau scrie" onKeyDown={(e) => e.key === 'Enter' && setReveal(true)} />
          <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={mic} aria-label="Vorbește"><Icon name={recording ? 'stop' : 'mic'} /></button>
          <button onClick={() => setReveal(true)}>Arată</button>
        </div>
      ) : (
        <>
          <p style={{ color: ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{ok ? '✓ Bine!' : `Răspuns: ${item.answer}`}</p>
          <button className="btn-ghost" onClick={() => speak(item.answer, 0.92)}><Icon name="volume" />Ascultă</button>
          <div className="btn-row"><button className="btn-primary" onClick={next}>{idx + 1 >= items.length ? 'Începe conversația →' : 'Următorul →'}</button></div>
        </>
      )}
    </div>
  );
}

// ---------- Faza de reparare: rostești forma corectă (§4 pasul 3) ----------
function RepairPhase({ items, onDone, onFinalizeIfEmpty }: { items: RepairItem[]; onDone: () => void; onFinalizeIfEmpty: () => void }) {
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ ok: boolean } | null>(null);
  const recorder = useRef(new Recorder());

  useEffect(() => { if (items.length === 0) onFinalizeIfEmpty(); }, [items.length, onFinalizeIfEmpty]);
  if (items.length === 0) return <div className="card"><p className="muted">Nicio greșeală de reparat — bravo! Se finalizează…</p></div>;

  const item = items[idx];

  function next() {
    setResult(null);
    if (idx + 1 >= items.length) onDone();
    else setIdx(idx + 1);
  }

  function verify(text: string) {
    const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ').trim();
    const ok = containsExpression(text, item.correctFragment) || norm(text).includes(norm(item.corrected));
    setResult({ ok });
    void bumpActivity('sentencesRepeated', 1).catch(() => {});
    void addXp(ok ? 5 : 1).catch(() => {});
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        verify(text);
      } catch { /* fără transcriere */ }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { /* fără microfon */ }
  }

  return (
    <div className="card">
      <div className="tiny muted">Reparare {idx + 1} / {items.length}</div>
      <p className="tiny" style={{ color: 'var(--danger)' }}>Ai spus: „{item.originalFragment}"</p>
      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Spune corect: „{item.corrected}"</p>
      <p className="tiny muted">{item.explanationRo}</p>
      <button className="btn-ghost" onClick={() => speak(item.corrected, 0.92)}><Icon name="volume" />Ascultă modelul</button>
      {!result ? (
        <div className="btn-row">
          <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={mic}><Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Gata' : 'Rostește forma corectă'}</button>
        </div>
      ) : (
        <>
          <p style={{ color: result.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{result.ok ? '✓ Ai produs forma corectă!' : 'Aproape — mai încearcă data viitoare. Ascultă modelul încă o dată.'}</p>
          <div className="btn-row"><button className="btn-primary" onClick={next}>{idx + 1 >= items.length ? 'Continuă →' : 'Următoarea →'}</button></div>
        </>
      )}
    </div>
  );
}

// ---------- Faza de transformare (Rapid, pur vocal, 0 tokeni) ----------
const TRANSFORMS = [
  'Spune aceeași idee la TRECUT.',
  'Transformă propoziția într-o ÎNTREBARE.',
  'Spune-o la VIITOR (going to / will).',
  'Fă-o mai POLITICOASĂ (Could you… / I would…).',
  'Spune-o la NEGATIV.',
];

function TransformPhase({ bases, onDone }: { bases: string[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [said, setSaid] = useState('');
  const recorder = useRef(new Recorder());

  useEffect(() => { if (bases.length === 0) onDone(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (bases.length === 0) return null;
  const base = bases[idx];
  const instruction = TRANSFORMS[idx % TRANSFORMS.length];

  function next() {
    setSaid('');
    if (idx + 1 >= bases.length) onDone();
    else setIdx(idx + 1);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setSaid(text);
        void bumpActivity('sentencesRepeated', 1).catch(() => {});
        void addXp(3).catch(() => {});
      } catch { /* fără transcriere */ }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { /* fără microfon */ }
  }

  return (
    <div className="card">
      <div className="tiny muted">Transformare {idx + 1} / {bases.length} · rapid, cu voce tare</div>
      <p style={{ fontSize: '1.05rem' }}>Pornind de la: „{base}"</p>
      <p style={{ fontWeight: 700 }}>{instruction}</p>
      <div className="btn-row">
        <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={mic}><Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Gata' : 'Spune varianta'}</button>
        {said && <button className="btn-ghost" onClick={next}>{idx + 1 >= bases.length ? 'Continuă →' : 'Următoarea →'}</button>}
        {!said && <button className="btn-ghost" onClick={next}>Sari peste →</button>}
      </div>
      {said && <p className="tiny muted">Ai spus: „{said}"</p>}
    </div>
  );
}

// ---------- Faza de recapitulare: cuvintele salvate azi, în propoziții noi ----------
function RecapPhase({ rescues, onDone }: { rescues: RescueEvent[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const recorder = useRef(new Recorder());

  useEffect(() => { if (rescues.length === 0) onDone(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (rescues.length === 0) return null;
  const item = rescues[idx];

  function next() {
    setResult(null);
    if (idx + 1 >= rescues.length) onDone();
    else setIdx(idx + 1);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        const ok = containsExpression(text, item.enWord);
        setResult({ ok, text });
        if (ok) void addXp(5).catch(() => {});
      } catch { /* fără transcriere */ }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { /* fără microfon */ }
  }

  return (
    <div className="card">
      <div className="tiny muted">Recapitulare {idx + 1} / {rescues.length}</div>
      <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Fă o propoziție NOUĂ cu „{item.enWord}" <span className="tiny muted">({item.roTerm})</span></p>
      {!result ? (
        <div className="btn-row">
          <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={mic}><Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Gata' : 'Spune propoziția'}</button>
          <button className="btn-ghost" onClick={next}>Sari peste →</button>
        </div>
      ) : (
        <>
          <p style={{ color: result.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{result.ok ? '✓ Ai folosit cuvântul!' : `Nu am auzit „${item.enWord}" — dar l-ai exersat.`}</p>
          <p className="tiny muted">Ai spus: „{result.text}"</p>
          <div className="btn-row"><button className="btn-primary" onClick={next}>{idx + 1 >= rescues.length ? 'Termină →' : 'Următorul →'}</button></div>
        </>
      )}
    </div>
  );
}
