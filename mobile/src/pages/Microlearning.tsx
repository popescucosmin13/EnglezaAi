import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Profile, PronunciationResult } from '../types';
import { addXp, bumpActivity, getProfile, newId, savePronResult, saveVocab, todayStr, updateActivity } from '../db/db';
import { trackAcquisition } from '../acquisition/client';
import { applyReview } from '../srs/ladder';
import { containsExpression, ensureMistakePromptRo, evaluateReviewAnswer, markMistakePipeline, reviewMistake } from '../logic/engine';
import { isoWeekId } from '../logic/metrics';
import { hasOpenRouterKey } from '../settings';
import { Recorder } from '../audio/recorder';
import { speak } from '../audio/tts';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { audioText, evaluateCurriculumAnswer, isListeningExercise, isOpenExercise, normalizeAnswer } from '../microlearning/curriculum';
import { buildMicroFeed, feedCardIdentity } from '../microlearning/session';
import { getBossResults, markLessonViewed, recordExerciseAttempt, recordMicroDaily, saveBossResult } from '../microlearning/state';
import type { BossResult, CardEvaluation, FeedCard, FeedMode } from '../microlearning/types';
import { Banner, Bar, Button, ButtonRow, Card, Chip, ChipRow, Field, H1, H2, Muted, Pill, Screen, Spinner, StatGrid, StatTile, Tiny } from '../ui';
import { usePalette } from '../theme';

const MODE_COPY: Record<FeedMode, { title: string; subtitle: string; icon: 'zap' | 'save' | 'trophy' }> = {
  daily: { title: 'Antrenamentul de 3 minute', subtitle: '5 pași aleși din memoria și nivelul tău', icon: 'zap' },
  rescue: { title: 'Salvează de la uitare', subtitle: 'Doar elementele care trebuie recuperate acum', icon: 'save' },
  boss: { title: 'Boss Battle', subtitle: 'Testul săptămânii, fără indicii', icon: 'trophy' },
};
interface Stats { done: number; correct: number; points: number }

export default function Microlearning({ defaultMode = 'daily' }: { defaultMode?: FeedMode }) {
  const p = usePalette();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: FeedMode = params.mode === 'rescue' || params.mode === 'boss' ? params.mode : defaultMode;
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
    setLoadError(''); setCards(null); setIndex(0); setAnswer(''); setFeedback(null); setFinished(false);
    completedRef.current = false; setStats({ done: 0, correct: 0, points: 0 }); startedAt.current = Date.now();
    try {
      const currentProfile = await getProfile();
      const nextCards = await buildMicroFeed(mode, currentProfile.currentLevel);
      setProfile(currentProfile); setCards(nextCards); coreCount.current = nextCards.length;
      if (nextCards.length) trackAcquisition('lesson_started');
    } catch (error: any) { setLoadError(String(error?.message ?? error)); }
  }

  useEffect(() => { void load(); return () => recorder.current.cancel(); }, [mode]);
  const card = cards?.[index] ?? null;
  const progress = cards?.length ? (index + (feedback ? 1 : 0)) / cards.length : 0;
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
    ensureMistakePromptRo(card.mistake).then((prompt) => { if (active) setMistakePrompt(prompt || ''); }).catch(() => {});
    return () => { active = false; };
  }, [card?.instanceId]);

  async function evaluate(text: string): Promise<CardEvaluation> {
    if (!card) throw new Error('Cardul nu mai este disponibil.');
    if (card.kind === 'intro') return { correct: true, score: 100, expected: '', explanation: 'Regula intră imediat în practică.' };
    if (card.kind === 'curriculum') return evaluateCurriculumAnswer(card.exercise, text);
    if (card.kind === 'vocab') {
      const correct = containsExpression(text, card.vocab.word);
      return { correct, score: correct ? 100 : 0, expected: card.vocab.word, explanation: correct ? 'Expresia a fost recuperată.' : `Folosește expresia: ${card.vocab.word}` };
    }
    const mistake = card.mistake;
    const normalized = normalizeAnswer(text);
    const expected = [mistake.correctFragment, mistake.corrected].filter((value): value is string => Boolean(value));
    const fragment = normalizeAnswer(mistake.correctFragment ?? '');
    const localPass = expected.some((value) => normalizeAnswer(value) === normalized) || (fragment.length > 0 && normalized.includes(fragment));
    if (!localPass || !hasOpenRouterKey()) return { correct: localPass, score: localPass ? 100 : 0, expected: mistake.corrected, explanation: localPass ? 'Ai reparat greșeala.' : `Varianta corectă: ${mistake.corrected}` };
    const result = await evaluateReviewAnswer(profile ?? await getProfile(), mistake, text, localPass);
    return { correct: result.verdict, score: result.verdict ? 100 : 35, expected: mistake.corrected, explanation: result.verdict ? 'Ai reparat greșeala în propoziție.' : result.otherErrors.length ? result.otherErrors.map((error) => `${error.wrong} → ${error.correct}`).join(' · ') : result.noteRo || `Varianta corectă: ${mistake.corrected}` };
  }

  async function persistResult(result: CardEvaluation, usedVoice: boolean, submittedAnswer: string) {
    if (!card) return;
    if (card.kind === 'intro') { await markLessonViewed(card.lesson.lesson_id); return; }
    if (card.kind === 'curriculum') {
      await recordExerciseAttempt(card.exercise.id, card.lesson.lesson_id, result.correct, result.score);
      if (usedVoice && ['pronunciation', 'shadowing'].includes(card.exercise.type)) {
        const reference = audioText(card.exercise, card.lesson);
        const assessment = sttDiffAssessment(reference, submittedAnswer);
        const pronunciation: PronunciationResult = { id: newId(), date: todayStr(), exercise: card.exercise.type === 'shadowing' ? 'shadowing' : 'repeat', phrase: reference, targets: [], score: assessment.accuracyScore, wordScores: assessment.words, source: 'stt-diff' };
        await savePronResult(pronunciation).catch(() => {});
        await bumpActivity(card.exercise.type === 'shadowing' ? 'shadowPhrases' : 'pronPhrases', 1).catch(() => {});
      }
      return;
    }
    if (card.kind === 'vocab') {
      const next = { ...card.vocab, review: applyReview(card.vocab.review, result.correct ? 'good' : 'fail') };
      if (result.correct) { next.recognized = true; next.passiveScore = Math.min(100, next.passiveScore + 10); }
      await saveVocab(next); await bumpActivity('vocabReviews', 1).catch(() => {}); return;
    }
    await reviewMistake(card.mistake, result.correct ? 'good' : 'fail');
    if (result.correct) { await markMistakePipeline(card.mistake, 'repeatedOk').catch(() => {}); await updateActivity({ oldMistakeFixed: true }).catch(() => {}); }
  }

  async function submit(text = answer, usedVoice = false) {
    if (!card || checking || (card.kind !== 'intro' && !text.trim())) return;
    setChecking(true);
    try {
      const result = await evaluate(text);
      setAnswer(text); await persistResult(result, usedVoice, text);
      const points = card.kind === 'intro' ? 1 : result.correct ? 5 : 1;
      await addXp(points).catch(() => {});
      setStats((current) => ({ done: current.done + 1, correct: current.correct + (result.correct ? 1 : 0), points: current.points + points }));
      setFeedback(result);
      if (!result.correct && card.retryCount === 0 && mode !== 'boss') {
        const retry: FeedCard = { ...card, instanceId: `${card.instanceId}-retry`, retryCount: 1 };
        setCards((current) => current ? [...current.slice(0, Math.min(current.length, index + 3)), retry, ...current.slice(Math.min(current.length, index + 3))] : current);
      }
    } catch (error: any) { setFeedback({ correct: false, score: 0, expected: '', explanation: String(error?.message ?? error) }); }
    finally { setChecking(false); }
  }

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        let text = '';
        try { ({ text } = await transcribe(audio, undefined, expectedForVoice ? referenceHint(expectedForVoice) : undefined)); } finally { await audio.dispose(); }
        setAnswer(text); await submit(text, true);
      } catch (error: any) { setFeedback({ correct: false, score: 0, expected: '', explanation: `Nu am putut transcrie: ${String(error?.message ?? error)}` }); }
      return;
    }
    try { await recorder.current.start(); setRecording(true); }
    catch { setFeedback({ correct: false, score: 0, expected: '', explanation: 'Nu am acces la microfon.' }); }
  }

  async function completeSession() {
    if (completedRef.current) return;
    completedRef.current = true;
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    await recordMicroDaily(stats.correct, stats.done, elapsed, mode === 'daily').catch(() => {});
    if (stats.done > 0) await updateActivity({ lessonDone: true }).catch(() => {});
    if (mode === 'boss') {
      const results = await getBossResults().catch(() => []);
      const previous = results.filter((item) => item.weekId !== isoWeekId()).at(-1);
      const score = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0;
      const result: BossResult = { weekId: isoWeekId(), date: todayStr(), cards: stats.done, correct: stats.correct, score, durationSec: elapsed };
      await saveBossResult(result).catch(() => {}); setBossComparison(previous ? score - previous.score : null); await updateActivity({ testDone: true }).catch(() => {});
    }
    setFinished(true);
  }

  async function next() {
    if (!cards) return;
    setAnswer(''); setFeedback(null);
    if (index + 1 >= cards.length) await completeSession(); else setIndex((value) => value + 1);
  }

  async function addMore() {
    if (!profile || !cards) return;
    setChecking(true);
    try {
      const more = await buildMicroFeed(mode === 'rescue' ? 'rescue' : 'daily', profile.currentLevel, 3, cards.map(feedCardIdentity));
      setCards(more); coreCount.current = more.length; setIndex(0); setAnswer(''); setFeedback(null); setStats({ done: 0, correct: 0, points: 0 }); setFinished(false); completedRef.current = false; startedAt.current = Date.now();
    } finally { setChecking(false); }
  }

  if (loadError) return <Screen><Banner kind="error">{loadError}</Banner><Button title="Reîncearcă" onPress={load} /></Screen>;
  if (!cards || !profile) return <Screen><View style={{ minHeight: 380, justifyContent: 'center' }}><Spinner size="large" /></View></Screen>;
  if (cards.length === 0) return <Screen><H1>{copy.title}</H1><Card style={{ alignItems: 'center', paddingVertical: 32 }}><View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: p.successSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.success, fontSize: 36 }}>✓</Text></View><H2>Totul este la zi</H2><Muted>Nu ai nimic pe cale să fie uitat acum.</Muted></Card><Button title="Învață ceva nou" variant="primary" onPress={() => router.replace('/learn')} /></Screen>;

  if (finished) {
    const accuracy = stats.done ? Math.round((stats.correct / stats.done) * 100) : 0;
    return <Screen><Card style={{ alignItems: 'center', paddingVertical: 30 }}><Text style={{ fontSize: 48 }}>{mode === 'boss' ? '🏆' : '🎉'}</Text><H1>{mode === 'boss' ? 'Boss Battle terminat!' : 'Antrenament terminat!'}</H1><Muted>Ai lucrat activ, nu doar ai citit.</Muted><View style={{ width: '100%', marginTop: 16 }}><StatGrid><StatTile value={stats.done} label="carduri" /><StatTile value={`${accuracy}%`} label="corecte" /><StatTile value={`+${stats.points}`} label="XP" /></StatGrid></View>{bossComparison != null ? <Banner kind={bossComparison >= 0 ? 'success' : 'info'}>{bossComparison >= 0 ? '+' : ''}{bossComparison} puncte față de ultimul Boss Battle.</Banner> : null}<ButtonRow style={{ justifyContent: 'center' }}>{mode !== 'boss' ? <Button title="Mai fac încă 2 minute" variant="primary" onPress={addMore} /> : null}<Button title="Înapoi acasă" onPress={() => router.replace('/')} /></ButtonRow></Card></Screen>;
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><View style={{ flex: 1 }}><H1>{copy.title}</H1><Tiny>{copy.subtitle}</Tiny></View><Pill kind="level">{profile.currentLevel}</Pill></View>
      <Bar ratio={progress} style={{ marginTop: 14 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><Tiny>{Math.min(index + 1, cards.length)}/{cards.length}</Tiny><Tiny>{stats.correct} corecte{cards.length > coreCount.current ? ' · include reîncercări' : ''}</Tiny></View>
      {card ? <Card style={{ padding: 20, borderColor: feedback ? (feedback.correct ? p.success : p.danger) : p.border }}>
        <MicroCardPrompt card={card} mistakePrompt={mistakePrompt} answer={answer} setAnswer={setAnswer} onSubmit={submit} />
        {card.kind !== 'intro' && !feedback ? <>
          {card.kind === 'curriculum' && isListeningExercise(card.exercise) ? <Button title="Ascultă fără text" icon="headphones" onPress={() => void speak(audioText(card.exercise, card.lesson), 0.92)} style={{ marginVertical: 10 }} /> : null}
          {!(card.kind === 'curriculum' && card.exercise.type === 'multiple_choice') ? <>
            <Field value={answer} onChange={setAnswer} placeholder={card.kind === 'curriculum' && isOpenExercise(card.exercise) ? 'Răspunde în engleză…' : 'Scrie răspunsul…'} editable={!checking && !recording} />
            <ButtonRow><Button title={recording ? 'Oprește' : 'Răspunde vocal'} icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'primary'} onPress={toggleMic} disabled={checking} /><Button title="Verifică răspunsul" busy={checking} onPress={() => submit()} disabled={!answer.trim()} /></ButtonRow>
          </> : null}
        </> : null}
        {card.kind === 'intro' && !feedback ? <Button title="Am înțeles — exersează-mă" variant="primary" onPress={() => submit('am înțeles')} busy={checking} /> : null}
        {feedback ? <View style={{ marginTop: 14 }}><Banner kind={feedback.correct ? 'success' : 'warn'}>{feedback.correct ? 'Corect' : card.retryCount > 0 ? 'Încă o dată' : 'Se întoarce peste 2 carduri'} · {feedback.explanation}</Banner>{!feedback.correct && feedback.expected ? <Button title="Ascultă varianta corectă" icon="volume" variant="ghost" onPress={() => void speak(feedback.expected, 0.9)} /> : null}<Button title={index + 1 >= cards.length ? 'Vezi rezultatul' : 'Următorul'} variant="primary" onPress={next} style={{ marginTop: 10 }} /></View> : null}
      </Card> : null}
    </Screen>
  );
}

function MicroCardPrompt({ card, mistakePrompt, answer, setAnswer, onSubmit }: { card: FeedCard; mistakePrompt: string; answer: string; setAnswer: (answer: string) => void; onSubmit: (answer?: string) => void }) {
  const p = usePalette();
  if (card.kind === 'intro') return <><Pill kind="badge">O singură idee nouă</Pill><H2>{card.lesson.title_ro}</H2><Text style={{ color: p.ink, fontSize: 17, lineHeight: 25, fontWeight: '600', marginVertical: 10 }}>{card.lesson.explanation_ro}</Text><View style={{ gap: 8 }}>{card.lesson.examples.slice(0, 3).map((example) => <Button key={example.en} title={`${example.en} — ${example.ro}`} icon="volume" onPress={() => void speak(example.en, 0.92)} style={{ justifyContent: 'flex-start' }} />)}</View></>;
  if (card.kind === 'mistake') return <><Pill kind="badge">Greșeala ta</Pill><H2>{mistakePrompt ? `Spune în engleză: „${mistakePrompt}”` : 'Reformulează pentru contextul salvat'}</H2><Text style={{ color: p.danger, textDecorationLine: 'line-through', marginVertical: 8 }}>Atunci ai spus: {card.mistake.original}</Text>{!mistakePrompt ? <Muted>Indiciu: {card.mistake.explanationRo}</Muted> : null}</>;
  if (card.kind === 'vocab') return <><Pill kind="badge">Recuperare activă</Pill><H2>{card.vocab.translation}</H2><Muted>Scrie sau spune expresia în engleză. O poți folosi într-o propoziție.</Muted></>;
  const exercise = card.exercise;
  return <><Pill kind="badgeSoft">{labelForExercise(exercise.type)}</Pill><H2>{exercise.prompt_ro}</H2>{exercise.content ? <View style={{ backgroundColor: p.bgSoft, borderRadius: 14, padding: 14 }}><Text style={{ color: p.ink, lineHeight: 22 }}>{exercise.content}</Text></View> : null}{exercise.type === 'sentence_order' && exercise.tokens ? <ChipRow>{exercise.tokens.map((token, i) => <Chip key={`${token}-${i}`} label={token} onPress={() => setAnswer(`${answer} ${token}`.trim())} />)}{answer ? <Chip label="Șterge" onPress={() => setAnswer('')} /> : null}</ChipRow> : null}{exercise.type === 'multiple_choice' && exercise.options ? <View style={{ gap: 8, marginTop: 12 }}>{exercise.options.map((option) => <Button key={option} title={option} onPress={() => onSubmit(option)} style={{ justifyContent: 'flex-start' }} />)}</View> : null}</>;
}

function labelForExercise(type: string): string {
  return ({ multiple_choice: 'Alege', active_recall: 'Fără indicii', sentence_order: 'Construiește', gap_fill: 'Completează', translation: 'Tradu', dictation: 'Dictare', listening_comprehension: 'Ascultare', listening_checkpoint: 'Ascultare', pronunciation: 'Pronunție', shadowing: 'Shadowing', quick_transfer: 'Transfer', transfer: 'Transfer', targeted_retry: 'Reîncearcă', scenario_response: 'Situație reală', unseen_transfer: 'Context nou' } as Record<string, string>)[type] ?? 'Microexercițiu';
}
