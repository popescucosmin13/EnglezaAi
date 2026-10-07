import { describe, expect, it } from 'vitest';
import { answerSimilarity, evaluateCurriculumAnswer, normalizeAnswer } from './curriculum';
import { adaptEpisode, STORY_SERIES } from './stories';
import type { CurriculumExercise } from './types';

function exercise(patch: Partial<CurriculumExercise>): CurriculumExercise {
  return { id: 'e1', type: 'active_recall', prompt_ro: 'Răspunde', skill: 'recall', ...patch };
}

describe('microlearning answer evaluation', () => {
  it('normalizes punctuation and apostrophes', () => {
    expect(normalizeAnswer('  I’m READY! ')).toBe("i'm ready");
  });

  it('accepts an exact active-recall answer regardless of punctuation', () => {
    const result = evaluateCurriculumAnswer(exercise({ accepted_answers: ['Where are you from?'] }), 'Where are you from');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it('accepts the missing word or the complete sentence for gap fill', () => {
    const item = exercise({ type: 'gap_fill', answer: 'is', full_answer: 'What is your name?' });
    expect(evaluateCurriculumAnswer(item, 'is').correct).toBe(true);
    expect(evaluateCurriculumAnswer(item, 'What is your name?').correct).toBe(true);
  });

  it('requires useful overlap for an open transfer answer', () => {
    const item = exercise({ type: 'transfer', model_answers: ['I would ask for more time.'] });
    expect(evaluateCurriculumAnswer(item, 'I would ask for more time because the task is difficult.').correct).toBe(true);
    expect(evaluateCurriculumAnswer(item, 'Banana').correct).toBe(false);
  });

  it('reports similarity without exceeding the 0-1 range', () => {
    expect(answerSimilarity('hello world', 'hello worlds')).toBeGreaterThan(0.8);
    expect(answerSimilarity('', 'hello')).toBe(0);
  });
});

describe('daily story adaptation', () => {
  it('keeps A1 episodes short while preserving the sentence containing the answer', () => {
    const series = STORY_SERIES[0];
    const episode = adaptEpisode(series, 3, 'A1');
    expect(episode.text.split('.').filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(episode.text.toLowerCase()).toContain('nine minutes');
  });

  it('returns the complete episode for B2', () => {
    const series = STORY_SERIES[1];
    const episode = adaptEpisode(series, 0, 'B2');
    expect(episode.text).toContain('airport information desk');
  });
});
