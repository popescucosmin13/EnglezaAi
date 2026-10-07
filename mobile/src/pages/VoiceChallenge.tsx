import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { DailyPlan, Profile } from '../types';
import { addXp, bumpActivity, getProfile, getVocab, newId, todayStr } from '../db/db';
import { getOrCreateDailyPlan, containsExpression } from '../logic/engine';
import { checkWithLanguageTool } from '../api/languagetool';
import { transcribe } from '../api/stt';
import { Recorder } from '../audio/recorder';
import { Icon } from '../components/Icon';
import { getVoiceChallengeResults, saveVoiceChallengeResult } from '../microlearning/state';
import type { VoiceChallengeResult } from '../microlearning/types';
import { Banner, Button, ButtonRow, Card, Chip, ChipRow, H1, H2, Muted, Pill, Screen, Spinner, StatGrid, StatTile, Tiny } from '../ui';
import { usePalette } from '../theme';

const TOTAL_SECONDS = 60;
const PROMPTS = [
  'Descrie ce ai făcut astăzi și ce urmează să faci.',
  'Povestește despre o problemă pe care ai rezolvat-o recent.',
  'Descrie un loc în care ai vrea să călătorești și explică de ce.',
  'Prezintă pe scurt proiectul sau activitatea la care lucrezi acum.',
  'Explică o decizie dificilă pe care ai luat-o.',
  'Descrie o zi de lucru ideală pentru tine.',
  'Vorbește despre ceva nou pe care l-ai învățat săptămâna aceasta.',
];
type Phase = 'ready' | 'recording' | 'processing' | 'result';

export default function VoiceChallenge() {
  const p = usePalette();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [history, setHistory] = useState<VoiceChallengeResult[]>([]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [left, setLeft] = useState(TOTAL_SECONDS);
  const [result, setResult] = useState<VoiceChallengeResult | null>(null);
  const [error, setError] = useState('');
  const recorder = useRef(new Recorder());
  const startedAt = useRef(0);
  const stopping = useRef(false);

  useEffect(() => {
    Promise.all([getProfile(), getOrCreateDailyPlan(), getVocab(), getVoiceChallengeResults()])
      .then(([nextProfile, nextPlan, vocab, results]) => {
        setProfile(nextProfile);
        setPlan(nextPlan);
        setTargets([...new Set([...nextPlan.vocabularyFocus, ...vocab.filter((item) => item.activeScore < 60).map((item) => item.word)])].slice(0, 3));
        setHistory(results);
      })
      .catch((reason) => setError(String(reason?.message ?? reason)));
    return () => recorder.current.cancel();
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          clearInterval(timer);
          setTimeout(() => void stopChallenge(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const prompt = useMemo(() => {
    const day = Math.floor(new Date(todayStr() + 'T12:00:00').getTime() / 86400000);
    const base = PROMPTS[Math.abs(day) % PROMPTS.length];
    if (profile?.mainObjective?.toLowerCase().includes('munc')) return `${base} Leagă răspunsul de munca ta.`;
    if (profile?.interests?.some((interest) => /tehn|it|business/i.test(interest))) return `${base} Include, dacă poți, un exemplu din tehnologie sau business.`;
    return base;
  }, [profile]);

  const best = history.length ? Math.max(...history.map((item) => item.score)) : null;
  const previous = history.length ? history[history.length - 1] : null;

  async function startChallenge() {
    setError(''); setResult(null); setLeft(TOTAL_SECONDS); stopping.current = false;
    try {
      await recorder.current.start();
      startedAt.current = Date.now();
      setPhase('recording');
    } catch {
      setError(`Nu am acces la microfon. Verifică permisiunea aplicației din setările ${Platform.OS === 'ios' ? 'iPhone-ului' : 'Android'}.`);
    }
  }

  async function stopChallenge() {
    if (stopping.current || phase !== 'recording') return;
    stopping.current = true;
    setPhase('processing');
    try {
      const durationSec = Math.max(1, Math.min(TOTAL_SECONDS, Math.round((Date.now() - startedAt.current) / 1000)));
      const audio = await recorder.current.stop();
      let transcript = '';
      try { ({ text: transcript } = await transcribe(audio)); } finally { await audio.dispose(); }
      const words = transcript.match(/[A-Za-z']+/g) ?? [];
      const uniqueWords = new Set(words.map((word) => word.toLowerCase())).size;
      const wordsPerMinute = Math.round((words.length / durationSec) * 60);
      const usedTargets = targets.filter((target) => containsExpression(transcript, target));
      const grammarIssues = await checkWithLanguageTool(transcript).then((matches) => matches.length).catch(() => null);
      const fluencyScore = Math.min(100, Math.round((words.length / 70) * 100));
      const diversityScore = words.length ? Math.min(100, Math.round((uniqueWords / words.length) * 170)) : 0;
      const targetScore = targets.length ? Math.round((usedTargets.length / targets.length) * 100) : 75;
      const grammarScore = grammarIssues == null ? 75 : Math.max(0, 100 - grammarIssues * 12);
      const score = Math.round(fluencyScore * 0.35 + diversityScore * 0.2 + targetScore * 0.25 + grammarScore * 0.2);
      const next: VoiceChallengeResult = { id: newId(), date: todayStr(), prompt, transcript, durationSec, wordCount: words.length, uniqueWords, wordsPerMinute, targetPhrases: targets, usedTargets, grammarIssues, score };
      await saveVoiceChallengeResult(next);
      await bumpActivity('speakingSec', Math.min(durationSec, Math.max(1, Math.round(words.length / 2)))).catch(() => {});
      await addXp(Math.max(5, Math.round(score / 10))).catch(() => {});
      setHistory((items) => [...items, next]);
      setResult(next);
      setPhase('result');
    } catch (reason: any) {
      setError(`Nu am putut analiza înregistrarea: ${String(reason?.message ?? reason)}`);
      setPhase('ready');
    } finally { stopping.current = false; }
  }

  if (!profile || !plan) return <Screen><View style={{ minHeight: 360, justifyContent: 'center' }}><Spinner size="large" /></View></Screen>;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}><H1>Provocarea de 60 de secunde</H1><Tiny>Un singur subiect. Fără oprire. Progres față de tine.</Tiny></View>
        {best != null ? <Pill kind="level">record {best}</Pill> : null}
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}

      {(phase === 'ready' || phase === 'recording') ? (
        <Card style={{ alignItems: 'center', paddingVertical: 26, borderColor: phase === 'recording' ? p.danger : p.border }}>
          <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: phase === 'recording' ? p.dangerSoft : p.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: phase === 'recording' ? p.danger : p.primaryDeep, fontSize: 42, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{left}</Text>
          </View>
          <H2>{prompt}</H2>
          {targets.length ? <View style={{ width: '100%' }}><Tiny>Bonus: folosește natural</Tiny><ChipRow>{targets.map((target) => <Chip key={target} label={target} selected />)}</ChipRow></View> : null}
          {phase === 'ready' ? (
            <Button title="Pornește provocarea" icon="mic" variant="primary" onPress={startChallenge} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 30 }}>{[14, 25, 18, 30, 20].map((h, i) => <View key={i} style={{ width: 5, height: h, borderRadius: 4, backgroundColor: p.danger }} />)}</View>
              <Muted>Vorbește acum…</Muted>
              <Button title="Încheie și analizează" icon="stop" variant="danger" onPress={stopChallenge} />
            </View>
          )}
        </Card>
      ) : null}

      {phase === 'processing' ? <Card style={{ alignItems: 'center', paddingVertical: 40 }}><Spinner size="large" /><H2>Transcriu și calculez progresul…</H2></Card> : null}

      {phase === 'result' && result ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: result.score >= 70 ? p.successSoft : p.warnSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: result.score >= 70 ? p.success : p.warnInk, fontSize: 46, fontWeight: '900' }}>{result.score}</Text>
          </View>
          <H2>{result.score >= 80 ? 'Record foarte bun!' : result.score >= 60 ? 'Ritm bun — continuă' : 'Ai creat o bază de îmbunătățit'}</H2>
          <View style={{ width: '100%' }}><StatGrid><StatTile value={result.wordCount} label="cuvinte" /><StatTile value={result.wordsPerMinute} label="cuvinte/min" /><StatTile value={result.uniqueWords} label="cuvinte diferite" /></StatGrid></View>
          <View style={{ width: '100%', marginTop: 14 }}>
            <Tiny>Expresii folosite: {result.usedTargets.length ? result.usedTargets.join(', ') : 'niciuna încă'}</Tiny>
            <Tiny>Observații gramaticale: {result.grammarIssues == null ? 'verificarea nu a fost disponibilă' : result.grammarIssues}</Tiny>
            <View style={{ backgroundColor: p.bgSoft, borderRadius: 14, padding: 14, marginTop: 10 }}><Muted>„{result.transcript}”</Muted></View>
            {previous ? <Banner kind="info">{result.score - previous.score >= 0 ? '+' : ''}{result.score - previous.score} puncte față de încercarea anterioară.</Banner> : null}
          </View>
          <ButtonRow style={{ justifyContent: 'center' }}><Button title="Mai încearcă" icon="rotate" variant="primary" onPress={startChallenge} /><Button title="Acasă" onPress={() => router.replace('/')} /></ButtonRow>
        </Card>
      ) : null}
    </Screen>
  );
}
