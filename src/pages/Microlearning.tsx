import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Profile, PronunciationResult } from '../types';
import {
  addXp,
  bumpActivity,
  getProfile,
  newId,
  savePronResult,
  saveVocab,
  todayStr,
  updateActivity,
} from '../db/db';
import { applyReview } from '../srs/ladder';
import {
  containsExpression,
  ensureMistakePromptRo,
  evaluateReviewAnswer,
  markMistakePipeline,
  reviewMistake,
} from '../logic/engine';
import { isoWeekId } from '../logic/metrics';
import { hasOpenRouterKey } from '../settings';
import { Recorder } from '../audio/recorder';
import { speak } from '../audio/tts';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import {
  audioText,
  evaluateCurriculumAnswer,
  isListeningExercise,
  isOpenExercise,
  normalizeAnswer,
} from '../microlearning/curriculum';
import { buildMicroFeed, feedCardIdentity } from '../microlearning/session';
import {
  getBossResults,
  markLessonViewed,
  recordExerciseAttempt,
  recordMicroDaily,
  saveBossResult,
} from '../microlearning/state';
import type { BossResult, CardEvaluation, FeedCard, FeedMode } from '../microlearning/types';

const MODE_COPY: Record<FeedMode, { title: string; subtitle: string; icon: 'zap' | 'save' | 'trophy' }> = {
  daily: { title: 'Antrenamentul de 3 minute', subtitle: '5 pași aleși din memoria și nivelul tău', icon: 'zap' },
  rescue: { title: 'Salvează de la uitare', subtitle: 'Doar elementele care trebuie recuperate acum', icon: 'save' },
  boss: { title: 'Boss Battle', subtitle: 'Testul săptămânii, fără indicii', icon: 'trophy' },
};

interface Stats {
  done: number;
  correct: number;
  points: number;
}

export default function Microlearning({ defaultMode = 'daily' }: { defaultMode?: FeedMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryMode = searchParams.get('mode');
  const mode: FeedMode = queryMode === 'rescue' || queryMode === 'boss' ? queryMode : defaultMode;
  const copy = MODE_COPY[mode];
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cards, setCards] = useState<FeedCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<CardEvaluation | null>(null);
  const [checking, setChecking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [finished, setFinished] = useState(false);
  const [stats, setStats] = useState<Stats>({ done: 0, correct: 0, points: 0 });
  const [bossComparison, setBossComparison] = useState<number | null>(null);
  const [mistakePrompt, setMistakePrompt] = useState('');
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);
  const recorder = useRef(new Recorder());
  const coreCount = useRef(0);

  async function load() {
    setLoadError('');
    setCards(null);
    setIndex(0);
    setAnswer('');
    setFeedback(null);
    setFinished(false);
    completedRef.current = false;
    setStats({ done: 0, correct: 0, points: 0 });
    startedAt.current = Date.now();
    try {
      const currentProfile = await getProfile();
      const nextCards = await buildMicroFeed(mode, currentProfile.currentLevel);
      setProfile(currentProfile);
      setCards(nextCards);
      coreCount.current = nextCards.length;
    } catch (error: any) {
      setLoadError(String(error?.message ?? error));
    }
  }

  useEffect(() => { void load(); }, [mode]);

  const card = cards?.[index] ?? null;
  const progress = cards?.length ? Math.min(100, ((index + (feedback ? 1 : 0)) / cards.length) * 100) : 0;
  const expectedForVoice = useMemo(() => {
    if (!card) return '';
    if (card.kind === 'curriculum') return audioText(card.exercise, card.lesson);
    if (card.kind === 'mistake') return card.mistake.correctFragment ?? card.mistake.corrected;
    if (card.kind === 'vocab') return card.vocab.word;
    return '';
  }, [card]);

  useEffect(() => {
    setMistakePrompt('');
    if (!card || card.kind !== 'mistake') return;
    let active = true;
    ensureMistakePromptRo(card.mistake)
      .then((prompt) => { if (active) setMistakePrompt(prompt || ''); })
      .catch(() => {});
    return () => { active = false; };
  }, [card?.instanceId]);

  async function evaluate(text: string): Promise<CardEvaluation> {
    if (!card) throw new Error('Cardul nu mai este disponibil.');
    if (card.kind === 'intro') {
      return { correct: true, score: 100, expected: '', explanation: 'Regula intră imediat în practică.' };
    }
    if (card.kind === 'curriculum') return evaluateCurriculumAnswer(card.exercise, text);
    if (card.kind === 'vocab') {
      const correct = containsExpression(text, card.vocab.word);
      return {
        correct,
        score: correct ? 100 : 0,
        expected: card.vocab.word,
        explanation: correct ? 'Expresia a fost recuperată.' : `Folosește expresia: ${card.vocab.word}`,
      };
    }

    const mistake = card.mistake;
    const normalized = normalizeAnswer(text);
    const expected = [mistake.correctFragment, mistake.corrected].filter((value): value is string => Boolean(value));
    const fragment = normalizeAnswer(mistake.correctFragment ?? '');
    const localPass = expected.some((value) => normalizeAnswer(value) === normalized)
      || (fragment.length > 0 && normalized.includes(fragment));
    if (!localPass || !hasOpenRouterKey()) {
      return {
        correct: localPass,
        score: localPass ? 100 : 0,
        expected: mistake.corrected,
        explanation: localPass ? 'Ai reparat greșeala.' : `Varianta corectă: ${mistake.corrected}`,
      };
    }
    const currentProfile = profile ?? await getProfile();
    const result = await evaluateReviewAnswer(currentProfile, mistake, text, localPass);
    return {
      correct: result.verdict,
      score: result.verdict ? 100 : 35,
      expected: mistake.corrected,
      explanation: result.verdict
        ? 'Ai reparat greșeala în propoziție.'
        : result.otherErrors.length
          ? result.otherErrors.map((error) => `${error.wrong} → ${error.correct}`).join(' · ')
          : result.noteRo || `Varianta corectă: ${mistake.corrected}`,
    };
  }

  async function persistResult(result: CardEvaluation, usedVoice: boolean, submittedAnswer: string) {
    if (!card) return;
    if (card.kind === 'intro') {
      await markLessonViewed(card.lesson.lesson_id);
      return;
    }
    if (card.kind === 'curriculum') {
      await recordExerciseAttempt(card.exercise.id, card.lesson.lesson_id, result.correct, result.score);
      if (usedVoice && ['pronunciation', 'shadowing'].includes(card.exercise.type)) {
        const reference = audioText(card.exercise, card.lesson);
        const assessment = sttDiffAssessment(reference, submittedAnswer);
        const pronunciation: PronunciationResult = {
          id: newId(),
          date: todayStr(),
          exercise: card.exercise.type === 'shadowing' ? 'shadowing' : 'repeat',
          phrase: reference,
          targets: [],
          score: assessment.accuracyScore,
          wordScores: assessment.words,
          source: 'stt-diff',
        };
        await savePronResult(pronunciation).catch(() => {});
        await bumpActivity(card.exercise.type === 'shadowing' ? 'shadowPhrases' : 'pronPhrases', 1).catch(() => {});
      }
      return;
    }
    if (card.kind === 'vocab') {
      const next = { ...card.vocab, review: applyReview(card.vocab.review, result.correct ? 'good' : 'fail') };
      if (result.correct) {
        next.recognized = true;
        next.passiveScore = Math.min(100, next.passiveScore + 10);
      }
      await saveVocab(next);
      await bumpActivity('vocabReviews', 1).catch(() => {});
      return;
    }
    await reviewMistake(card.mistake, result.correct ? 'good' : 'fail');
    if (result.correct) {
      await markMistakePipeline(card.mistake, 'repeatedOk').catch(() => {});
      await updateActivity({ oldMistakeFixed: true }).catch(() => {});
    }
  }

  async function submit(text = answer, usedVoice = false) {
    if (!card || checking || (card.kind !== 'intro' && !text.trim())) return;
    setChecking(true);
    try {
      const result = await evaluate(text);
      setAnswer(text);
      await persistResult(result, usedVoice, text);
      const points = card.kind === 'intro' ? 1 : result.correct ? 5 : 1;
      await addXp(points).catch(() => {});
      setStats((current) => ({
        done: current.done + 1,
        correct: current.correct + (result.correct ? 1 : 0),
        points: current.points + points,
      }));
      setFeedback(result);

      if (!result.correct && card.retryCount === 0 && mode !== 'boss') {
        const retry: FeedCard = { ...card, instanceId: `${card.instanceId}-retry`, retryCount: 1 };
        setCards((current) => {
          if (!current) return current;
          const insertAt = Math.min(current.length, index + 3);
          return [...current.slice(0, insertAt), retry, ...current.slice(insertAt)];
        });
      }
    } catch (error: any) {
      setFeedback({ correct: false, score: 0, expected: '', explanation: String(error?.message ?? error) });
    } finally {
      setChecking(false);
    }
  }

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, expectedForVoice ? referenceHint(expectedForVoice) : undefined);
        setAnswer(text);
        await submit(text, true);
      } catch (error: any) {
        setFeedback({ correct: false, score: 0, expected: '', explanation: `Nu am putut transcrie: ${String(error?.message ?? error)}` });
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setFeedback({ correct: false, score: 0, expected: '', explanation: 'Nu am acces la microfon.' });
    }
  }

  async function completeSession() {
    if (completedRef.current) return;
    completedRef.current = true;
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    await recordMicroDaily(stats.correct, stats.done, elapsed, mode === 'daily').catch(() => {});
    if (stats.done > 0) await updateActivity({ lessonDone: true }).catch(() => {});

    if (mode === 'boss') {
      const results = await getBossResults().catch(() => []);
      const earlierResults = results.filter((item) => item.weekId !== isoWeekId());
      const previous = earlierResults[earlierResults.length - 1];
      const score = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0;
      const result: BossResult = {
        weekId: isoWeekId(),
        date: todayStr(),
        cards: stats.done,
        correct: stats.correct,
        score,
        durationSec: elapsed,
      };
      await saveBossResult(result).catch(() => {});
      setBossComparison(previous ? score - previous.score : null);
      await updateActivity({ testDone: true }).catch(() => {});
    }
    setFinished(true);
  }

  async function next() {
    if (!cards) return;
    setAnswer('');
    setFeedback(null);
    if (index + 1 >= cards.length) await completeSession();
    else setIndex((value) => value + 1);
  }

  async function addMore() {
    if (!profile || !cards) return;
    setChecking(true);
    try {
      const excluded = cards.map(feedCardIdentity);
      const more = await buildMicroFeed(mode === 'rescue' ? 'rescue' : 'daily', profile.currentLevel, 3, excluded);
      setCards(more);
      coreCount.current = more.length;
      setIndex(0);
      setAnswer('');
      setFeedback(null);
      setStats({ done: 0, correct: 0, points: 0 });
      setFinished(false);
      completedRef.current = false;
      startedAt.current = Date.now();
    } finally {
      setChecking(false);
    }
  }

  if (loadError) {
    return <div className="page"><div className="error-banner">{loadError}</div><button onClick={load}>Reîncearcă</button></div>;
  }
  if (!cards || !profile) return <div className="page"><p><span className="spinner" /> Se construiește antrenamentul tău…</p></div>;

  if (cards.length === 0) {
    return (
      <div className="page micro-page">
        <h1><Icon name={copy.icon} size={24} />{copy.title}</h1>
        <div className="card micro-complete"><Icon name="checkCircle" size={42} /><h2>Totul este la zi</h2><p className="muted">Nu ai nimic pe cale să fie uitat acum.</p></div>
        <button className="btn-primary" onClick={() => navigate('/learn')}>Învață ceva nou</button>
      </div>
    );
  }

  if (finished) {
    const accuracy = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0;
    return (
      <div className="page micro-page">
        <div className="card micro-complete">
          <Icon name={mode === 'boss' ? 'trophy' : 'party'} size={48} />
          <h1>{mode === 'boss' ? 'Boss Battle terminat!' : 'Antrenament terminat!'}</h1>
          <p className="muted">Ai lucrat activ, nu doar ai citit.</p>
          <div className="stat-grid">
            <div className="stat-tile"><div className="value">{stats.done}</div><div className="label">carduri</div></div>
            <div className="stat-tile"><div className="value">{accuracy}%</div><div className="label">corecte</div></div>
            <div className="stat-tile"><div className="value">+{stats.points}</div><div className="label">XP</div></div>
          </div>
          {bossComparison != null && (
            <div className={bossComparison >= 0 ? 'success-banner' : 'info-banner'}>
              {bossComparison >= 0 ? '+' : ''}{bossComparison} puncte față de ultimul Boss Battle.
            </div>
          )}
          <div className="btn-row" style={{ justifyContent: 'center' }}>
            {mode !== 'boss' && <button className="btn-primary" onClick={addMore}>Mai fac încă 2 minute</button>}
            <button onClick={() => navigate('/')}>Înapoi acasă</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page micro-page">
      <div className="micro-head">
        <div>
          <h1><Icon name={copy.icon} size={24} />{copy.title}</h1>
          <p className="tiny">{copy.subtitle}</p>
        </div>
        <span className="level-pill">{profile.currentLevel}</span>
      </div>
      <div className="bar micro-progress"><div style={{ width: `${progress}%` }} /></div>
      <div className="micro-meta">
        <span>{Math.min(index + 1, cards.length)}/{cards.length}</span>
        <span>{stats.correct} corecte</span>
        {cards.length > coreCount.current && <span>include reîncercări</span>}
      </div>

      {card && (
        <div className={`card micro-card ${feedback ? (feedback.correct ? 'micro-correct' : 'micro-wrong') : ''}`}>
          <MicroCardPrompt card={card} mistakePrompt={mistakePrompt} answer={answer} setAnswer={setAnswer} onSubmit={submit} />

          {card.kind !== 'intro' && !feedback && (
            <>
              {card.kind === 'curriculum' && isListeningExercise(card.exercise) && (
                <button className="listen-primary" onClick={() => speak(audioText(card.exercise, card.lesson), 0.92)}>
                  <Icon name="headphones" />Ascultă fără text
                </button>
              )}
              {!(card.kind === 'curriculum' && card.exercise.type === 'multiple_choice') && (
                <>
                  <div className="micro-answer-row">
                    <input
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder={card.kind === 'curriculum' && isOpenExercise(card.exercise) ? 'Răspunde în engleză…' : 'Scrie răspunsul…'}
                      disabled={checking || recording}
                      onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                    />
                    <button className={recording ? 'btn-danger mic-pulse' : 'btn-primary'} onClick={toggleMic} disabled={checking} aria-label={recording ? 'Oprește' : 'Răspunde vocal'}>
                      <Icon name={recording ? 'stop' : 'mic'} />
                    </button>
                  </div>
                  <button onClick={() => submit()} disabled={!answer.trim() || checking}>
                    {checking ? <><span className="spinner" /> Se verifică…</> : 'Verifică răspunsul'}
                  </button>
                </>
              )}
            </>
          )}

          {card.kind === 'intro' && !feedback && (
            <button className="btn-primary" onClick={() => submit('am înțeles')} disabled={checking}>Am înțeles — exersează-mă</button>
          )}

          {feedback && (
            <div className="micro-feedback">
              <strong>{feedback.correct ? '✓ Corect' : card.retryCount > 0 ? 'Încă o dată' : 'Se întoarce peste 2 carduri'}</strong>
              <p>{feedback.explanation}</p>
              {!feedback.correct && feedback.expected && (
                <button className="btn-ghost" onClick={() => speak(feedback.expected, 0.9)}><Icon name="volume" />Ascultă varianta corectă</button>
              )}
              <button className="btn-primary" onClick={next}>{index + 1 >= cards.length ? 'Vezi rezultatul' : 'Următorul →'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MicroCardPrompt({ card, mistakePrompt, answer, setAnswer, onSubmit }: {
  card: FeedCard;
  mistakePrompt: string;
  answer: string;
  setAnswer: (answer: string) => void;
  onSubmit: (answer?: string) => void;
}) {
  if (card.kind === 'intro') {
    return (
      <>
        <span className="badge">O singură idee nouă</span>
        <h2>{card.lesson.title_ro}</h2>
        <p className="micro-rule">{card.lesson.explanation_ro}</p>
        <div className="micro-examples">
          {card.lesson.examples.slice(0, 3).map((example) => (
            <button key={example.en} className="micro-example" onClick={() => speak(example.en, 0.92)}>
              <span><strong>{example.en}</strong><small>{example.ro}</small></span><Icon name="volume" />
            </button>
          ))}
        </div>
      </>
    );
  }
  if (card.kind === 'mistake') {
    return (
      <>
        <span className="badge">Greșeala ta</span>
        <h2>{mistakePrompt ? `Spune în engleză: „${mistakePrompt}”` : 'Reformulează pentru contextul salvat'}</h2>
        <p className="micro-old-answer">Atunci ai spus: {card.mistake.original}</p>
        {!mistakePrompt && <p className="micro-rule"><strong>Indiciu de context:</strong> {card.mistake.explanationRo}</p>}
      </>
    );
  }
  if (card.kind === 'vocab') {
    return (
      <>
        <span className="badge">Recuperare activă</span>
        <h2>{card.vocab.translation}</h2>
        <p className="muted">Scrie sau spune expresia în engleză. O poți folosi într-o propoziție.</p>
      </>
    );
  }
  const exercise = card.exercise;
  return (
    <>
      <span className="badge soft">{labelForExercise(exercise.type)}</span>
      <h2>{exercise.prompt_ro}</h2>
      {exercise.content && <p className="micro-content">{exercise.content}</p>}
      {exercise.type === 'sentence_order' && exercise.tokens && (
        <div className="token-builder">
          {exercise.tokens.map((token, index) => (
            <button key={`${token}-${index}`} className="chip" onClick={() => setAnswer(`${answer} ${token}`.trim())}>{token}</button>
          ))}
          {answer && <button className="btn-ghost" onClick={() => setAnswer('')}><Icon name="undo" />Șterge</button>}
        </div>
      )}
      {exercise.type === 'multiple_choice' && exercise.options && (
        <div className="micro-options">
          {exercise.options.map((option) => <button key={option} onClick={() => onSubmit(option)}>{option}</button>)}
        </div>
      )}
    </>
  );
}

function labelForExercise(type: string): string {
  const labels: Record<string, string> = {
    multiple_choice: 'Alege', active_recall: 'Fără indicii', sentence_order: 'Construiește', gap_fill: 'Completează',
    translation: 'Tradu', dictation: 'Dictare', listening_comprehension: 'Ascultare', listening_checkpoint: 'Ascultare',
    pronunciation: 'Pronunție', shadowing: 'Shadowing', quick_transfer: 'Transfer', transfer: 'Transfer',
    targeted_retry: 'Reîncearcă', scenario_response: 'Situație reală', unseen_transfer: 'Context nou',
  };
  return labels[type] ?? 'Microexercițiu';
}
