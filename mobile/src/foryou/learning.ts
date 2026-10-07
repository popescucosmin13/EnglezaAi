import { expectedAnswers, normalizeAnswer } from '../microlearning/curriculum';
import type { CurriculumExercise, CurriculumLesson } from '../microlearning/types';
import type { ForYouCard } from './types';

export type ForYouLearningPhase = 'discover' | 'understand' | 'practice' | 'recall' | 'apply';

export interface ForYouLearningMeta {
  phase: ForYouLearningPhase;
  label: string;
  difficulty: 'Ușor' | 'Mediu' | 'Provocare';
}

export interface ForYouExerciseGuide extends ForYouLearningMeta {
  kicker: string;
  title: string;
  mission: string;
  context?: string;
  targetLabel?: string;
  target?: string;
  hints: string[];
  expected: string;
}

const PHASE_LABELS: Record<ForYouLearningPhase, string> = {
  discover: 'Descoperă',
  understand: 'Înțelege',
  practice: 'Exersează',
  recall: 'Fixează',
  apply: 'Aplică',
};

function firstExpected(exercise: CurriculumExercise): string {
  return exercise.full_answer ?? expectedAnswers(exercise)[0] ?? '';
}

function quotedTarget(prompt: string): string | undefined {
  return prompt.match(/[„“"]([^”"]+)[”"]/)?.[1]?.trim();
}

function translationFor(lesson: CurriculumLesson, english: string): string | undefined {
  if (!english) return undefined;
  return [...lesson.new_language, ...lesson.examples]
    .find((item) => normalizeAnswer(item.en) === normalizeAnswer(english))?.ro?.trim();
}

function maskedAnswer(answer: string): string {
  return answer.replace(/[A-Za-zÀ-ž]+/g, (word) => {
    if (word.length === 1) return word;
    return `${word[0]}${'_'.repeat(Math.min(7, word.length - 1))}`;
  });
}

function exercisePhase(exercise: CurriculumExercise): ForYouLearningPhase {
  if (['active_recall', 'targeted_retry', 'translation', 'dictation', 'listening_comprehension', 'listening_checkpoint'].includes(exercise.type)) return 'recall';
  if (['quick_transfer', 'transfer', 'scenario_response', 'unseen_transfer'].includes(exercise.type)) return 'apply';
  return 'practice';
}

function exerciseDifficulty(exercise: CurriculumExercise): ForYouLearningMeta['difficulty'] {
  if (['multiple_choice', 'sentence_order'].includes(exercise.type)) return 'Ușor';
  if (['active_recall', 'targeted_retry', 'dictation', 'listening_checkpoint'].includes(exercise.type)) return 'Provocare';
  return 'Mediu';
}

function exerciseTitle(exercise: CurriculumExercise): string {
  const titles: Record<string, string> = {
    multiple_choice: 'Alege varianta care exprimă ideea.',
    active_recall: 'Scrie propoziția în engleză.',
    targeted_retry: 'Recuperează această propoziție.',
    sentence_order: 'Construiește propoziția în engleză.',
    gap_fill: 'Completează propoziția.',
    translation: 'Tradu ideea în engleză.',
    dictation: 'Ascultă și scrie propoziția.',
  };
  return titles[exercise.type] ?? exercise.prompt_ro;
}

function exerciseKicker(exercise: CurriculumExercise): string {
  const kickers: Record<string, string> = {
    multiple_choice: 'Recunoaștere rapidă',
    active_recall: 'Recuperare din memorie',
    targeted_retry: 'Recuperare ghidată',
    sentence_order: 'Ordinea cuvintelor',
    gap_fill: 'Forma potrivită',
    translation: 'Sens → engleză',
    dictation: 'Sunet → scriere',
    listening_comprehension: 'Înțelegere auditivă',
    listening_checkpoint: 'Ascultare atentă',
  };
  return kickers[exercise.type] ?? 'Exercițiu în context';
}

/**
 * Transformă exercițiile de curriculum în carduri autonome. Unele prompturi au
 * fost scrise pentru finalul unei lecții; în For You nu putem presupune că
 * utilizatorul a văzut pașii anteriori.
 */
export function forYouExerciseGuide(lesson: CurriculumLesson, exercise: CurriculumExercise): ForYouExerciseGuide {
  const expected = firstExpected(exercise);
  const translation = translationFor(lesson, expected) ?? quotedTarget(exercise.prompt_ro);
  const phase = exercisePhase(exercise);
  const objectiveHint = lesson.grammar_focus?.trim()
    ? `Tipar urmărit: ${lesson.grammar_focus}.`
    : `Obiectiv: ${lesson.objective_ro}`;
  const structureHint = expected ? `Scheletul răspunsului: ${maskedAnswer(expected)}` : '';
  const targetTypes = new Set(['multiple_choice', 'active_recall', 'targeted_retry', 'sentence_order', 'translation']);

  let target: string | undefined;
  let targetLabel: string | undefined;
  if (exercise.type === 'gap_fill' && exercise.content) {
    target = exercise.content.replace(/\s+([,.!?;:])/g, '$1');
    targetLabel = 'Propoziția';
  } else if (targetTypes.has(exercise.type) && translation) {
    target = translation;
    targetLabel = exercise.type === 'sentence_order' ? 'Sensul propoziției' : 'Ideea de exprimat';
  }

  const hints = exercise.type === 'gap_fill'
    ? [
        'Privește cuvântul dinainte și cel de după spațiu: ele îți arată ce fel de formă lipsește.',
        structureHint,
      ].filter(Boolean)
    : [objectiveHint, structureHint].filter(Boolean);

  return {
    phase,
    label: PHASE_LABELS[phase],
    difficulty: exerciseDifficulty(exercise),
    kicker: exerciseKicker(exercise),
    title: exerciseTitle(exercise),
    mission: lesson.objective_ro,
    context: lesson.scenario_ro || lesson.purpose_ro,
    targetLabel,
    target,
    hints,
    expected,
  };
}

export function learningMetaForCard(card: ForYouCard): ForYouLearningMeta {
  if (card.kind === 'quiz' || card.kind === 'listening') {
    const guide = forYouExerciseGuide(card.lesson, card.exercise);
    return { phase: guide.phase, label: guide.label, difficulty: guide.difficulty };
  }
  if (card.kind === 'discovery') return { phase: 'discover', label: PHASE_LABELS.discover, difficulty: 'Ușor' };
  if (card.kind === 'phrase' || card.kind === 'dialogue' || card.kind === 'insight') {
    return { phase: 'understand', label: PHASE_LABELS.understand, difficulty: 'Ușor' };
  }
  if (card.kind === 'story') return { phase: 'practice', label: PHASE_LABELS.practice, difficulty: 'Mediu' };
  return { phase: 'recall', label: PHASE_LABELS.recall, difficulty: 'Mediu' };
}

