import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import type { Profile, RescueEvent, Session, Utterance, UtteranceAnalysis } from '../types';
import { CATEGORY_LABELS_RO } from '../types';
import { addXp, bumpActivity, getMistakes, getProfile, getSessions, getVocab, saveSession } from '../db/db';
import { isDue } from '../srs/ladder';
import { containsExpression, dedupeMistakes, prioritizeMistakes, targetExpressionsForToday } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import TutorSessionHeader from '../components/TutorSessionHeader';
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
import { Banner, Button, ButtonRow, Card, Field, H1, H2, H3, Muted, Pill, Screen, Spinner, Tiny } from '../ui';
import { usePalette } from '../theme';

type Phase = 'intro' | 'session' | 'summary';
interface WarmupItem { cueRo: string; answer: string; kind: 'vocab' | 'mistake' }
interface RepairItem { originalFragment: string; corrected: string; correctFragment: string; explanationRo: string }
type SubPhase = 'warmup' | 'talk' | 'analyzing' | 'repair' | 'transform' | 'recap';

export default function SpeakingLab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [finished, setFinished] = useState<Session | null>(null);
  useEffect(() => { getProfile().then(setProfile).catch(() => {}); getSessions().then(setPastSessions).catch(() => {}); }, []);
  if (!profile) return <Screen><Spinner size="large" /></Screen>;
  if (phase === 'session') return <LabSession profile={profile} onDone={(session) => { setFinished(session); setPhase('summary'); }} onCancel={() => setPhase('intro')} />;
  if (phase === 'summary' && finished) return <Screen><H1>Sesiune terminată</H1><Muted>Producție sub presiune de timp — exact ce antrenează vorbirea reală.</Muted><FluencyTrend sessions={[...pastSessions, finished]} latest={finished.fluency} />{finished.rescues?.length ? <><H2>Cuvinte salvate azi</H2>{finished.rescues.map((item, i) => <Card key={`${item.enWord}-${i}`}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{item.enWord}</Text><Tiny>{item.roTerm}</Tiny></View><Button title="Ascultă" icon="volume" small variant="ghost" onPress={() => void speak(item.enWord, 0.9)} /></View></Card>)}</> : null}<ButtonRow><Button title="Încă o sesiune" variant="primary" onPress={() => { setFinished(null); setPhase('intro'); }} /><Button title="Vezi progresul" onPress={() => router.push('/progress')} /></ButtonRow></Screen>;
  return <Screen><H1>Speaking Lab</H1><Muted>Atacă direct două blocaje: cuvintele care nu-ți vin în timp real și gramatica pe care o știi, dar n-o produci când vorbești.</Muted>{!hasOpenRouterKey() ? <Banner kind="error">Tutorul este temporar indisponibil. Încearcă din nou puțin mai târziu.</Banner> : null}<Card><H3>Cum decurge</H3><Muted>1. Încălzire — elemente scadente, rapid</Muted><Muted>2. Conversație liberă — fără întreruperi</Muted><Muted>3. Reparare — rostești corect top 3 greșeli</Muted><Muted>4. Transformare — aceeași idee, alt timp</Muted><Muted>5. Recapitulare — cuvintele salvate azi</Muted></Card><FluencyTrend sessions={pastSessions} /><Button title="Începe sesiunea" icon="mic" variant="primary" disabled={!hasOpenRouterKey()} onPress={() => setPhase('session')} style={{ marginTop: 16 }} /></Screen>;
}

function LabSession({ profile, onDone, onCancel }: { profile: Profile; onDone: (session: Session) => void; onCancel: () => void }) {
  useKeepAwake();
  const p = usePalette();
  const chat = useVoiceChat({ type: 'lab', profile, difficulty: DIFFICULTY_MODES[1], correctionMode: 'final', resumeKey: undefined });
  const [sub, setSub] = useState<SubPhase>('warmup');
  const [prepError, setPrepError] = useState('');
  const [warmup, setWarmup] = useState<WarmupItem[] | null>(null);
  const [topicEn, setTopicEn] = useState("Let's chat. Tell me about your day so far.");
  const [repair, setRepair] = useState<RepairItem[]>([]);
  const [bases, setBases] = useState<string[]>([]);
  const rescues = useRef<RescueEvent[]>([]);
  const startedTalk = useRef(false);
  const finalizing = useRef(false);

  useEffect(() => { void prepare(); }, []);
  async function prepare() {
    try {
      const [mistakes, vocab] = await Promise.all([getMistakes(), getVocab()]);
      const dueMistakes = prioritizeMistakes(dedupeMistakes(mistakes).filter((item) => isDue(item.review) && item.status !== 'mastered')).slice(0, 4);
      const dueVocab = vocab.filter((item) => isDue(item.review) && item.translation).slice(0, 4);
      setWarmup([...dueVocab.map((item) => ({ cueRo: item.translation, answer: item.word, kind: 'vocab' as const })), ...dueMistakes.map((item) => ({ cueRo: item.promptRo || item.corrected, answer: item.corrected, kind: 'mistake' as const }))].slice(0, 6));
      const weakTags = [...new Set(dueMistakes.map((item) => CATEGORY_LABELS_RO[item.category]))].slice(0, 3);
      chat.setTargets(await targetExpressionsForToday().catch(() => []));
      if (weakTags.length && hasOpenRouterKey()) {
        const result = await chatJson<{ topicEn: string }>([{ role: 'user', content: buildFreeTalkTopicPrompt(profile, weakTags, []) }], { tier: 'free', temperature: 0.6, feature: 'lab_topic', maxTokens: 200, validate: (value) => typeof (value as { topicEn?: unknown })?.topicEn === 'string' }).catch(() => null);
        if (result?.topicEn?.trim()) setTopicEn(result.topicEn.trim());
      }
    } catch (error: any) { setPrepError(String(error?.message ?? error)); setWarmup([]); }
  }
  function enterTalk() {
    setSub('talk');
    if (!startedTalk.current) { startedTalk.current = true; chat.start(`Start a relaxed free-talk session with this opening topic. Say it warmly and ask ONE question. Keep it to 1-2 sentences. Topic: ${topicEn}`); }
  }
  function repairItems(turns: Utterance[]): RepairItem[] {
    const out: RepairItem[] = []; const seen = new Set<string>();
    const analyses = turns.filter((turn) => turn.role === 'user' && turn.analysis).map((turn) => turn.analysis as UtteranceAnalysis).filter((analysis) => analysis.errors.length);
    analyses.sort((a, b) => Number(b.errors.some((error) => error.severity === 'high')) - Number(a.errors.some((error) => error.severity === 'high')));
    for (const analysis of analyses) { const error = analysis.errors[0]; const key = error.correctFragment.toLowerCase(); if (seen.has(key)) continue; seen.add(key); out.push({ originalFragment: error.originalFragment, corrected: analysis.corrected, correctFragment: error.correctFragment, explanationRo: error.explanationRo }); if (out.length >= 3) break; }
    return out;
  }
  async function endTalk() {
    setSub('analyzing');
    const enriched = await chat.analyzePending().catch(() => chat.turns);
    const nextRepair = repairItems(enriched);
    const nextBases = enriched.filter((turn) => turn.role === 'user' && turn.analysis).map((turn) => (turn.analysis as UtteranceAnalysis).corrected).filter((text) => text.trim().split(/\s+/).length >= 4).slice(0, 3);
    setRepair(nextRepair); setBases(nextBases);
    if (nextRepair.length) setSub('repair'); else if (nextBases.length) setSub('transform'); else if (rescues.current.length) setSub('recap'); else await finalize();
  }
  async function finalize() {
    if (finalizing.current) return;
    finalizing.current = true;
    try {
      const { session } = await chat.finish({ withReport: false });
      session.fluency = computeFluency(session.turns, session.userSpeakingSec);
      if (rescues.current.length) session.rescues = rescues.current;
      await saveSession(session).catch(() => {});
      onDone(session);
    } finally { finalizing.current = false; }
  }
  function addRescue(event: RescueEvent) { rescues.current = [...rescues.current, event]; chat.addTarget(event.enWord); void saveRescueToQueue(event); }
  if (warmup === null) return <Screen><Spinner size="large" /></Screen>;
  if (sub === 'talk') return (
    <Screen scroll={false} padBottom={8} style={{ width: '100%', maxWidth: 430, alignSelf: 'center' }}>
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
      <RescueBar
        profile={profile}
        lastUserText={[...chat.turns].reverse().find((turn) => turn.role === 'user')?.text ?? ''}
        onRescued={addRescue}
      />
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
        onPhraseLearned={(phrase) => chat.addTarget(phrase)}
        contextLabel="Speaking Lab · conversație liberă"
      />
    </Screen>
  );
  return <Screen><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: p.ink, fontWeight: '800' }}>Speaking Lab · {({ warmup: 'Încălzire', analyzing: 'Analiză', repair: 'Reparare', transform: 'Transformare', recap: 'Recapitulare', talk: 'Conversație' } as Record<SubPhase, string>)[sub]}</Text><Button title="Renunță" small variant="ghost" onPress={onCancel} /></View>{prepError ? <Banner kind="error">{prepError}</Banner> : null}{sub === 'warmup' ? <Warmup items={warmup} onDone={enterTalk} /> : null}{sub === 'analyzing' ? <Card style={{ alignItems: 'center', paddingVertical: 36 }}><Spinner size="large" /><H2>Îți analizez conversația…</H2></Card> : null}{sub === 'repair' ? <Repair items={repair} onDone={() => bases.length ? setSub('transform') : rescues.current.length ? setSub('recap') : void finalize()} /> : null}{sub === 'transform' ? <Transform bases={bases} onDone={() => rescues.current.length ? setSub('recap') : void finalize()} /> : null}{sub === 'recap' ? <Recap rescues={rescues.current} onDone={finalize} /> : null}</Screen>;
}

function RescueBar({ profile, lastUserText, onRescued }: { profile: Profile; lastUserText: string; onRescued: (event: RescueEvent) => void }) {
  const [term, setTerm] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<RescueEvent | null>(null);
  async function ask() { if (!term.trim() || busy) return; setBusy(true); setResult(null); try { const event = await rescueWord({ trigger: 'explicit', roTerm: term, contextBefore: lastUserText, contextAfter: '', profile }); if (event) { setResult(event); onRescued(event); void speak(event.enWord, 0.92); setTerm(''); } } finally { setBusy(false); } }
  return <Card style={{ marginVertical: 6, padding: 10 }}><Tiny>Ți-a lipsit un cuvânt? Scrie-l în română — îl primești pe loc.</Tiny><View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}><Field value={term} onChange={setTerm} placeholder="ex: aspirator" style={{ flex: 1, marginVertical: 4 }} /><Button title="Ajutor" small variant="primary" busy={busy} disabled={!term.trim()} onPress={ask} /></View>{result ? <Tiny>{result.enWord}{result.alternatives?.length ? ` / ${result.alternatives.join(', ')}` : ''} · salvat în vocabular</Tiny> : null}</Card>;
}

function Warmup({ items, onDone }: { items: WarmupItem[]; onDone: () => void }) {
  const [index, setIndex] = useState(0); const [answer, setAnswer] = useState(''); const [reveal, setReveal] = useState(false);
  if (!items.length) return <Card><Muted>Nimic scadent — intri direct în conversație.</Muted><Button title="Începe conversația" icon="mic" variant="primary" onPress={onDone} /></Card>;
  const item = items[index]; const ok = reveal && containsExpression(answer, item.answer);
  function next() { setAnswer(''); setReveal(false); if (index + 1 >= items.length) onDone(); else setIndex((value) => value + 1); }
  return <Card><Tiny>{index + 1}/{items.length} · spune rapid în engleză</Tiny><H1>„{item.cueRo}”</H1>{!reveal ? <><Field value={answer} onChange={setAnswer} placeholder="Scrie răspunsul…" /><Button title="Verifică" variant="primary" onPress={() => setReveal(true)} disabled={!answer.trim()} /></> : <><Banner kind={ok ? 'success' : 'warn'}>{ok ? 'Corect!' : `Model: ${item.answer}`}</Banner><Button title={index + 1 >= items.length ? 'Începe conversația' : 'Următorul'} variant="primary" onPress={next} /></>}</Card>;
}

function Repair({ items, onDone }: { items: RepairItem[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  if (!items.length) { setTimeout(onDone, 0); return null; }
  const item = items[index];
  return <VoiceTask eyebrow={`${index + 1}/${items.length} · reparare`} title={`„${item.originalFragment}” → „${item.correctFragment}”`} help={item.explanationRo} model={item.corrected} target={item.correctFragment} onDone={() => index + 1 >= items.length ? onDone() : setIndex((value) => value + 1)} />;
}

const TRANSFORMS = ['Spune aceeași idee la TRECUT.', 'Transformă propoziția într-o ÎNTREBARE.', 'Spune-o la VIITOR.', 'Fă-o mai POLITICOASĂ.', 'Spune-o la NEGATIV.'];
function Transform({ bases, onDone }: { bases: string[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  if (!bases.length) { setTimeout(onDone, 0); return null; }
  return <VoiceTask eyebrow={`${index + 1}/${bases.length} · transformare`} title={TRANSFORMS[index % TRANSFORMS.length]} help={`Pornind de la: „${bases[index]}”`} target="" onDone={() => index + 1 >= bases.length ? onDone() : setIndex((value) => value + 1)} />;
}
function Recap({ rescues, onDone }: { rescues: RescueEvent[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  if (!rescues.length) { setTimeout(onDone, 0); return null; }
  const item = rescues[index];
  return <VoiceTask eyebrow={`${index + 1}/${rescues.length} · recapitulare`} title={`Fă o propoziție nouă cu „${item.enWord}”`} help={item.roTerm} target={item.enWord} onDone={() => index + 1 >= rescues.length ? onDone() : setIndex((value) => value + 1)} />;
}

function VoiceTask({ eyebrow, title, help, model, target, onDone }: { eyebrow: string; title: string; help?: string; model?: string; target: string; onDone: () => void }) {
  const recorder = useRef(new Recorder()); const [recording, setRecording] = useState(false); const [said, setSaid] = useState(''); const [error, setError] = useState('');
  useEffect(() => () => recorder.current.cancel(), []);
  async function mic() { if (recording) { setRecording(false); try { const audio = await recorder.current.stop(); let text = ''; try { ({ text } = await transcribe(audio)); } finally { await audio.dispose(); } setSaid(text); await bumpActivity('sentencesRepeated', 1).catch(() => {}); if (!target || containsExpression(text, target)) await addXp(3).catch(() => {}); } catch (reason: any) { setError(String(reason?.message ?? reason)); } return; } try { await recorder.current.start(); setRecording(true); } catch { setError('Nu am acces la microfon.'); } }
  return <Card><Tiny>{eyebrow.toUpperCase()}</Tiny><H1>{title}</H1>{help ? <Muted>{help}</Muted> : null}{model ? <Button title="Ascultă modelul" icon="volume" onPress={() => void speak(model, 0.92)} /> : null}{error ? <Banner kind="error">{error}</Banner> : null}<ButtonRow><Button title={recording ? 'Oprește' : said ? 'Înregistrează din nou' : 'Rostește varianta'} icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'primary'} onPress={mic} />{said ? <Button title="Continuă" onPress={onDone} /> : <Button title="Sari peste" variant="ghost" onPress={onDone} />}</ButtonRow>{said ? <Banner kind={!target || containsExpression(said, target) ? 'success' : 'info'}>Ai spus: „{said}”</Banner> : null}</Card>;
}
