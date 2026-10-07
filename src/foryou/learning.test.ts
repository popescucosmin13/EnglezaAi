import { describe, expect, it } from 'vitest';
import type { CurriculumExercise, CurriculumLesson } from '../microlearning/types';
import { forYouExerciseGuide } from './learning';

function lesson(): CurriculumLesson {
  return {
    lesson_id: 'B1-U1-L5', level: 'B1', unit_id: 'B1-U1', lesson_number_in_unit: 5,
    title_ro: 'Trecut și experiență', title_en: 'Past and experience', lesson_type: 'production',
    purpose_ro: 'Comparăm experiențe.', estimated_minutes: 5,
    objective_ro: 'Alege între Past Simple și Present Perfect.', grammar_focus: 'Present Perfect: have/has + participiu',
    explanation_ro: 'Present Perfect leagă rezultatul de prezent.',
    scenario_ro: 'Compararea unei experiențe cu un eveniment datat.',
    new_language: [{ en: 'We have not made a decision yet.', ro: 'Încă nu am luat o decizie.' }],
    examples: [{ en: 'We have not made a decision yet.', ro: 'Încă nu am luat o decizie.' }], dialogue: [], exercises: [],
  };
}

function exercise(patch: Partial<CurriculumExercise>): CurriculumExercise {
  return { id: 'e1', type: 'targeted_retry', prompt_ro: 'Refă propoziția care ți-a creat cea mai mare dificultate fără indicii.', skill: 'retrieval', model_answers: ['We have not made a decision yet.'], ...patch };
}

describe('For You learning guide', () => {
  it('transformă un retry vag într-o provocare autonomă și clară', () => {
    const guide = forYouExerciseGuide(lesson(), exercise({}));
    expect(guide.title).toBe('Recuperează această propoziție.');
    expect(guide.target).toBe('Încă nu am luat o decizie.');
    expect(guide.context).toContain('eveniment datat');
    expect(guide.phase).toBe('recall');
  });

  it('oferă indicii progresive fără să afișeze direct răspunsul', () => {
    const guide = forYouExerciseGuide(lesson(), exercise({}));
    expect(guide.hints[0]).toContain('Present Perfect');
    expect(guide.hints[1]).toContain('W_ h___ n__ m___');
    expect(guide.hints.join(' ')).not.toContain('We have not made a decision yet.');
  });

  it('arată sensul propoziției la exercițiile de ordonare', () => {
    const guide = forYouExerciseGuide(lesson(), exercise({
      type: 'sentence_order', prompt_ro: 'Pune elementele în ordinea corectă.',
      answer: 'We have not made a decision yet.', model_answers: undefined,
      tokens: ['decision', 'We', 'yet', 'have', 'not', 'made', 'a', '.'],
    }));
    expect(guide.targetLabel).toBe('Sensul propoziției');
    expect(guide.target).toBe('Încă nu am luat o decizie.');
    expect(guide.difficulty).toBe('Ușor');
  });
});
