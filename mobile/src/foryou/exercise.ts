import { expectedAnswers, isFeedExercise } from '../microlearning/curriculum';
import type { CurriculumExercise } from '../microlearning/types';

export type ForYouExerciseControl = 'choices' | 'order' | 'text' | 'unsupported';

// Răspunsurile deschise pot avea zeci de variante valide. Fără un evaluator AI
// nu le marcăm automat drept greșite în feed; păstrăm aici doar exerciții care
// pot fi verificate corect și local.
const UNSUPPORTED_IN_FOR_YOU = new Set([
  'pronunciation',
  'shadowing',
  'quick_transfer',
  'transfer',
  'scenario_response',
  'unseen_transfer',
]);

export function forYouExerciseControl(exercise: CurriculumExercise): ForYouExerciseControl {
  if (!isFeedExercise(exercise) || UNSUPPORTED_IN_FOR_YOU.has(exercise.type)) return 'unsupported';
  if (exercise.type === 'sentence_order') {
    return (exercise.tokens?.filter((token) => token.trim()).length ?? 0) >= 2 ? 'order' : 'unsupported';
  }
  if (exercise.type === 'multiple_choice') {
    return (exercise.options?.filter((option) => option.trim()).length ?? 0) >= 2 ? 'choices' : 'unsupported';
  }
  return expectedAnswers(exercise).length ? 'text' : 'unsupported';
}

export function isForYouExercise(exercise: CurriculumExercise): boolean {
  return forYouExerciseControl(exercise) !== 'unsupported';
}

export function joinOrderTokens(tokens: string[]): string {
  return tokens
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([¿¡(])\s+/g, '$1')
    .trim();
}

export function forYouExerciseLabel(exercise: CurriculumExercise): string {
  const labels: Record<string, string> = {
    multiple_choice: 'Alege',
    active_recall: 'Recuperează',
    sentence_order: 'Construiește',
    gap_fill: 'Completează',
    translation: 'Tradu',
    dictation: 'Dictare',
    listening_comprehension: 'Ascultare',
    listening_checkpoint: 'Ascultare',
    quick_transfer: 'Transfer',
    transfer: 'Transfer',
    targeted_retry: 'Reîncearcă',
    scenario_response: 'Situație reală',
    unseen_transfer: 'Context nou',
  };
  return labels[exercise.type] ?? 'Exercițiu';
}

export function forYouInputPlaceholder(exercise: CurriculumExercise): string {
  if (exercise.type === 'gap_fill') return 'Scrie cuvântul lipsă…';
  if (exercise.type === 'dictation' || exercise.type.startsWith('listening_')) return 'Scrie ce ai auzit…';
  if (exercise.type === 'scenario_response') return 'Scrie răspunsul complet…';
  if (exercise.type === 'translation') return 'Scrie traducerea în engleză…';
  return 'Scrie răspunsul în engleză…';
}
