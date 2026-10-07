import { getMetaDoc, saveMetaDoc, getMistakes, getVocab } from '../db/db';
import { isDue, newReviewState, applyReview, todayStr } from '../srs/ladder';
import type {
  BossResult,
  DueOverview,
  MicroDailySummary,
  MicrolearningProgress,
  ReminderPreferences,
  StoryProgress,
  VoiceChallengeResult,
} from './types';

const PROGRESS_DOC = 'microlearning-progress-v1';
const VOICE_DOC = 'voice-challenges-v1';
const BOSS_DOC = 'boss-results-v1';
const STORY_DOC = 'daily-story-v1';
const REMINDER_DOC = 'reminder-preferences-v1';

export function emptyMicrolearningProgress(): MicrolearningProgress {
  return { version: 1, exercises: {}, lessonViews: {}, recentExerciseIds: [], daily: {} };
}

export async function getMicrolearningProgress(): Promise<MicrolearningProgress> {
  return (await getMetaDoc<MicrolearningProgress>(PROGRESS_DOC)) ?? emptyMicrolearningProgress();
}

export async function saveMicrolearningProgress(progress: MicrolearningProgress): Promise<void> {
  const dailyEntries = Object.entries(progress.daily).sort(([a], [b]) => b.localeCompare(a)).slice(0, 120);
  progress.daily = Object.fromEntries(dailyEntries);
  progress.recentExerciseIds = progress.recentExerciseIds.slice(-80);
  await saveMetaDoc(PROGRESS_DOC, { ...progress });
}

export async function recordExerciseAttempt(
  exerciseId: string,
  lessonId: string,
  correct: boolean,
  score: number,
): Promise<MicrolearningProgress> {
  const progress = await getMicrolearningProgress();
  const previous = progress.exercises[exerciseId];
  const baseReview = previous ?? { ...newReviewState(), lessonId, attempts: 0, correctAttempts: 0, lastScore: 0, lastAttemptAt: '' };
  const review = applyReview(baseReview, correct ? (score >= 95 ? 'fast' : 'good') : 'fail');
  progress.exercises[exerciseId] = {
    ...baseReview,
    ...review,
    lessonId,
    attempts: baseReview.attempts + 1,
    correctAttempts: baseReview.correctAttempts + (correct ? 1 : 0),
    lastScore: score,
    lastAttemptAt: new Date().toISOString(),
  };
  progress.recentExerciseIds = [...progress.recentExerciseIds.filter((id) => id !== exerciseId), exerciseId];
  await saveMicrolearningProgress(progress);
  return progress;
}

export async function markLessonViewed(lessonId: string): Promise<void> {
  const progress = await getMicrolearningProgress();
  progress.lessonViews[lessonId] = new Date().toISOString();
  await saveMicrolearningProgress(progress);
}

export async function recordMicroDaily(correct: number, cards: number, seconds: number, completedCore: boolean): Promise<void> {
  const progress = await getMicrolearningProgress();
  const date = todayStr();
  const current: MicroDailySummary = progress.daily[date] ?? { date, sessions: 0, cards: 0, correct: 0, seconds: 0, completedCore: false };
  progress.daily[date] = {
    date,
    sessions: current.sessions + 1,
    cards: current.cards + cards,
    correct: current.correct + correct,
    seconds: current.seconds + seconds,
    completedCore: current.completedCore || completedCore,
  };
  await saveMicrolearningProgress(progress);
}

export async function getDueOverview(): Promise<DueOverview> {
  const [progress, mistakes, vocab] = await Promise.all([getMicrolearningProgress(), getMistakes(), getVocab()]);
  const curriculum = Object.values(progress.exercises).filter((memory) => isDue(memory)).length;
  const mistakeCount = mistakes.filter((mistake) => mistake.status !== 'mastered' && isDue(mistake.review)).length;
  const vocabulary = vocab.filter((item) => Boolean(item.translation) && isDue(item.review)).length;
  const total = curriculum + mistakeCount + vocabulary;
  return { total, curriculum, mistakes: mistakeCount, vocabulary, estimatedSeconds: Math.max(30, Math.min(240, total * 25)) };
}

export async function getVoiceChallengeResults(): Promise<VoiceChallengeResult[]> {
  return (await getMetaDoc<{ items: VoiceChallengeResult[] }>(VOICE_DOC))?.items ?? [];
}

export async function saveVoiceChallengeResult(result: VoiceChallengeResult): Promise<void> {
  const items = await getVoiceChallengeResults();
  await saveMetaDoc(VOICE_DOC, { items: [...items.filter((item) => item.id !== result.id), result].slice(-120) });
}

export async function getBossResults(): Promise<BossResult[]> {
  return (await getMetaDoc<{ items: BossResult[] }>(BOSS_DOC))?.items ?? [];
}

export async function saveBossResult(result: BossResult): Promise<void> {
  const items = await getBossResults();
  await saveMetaDoc(BOSS_DOC, { items: [...items.filter((item) => item.weekId !== result.weekId), result].slice(-52) });
}

export async function getStoryProgress(series: string): Promise<StoryProgress> {
  const saved = await getMetaDoc<StoryProgress>(STORY_DOC);
  if (saved?.series === series) return saved;
  return { series, nextEpisode: 0, lastCompletedDate: '', completed: [], correctAnswers: 0, spokenSummaries: 0 };
}

export async function saveStoryProgress(progress: StoryProgress): Promise<void> {
  await saveMetaDoc(STORY_DOC, { ...progress });
}

export function defaultReminderPreferences(): ReminderPreferences {
  return {
    enabled: false,
    hour: 19,
    minute: 0,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  };
}

export async function getReminderPreferences(): Promise<ReminderPreferences> {
  return (await getMetaDoc<ReminderPreferences>(REMINDER_DOC)) ?? defaultReminderPreferences();
}

export async function saveReminderPreferences(preferences: ReminderPreferences): Promise<void> {
  await saveMetaDoc(REMINDER_DOC, { ...preferences });
}
