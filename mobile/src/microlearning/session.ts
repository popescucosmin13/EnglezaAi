import type { Cefr, Mistake, VocabItem } from '../types';
import { getMistakes, getVocab } from '../db/db';
import { prioritizeMistakes, dedupeMistakes } from '../logic/engine';
import { isDue } from '../srs/ladder';
import { isFeedExercise, isListeningExercise, loadCurriculum } from './curriculum';
import { getMicrolearningProgress } from './state';
import type { CurriculumExercise, CurriculumLesson, FeedCard, FeedMode, MicrolearningProgress } from './types';

function cardId(prefix: string, id: string): string {
  return `${prefix}-${id}-${Math.random().toString(36).slice(2, 7)}`;
}

function curriculumCard(lesson: CurriculumLesson, exercise: CurriculumExercise): FeedCard {
  return { kind: 'curriculum', lesson, exercise, instanceId: cardId('curriculum', exercise.id), retryCount: 0 };
}

function mistakeCard(mistake: Mistake): FeedCard {
  return { kind: 'mistake', mistake, instanceId: cardId('mistake', mistake.id), retryCount: 0 };
}

function vocabCard(vocab: VocabItem): FeedCard {
  return { kind: 'vocab', vocab, instanceId: cardId('vocab', vocab.id), retryCount: 0 };
}

function introCard(lesson: CurriculumLesson): FeedCard {
  return { kind: 'intro', lesson, instanceId: cardId('intro', lesson.lesson_id), retryCount: 0 };
}

function exerciseIndex(lessons: CurriculumLesson[]): Map<string, { lesson: CurriculumLesson; exercise: CurriculumExercise }> {
  const index = new Map<string, { lesson: CurriculumLesson; exercise: CurriculumExercise }>();
  for (const lesson of lessons) {
    for (const exercise of lesson.exercises) index.set(exercise.id, { lesson, exercise });
  }
  return index;
}

function dueCurriculum(lessons: CurriculumLesson[], progress: MicrolearningProgress): FeedCard[] {
  const index = exerciseIndex(lessons);
  return Object.entries(progress.exercises)
    .filter(([, memory]) => isDue(memory))
    .sort(([, a], [, b]) => a.nextReviewAt.localeCompare(b.nextReviewAt) || a.lastScore - b.lastScore)
    .map(([id]) => index.get(id))
    .filter((item): item is { lesson: CurriculumLesson; exercise: CurriculumExercise } => Boolean(item) && isFeedExercise(item!.exercise))
    .map(({ lesson, exercise }) => curriculumCard(lesson, exercise));
}

function unseenCurriculum(lessons: CurriculumLesson[], progress: MicrolearningProgress, exclude: Set<string>): FeedCard[] {
  const recent = new Set(progress.recentExerciseIds.slice(-30));
  const result: FeedCard[] = [];
  for (const lesson of lessons) {
    for (const exercise of lesson.exercises) {
      if (!isFeedExercise(exercise) || progress.exercises[exercise.id] || recent.has(exercise.id) || exclude.has(exercise.id)) continue;
      result.push(curriculumCard(lesson, exercise));
    }
  }
  return result;
}

function pushUnique(target: FeedCard[], card: FeedCard | undefined, used: Set<string>): void {
  if (!card) return;
  const identity = card.kind === 'curriculum'
    ? card.exercise.id
    : card.kind === 'intro'
      ? `intro:${card.lesson.lesson_id}`
      : `${card.kind}:${card.kind === 'mistake' ? card.mistake.id : card.vocab.id}`;
  if (used.has(identity)) return;
  used.add(identity);
  target.push(card);
}

function matchingLessons(all: CurriculumLesson[], level: Cefr): CurriculumLesson[] {
  const direct = all.filter((lesson) => lesson.level === level);
  if (direct.length > 0) return direct;
  return all.filter((lesson) => lesson.level === 'B2');
}

export async function buildMicroFeed(
  mode: FeedMode,
  level: Cefr,
  count = mode === 'rescue' ? 4 : 5,
  excludedIds: string[] = [],
): Promise<FeedCard[]> {
  const [curriculum, progress, mistakes, vocab] = await Promise.all([
    loadCurriculum(),
    getMicrolearningProgress(),
    getMistakes(),
    getVocab(),
  ]);
  const lessons = matchingLessons(curriculum.lessons, level);
  const excluded = new Set(excludedIds);
  // Repetițiile vechi rămân eligibile chiar dacă utilizatorul a avansat între timp la alt nivel.
  // Conținutul nou vine din nivelul curent; memoria scadentă poate veni din orice nivel parcurs.
  const dueCourse = dueCurriculum(curriculum.lessons, progress).filter((card) => card.kind !== 'curriculum' || !excluded.has(card.exercise.id));
  const dueMistakes = prioritizeMistakes(dedupeMistakes(mistakes).filter((mistake) => mistake.status !== 'mastered' && isDue(mistake.review)))
    .filter((mistake) => !excluded.has(`mistake:${mistake.id}`))
    .map(mistakeCard);
  const dueVocab = vocab
    .filter((item) => Boolean(item.translation) && isDue(item.review) && !excluded.has(`vocab:${item.id}`))
    .sort((a, b) => a.activeScore - b.activeScore)
    .map(vocabCard);
  const unseen = unseenCurriculum(lessons, progress, excluded);
  const used = new Set<string>();
  const cards: FeedCard[] = [];

  if (mode === 'rescue') {
    const pools = [dueMistakes, dueVocab, dueCourse];
    for (let row = 0; cards.length < count; row++) {
      let added = false;
      for (const pool of pools) {
        if (pool[row]) { pushUnique(cards, pool[row], used); added = true; }
        if (cards.length >= count) break;
      }
      if (!added) break;
    }
    return cards;
  }

  if (mode === 'boss') {
    pushUnique(cards, dueMistakes[0], used);
    pushUnique(cards, dueVocab[0], used);
    pushUnique(cards, dueCourse.find((card) => card.kind === 'curriculum' && !isListeningExercise(card.exercise)), used);
    pushUnique(cards, dueCourse.find((card) => card.kind === 'curriculum' && isListeningExercise(card.exercise)), used);
    pushUnique(cards, unseen.find((card) => card.kind === 'curriculum' && ['transfer', 'quick_transfer', 'unseen_transfer'].includes(card.exercise.type)), used);
  } else {
    pushUnique(cards, dueCourse[0], used);
    pushUnique(cards, dueMistakes[0], used);
    pushUnique(cards, dueVocab[0], used);
    const newLesson = unseen[0]?.kind === 'curriculum' ? unseen[0].lesson : lessons[0];
    if (newLesson && !progress.lessonViews[newLesson.lesson_id]) pushUnique(cards, introCard(newLesson), used);
    pushUnique(cards, unseen.find((card) => card.kind === 'curriculum' && card.lesson.lesson_id === newLesson?.lesson_id), used);
  }

  const fallback = [...dueMistakes, ...dueVocab, ...dueCourse, ...unseen];
  for (const card of fallback) {
    if (cards.length >= count) break;
    pushUnique(cards, card, used);
  }
  return cards.slice(0, count);
}

export function feedCardIdentity(card: FeedCard): string {
  if (card.kind === 'curriculum') return card.exercise.id;
  if (card.kind === 'intro') return `intro:${card.lesson.lesson_id}`;
  return `${card.kind}:${card.kind === 'mistake' ? card.mistake.id : card.vocab.id}`;
}
