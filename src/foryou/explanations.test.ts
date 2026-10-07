import { describe, expect, it } from 'vitest';
import type { CurriculumExercise, CurriculumLesson } from '../microlearning/types';
import { buildForYouExplanation, curriculumFeedback } from './explanations';
import type { ForYouCard } from './types';

function lesson(): CurriculumLesson {
  return {
    lesson_id: 'B1-U1-L1', level: 'B1', unit_id: 'B1-U1', lesson_number_in_unit: 1,
    title_ro: 'Present Perfect', title_en: 'Present Perfect', lesson_type: 'grammar',
    purpose_ro: 'Legăm o acțiune trecută de prezent.', estimated_minutes: 5,
    objective_ro: 'Folosește auxiliarul have/has.', grammar_focus: 'present perfect',
    explanation_ro: 'Present Perfect folosește have/has + participiul trecut.', scenario_ro: 'Un raport terminat recent.',
    new_language: [], examples: [{ en: 'She has finished the report.', ro: 'Ea a terminat raportul.' }], dialogue: [], exercises: [],
  };
}

type CurriculumCard = Extract<ForYouCard, { kind: 'quiz' | 'listening' }>;

function orderCard(): CurriculumCard {
  const exercise: CurriculumExercise = {
    id: 'e-order', type: 'sentence_order', prompt_ro: 'Pune în ordine.', skill: 'word_order',
    tokens: ['report', 'She', 'finished', 'the', 'has', '.'], answer: 'She has finished the report.',
  };
  return {
    id: 'quiz:e-order', kind: 'quiz', lane: 'new', topic: 'Present Perfect', reason: 'Test', interactive: true,
    lesson: lesson(), exercise,
  };
}

describe('For You rich explanations', () => {
  it('oferă strategie fără să dezvăluie răspunsul înainte de evaluare', () => {
    const explanation = buildForYouExplanation(orderCard(), false);
    expect(explanation.pattern).toContain('subiect');
    expect(explanation.pitfall).toContain('ordinea din română');
    expect(explanation.example).toBeUndefined();
  });

  it('adaugă exemplul exact după ce utilizatorul a răspuns', () => {
    const explanation = buildForYouExplanation(orderCard(), true);
    expect(explanation.example?.en).toBe('She has finished the report.');
    expect(explanation.memoryTip).toContain('reconstruiește');
  });

  it('folosește explicația aprofundată a unei greșeli personale', () => {
    const card = {
      id: 'mistake:m1', kind: 'mistake', lane: 'weakness', topic: 'Greșeală', reason: 'Istoric', interactive: true,
      options: ['She like', 'She likes'],
      mistake: {
        id: 'm1', original: 'She like tea.', corrected: 'She likes tea.', originalFragment: 'She like', correctFragment: 'She likes',
        category: 'present_simple', severity: 'medium', explanationRo: 'La persoana a treia adăugăm -s.',
        deepDive: { ruleRo: 'He/she/it cere -s.', interferenceRo: 'În română verbul nu folosește această terminație.', examples: [{ en: 'He works here.', ro: 'El lucrează aici.' }] },
        firstSeenAt: '', lastSeenAt: '', occurrenceCount: 1, status: 'learning',
        review: { step: 0, nextReviewAt: '', correctUses: 0, failures: 0 },
      },
    } as Extract<ForYouCard, { kind: 'mistake' }>;
    const explanation = buildForYouExplanation(card, true);
    expect(explanation.pattern).toBe('He/she/it cere -s.');
    expect(explanation.pitfall).toContain('română');
    expect(explanation.example?.en).toBe('She likes');
  });

  it('produce feedback specific mecanismului exercițiului', () => {
    const card = orderCard();
    const feedback = curriculumFeedback(card.exercise, card.lesson, {
      correct: true, score: 100, expected: 'She has finished the report.', explanation: '',
    });
    expect(feedback).toContain('tiparul corect');
    expect(feedback).toContain('She has finished the report.');
    expect(feedback).not.toContain('report.”.');
  });
});
