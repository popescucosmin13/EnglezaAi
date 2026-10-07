import { describe, expect, it } from 'vitest';
import type { CurriculumExercise } from '../microlearning/types';
import {
  forYouExerciseControl,
  forYouExerciseLabel,
  forYouInputPlaceholder,
  isForYouExercise,
  joinOrderTokens,
} from './exercise';

function exercise(patch: Partial<CurriculumExercise>): CurriculumExercise {
  return { id: 'e1', type: 'active_recall', prompt_ro: 'Răspunde', skill: 'recall', accepted_answers: ['Hello.'], ...patch };
}

describe('For You exercise contract', () => {
  it('folosește constructorul de elemente pentru sentence_order', () => {
    const item = exercise({ type: 'sentence_order', tokens: ['name', 'What', 'your', 'is', '?'], answer: 'What is your name?' });
    expect(forYouExerciseControl(item)).toBe('order');
    expect(forYouExerciseLabel(item)).toBe('Construiește');
    expect(joinOrderTokens(['What', 'is', 'your', 'name', '?'])).toBe('What is your name?');
  });

  it('respinge exercițiile care cer funcții inexistente în card', () => {
    expect(isForYouExercise(exercise({ type: 'pronunciation', tts_texts: ['Hello.'] }))).toBe(false);
    expect(isForYouExercise(exercise({ type: 'shadowing', tts_texts: ['Hello.'] }))).toBe(false);
  });

  it('nu notează automat răspunsuri deschise care pot avea multe variante corecte', () => {
    expect(isForYouExercise(exercise({ type: 'transfer', model_answers: ['I have worked abroad.'] }))).toBe(false);
    expect(isForYouExercise(exercise({ type: 'scenario_response', model_answers: ['I can help.'] }))).toBe(false);
    expect(isForYouExercise(exercise({ type: 'unseen_transfer', model_answers: ['A possible answer.'] }))).toBe(false);
  });

  it('respinge datele obiective incomplete înainte să ajungă în feed', () => {
    const malformedChoice = exercise({ type: 'multiple_choice', options: ['Only one'], answer: 'Only one' });
    const malformedOrder = exercise({ type: 'sentence_order', tokens: ['Hello'], answer: 'Hello' });
    expect(forYouExerciseControl(malformedChoice)).toBe('unsupported');
    expect(forYouExerciseControl(malformedOrder)).toBe('unsupported');
  });

  it('afișează instrucțiuni potrivite tipului de răspuns', () => {
    expect(forYouExerciseLabel(exercise({ type: 'active_recall' }))).toBe('Recuperează');
    expect(forYouInputPlaceholder(exercise({ type: 'gap_fill', answer: 'is' }))).toContain('cuvântul lipsă');
    expect(forYouInputPlaceholder(exercise({ type: 'dictation', accepted_answers: ['Hello.'] }))).toContain('auzit');
    expect(forYouInputPlaceholder(exercise({ type: 'scenario_response', model_answers: ['Hello.'] }))).toContain('complet');
  });
});
