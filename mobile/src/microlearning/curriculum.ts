import curriculumData from '../../assets/data/microlectii_toate.json';
import type { CardEvaluation, CurriculumExercise, CurriculumFile, CurriculumLesson } from './types';

let curriculumPromise: Promise<CurriculumFile> | null = null;

/** Curriculumul este împachetat în aplicația Android, deci funcționează și offline și nu depinde de Vercel. */
export function loadCurriculum(): Promise<CurriculumFile> {
  curriculumPromise ??= Promise.resolve(curriculumData as CurriculumFile).then((data) => {
    if (!Array.isArray(data.lessons) || data.lessons.length === 0) {
      throw new Error('Curriculumul nu conține lecții valide.');
    }
    return data;
  });
  return curriculumPromise;
}

const OBJECTIVE_TYPES = new Set([
  'multiple_choice', 'active_recall', 'sentence_order', 'gap_fill', 'translation', 'dictation',
  'listening_comprehension', 'listening_checkpoint', 'pronunciation', 'shadowing', 'quick_transfer',
  'transfer', 'targeted_retry', 'scenario_response', 'unseen_transfer',
]);

export function isFeedExercise(exercise: CurriculumExercise): boolean {
  return OBJECTIVE_TYPES.has(exercise.type) && expectedAnswers(exercise).length > 0;
}

export function expectedAnswers(exercise: CurriculumExercise): string[] {
  const answers = [
    exercise.answer,
    exercise.full_answer,
    ...(exercise.accepted_answers ?? []),
    ...(exercise.model_answers ?? []),
    ...(exercise.tts_texts ?? []),
  ].filter((answer): answer is string => Boolean(answer?.trim()));
  return [...new Set(answers)];
}

export function audioText(exercise: CurriculumExercise, lesson: CurriculumLesson): string {
  return exercise.tts_texts?.[0]
    ?? exercise.accepted_answers?.[0]
    ?? exercise.full_answer
    ?? exercise.answer
    ?? exercise.model_answers?.[0]
    ?? lesson.dialogue.find((line) => line.speaker === 'B')?.text
    ?? lesson.examples[0]?.en
    ?? '';
}

export function isListeningExercise(exercise: CurriculumExercise): boolean {
  return ['dictation', 'listening_comprehension', 'listening_checkpoint', 'shadowing', 'pronunciation'].includes(exercise.type);
}

export function isOpenExercise(exercise: CurriculumExercise): boolean {
  return ['quick_transfer', 'transfer', 'scenario_response', 'unseen_transfer'].includes(exercise.type);
}

export function normalizeAnswer(text: string): string {
  return text.toLocaleLowerCase('en-US').replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return prev[b.length];
}

export function answerSimilarity(a: string, b: string): number {
  const left = normalizeAnswer(a);
  const right = normalizeAnswer(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  return Math.max(0, 1 - editDistance(left, right) / Math.max(left.length, right.length));
}

export function evaluateCurriculumAnswer(exercise: CurriculumExercise, answer: string): CardEvaluation {
  const expected = expectedAnswers(exercise);
  const normalized = normalizeAnswer(answer);
  const similarities = expected.map((candidate) => answerSimilarity(answer, candidate));
  let score = Math.round(Math.max(0, ...similarities) * 100);
  if (isOpenExercise(exercise)) {
    const targetTokens = new Set(expected.flatMap((candidate) => normalizeAnswer(candidate).split(' ')).filter((word) => word.length > 2));
    const answerTokens = new Set(normalized.split(' ').filter(Boolean));
    const overlap = [...targetTokens].filter((word) => answerTokens.has(word)).length;
    const coverage = targetTokens.size ? overlap / targetTokens.size : 0;
    const lengthScore = Math.min(1, answerTokens.size / 4);
    score = Math.round(Math.max(score / 100, coverage * 0.7 + lengthScore * 0.3) * 100);
  }
  const threshold = isOpenExercise(exercise) ? 55 : exercise.type === 'gap_fill' ? 90 : 84;
  const correct = score >= threshold;
  const primary = expected[0] ?? '';
  return {
    correct,
    score,
    expected: primary,
    explanation: correct ? 'Ai recuperat răspunsul fără să-l recitești.' : `Varianta recomandată este: ${primary}`,
  };
}
