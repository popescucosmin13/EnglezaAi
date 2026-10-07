import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DailyPlan, Profile } from '../types';
import { addXp, bumpActivity, getProfile, getVocab, newId, todayStr } from '../db/db';
import { getOrCreateDailyPlan, containsExpression } from '../logic/engine';
import { checkWithLanguageTool } from '../api/languagetool';
import { transcribe } from '../api/stt';
import { Recorder } from '../audio/recorder';
import { Icon } from '../components/Icon';
import { getVoiceChallengeResults, saveVoiceChallengeResult } from '../microlearning/state';
import type { VoiceChallengeResult } from '../microlearning/types';

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
  const navigate = useNavigate();
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
        const dueTargets = [...nextPlan.vocabularyFocus, ...vocab.filter((item) => item.activeScore < 60).map((item) => item.word)];
        setTargets([...new Set(dueTargets)].slice(0, 3));
        setHistory(results);
      })
      .catch((reason) => setError(String(reason?.message ?? reason)));
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          void stopChallenge();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
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
    setError('');
    setResult(null);
    setLeft(TOTAL_SECONDS);
    stopping.current = false;
    try {
      await recorder.current.start();
      startedAt.current = Date.now();
      setPhase('recording');
    } catch {
      setError('Nu am acces la microfon. Verifică permisiunea browserului.');
    }
  }

  async function stopChallenge() {
    if (stopping.current || phase !== 'recording') return;
    stopping.current = true;
    setPhase('processing');
    try {
      const durationSec = Math.max(1, Math.min(TOTAL_SECONDS, Math.round((Date.now() - startedAt.current) / 1000)));
      const blob = await recorder.current.stop();
      const { text: transcript } = await transcribe(blob);
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
      const next: VoiceChallengeResult = {
        id: newId(),
        date: todayStr(),
        prompt,
        transcript,
        durationSec,
        wordCount: words.length,
        uniqueWords,
        wordsPerMinute,
        targetPhrases: targets,
        usedTargets,
        grammarIssues,
        score,
      };
      await saveVoiceChallengeResult(next);
      const estimatedSpeakingSec = Math.min(durationSec, Math.max(1, Math.round(words.length / 2)));
      await bumpActivity('speakingSec', estimatedSpeakingSec).catch(() => {});
      await addXp(Math.max(5, Math.round(score / 10))).catch(() => {});
      setHistory((items) => [...items, next]);
      setResult(next);
      setPhase('result');
    } catch (reason: any) {
      setError(`Nu am putut analiza înregistrarea: ${String(reason?.message ?? reason)}`);
      setPhase('ready');
    } finally {
      stopping.current = false;
    }
  }

  if (!profile || !plan) return <div className="page"><p><span className="spinner" /> Se pregătește provocarea…</p></div>;

  return (
    <div className="page voice-challenge-page">
      <div className="micro-head">
        <div><h1><Icon name="mic" size={24} />Provocarea de 60 de secunde</h1><p className="tiny">Un singur subiect. Fără oprire. Progres față de tine.</p></div>
        {best != null && <span className="level-pill">record {best}</span>}
      </div>
      {error && <div className="error-banner">{error}</div>}

      {(phase === 'ready' || phase === 'recording') && (
        <div className={`card voice-stage ${phase === 'recording' ? 'is-recording' : ''}`}>
          <div className="voice-clock">{left}</div>
          <h2>{prompt}</h2>
          {targets.length > 0 && (
            <div><p className="tiny">Bonus: folosește natural</p><div className="chip-row">{targets.map((target) => <span className="chip selected" key={target}>{target}</span>)}</div></div>
          )}
          {phase === 'ready' ? (
            <button className="btn-primary voice-start" onClick={startChallenge}><Icon name="mic" />Pornește provocarea</button>
          ) : (
            <>
              <div className="voice-wave"><span /><span /><span /><span /><span /></div>
              <p className="muted">Vorbește acum…</p>
              <button className="btn-danger" onClick={stopChallenge}><Icon name="stop" />Încheie și analizează</button>
            </>
          )}
        </div>
      )}

      {phase === 'processing' && <div className="card voice-stage"><span className="spinner" /><h2>Transcriu și calculez progresul…</h2></div>}

      {phase === 'result' && result && (
        <div className="card voice-result">
          <div className="voice-score">{result.score}</div>
          <h2>{result.score >= 80 ? 'Record foarte bun!' : result.score >= 60 ? 'Ritm bun — continuă' : 'Ai creat o bază de îmbunătățit'}</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{result.wordCount}</div><div className="label">cuvinte</div></div>
            <div className="stat-tile"><div className="value">{result.wordsPerMinute}</div><div className="label">cuvinte/min</div></div>
            <div className="stat-tile"><div className="value">{result.uniqueWords}</div><div className="label">cuvinte diferite</div></div>
          </div>
          <p className="tiny"><strong>Expresii folosite:</strong> {result.usedTargets.length ? result.usedTargets.join(', ') : 'niciuna încă'}</p>
          <p className="tiny"><strong>Observații gramaticale:</strong> {result.grammarIssues == null ? 'verificarea nu a fost disponibilă' : result.grammarIssues}</p>
          <div className="voice-transcript">“{result.transcript}”</div>
          {previous && <div className="info-banner">{result.score - previous.score >= 0 ? '+' : ''}{result.score - previous.score} puncte față de încercarea anterioară.</div>}
          <div className="btn-row">
            <button className="btn-primary" onClick={startChallenge}><Icon name="rotate" />Mai încearcă o dată</button>
            <button onClick={() => navigate('/')}>Înapoi acasă</button>
          </div>
        </div>
      )}
    </div>
  );
}
