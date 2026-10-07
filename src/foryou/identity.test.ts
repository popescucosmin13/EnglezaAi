import { describe, expect, it } from 'vitest';
import type { CurriculumLesson } from '../microlearning/types';
import { dedupeLearningCards, learningKeysForCard, sharesLearningContent } from './identity';
import type { ForYouCard } from './types';

function lesson(id: string, grammarFocus = 'Present Perfect'): CurriculumLesson {
  return {
    lesson_id: id,
    level: 'B1',
    unit_id: 'B1-U1',
    lesson_number_in_unit: 1,
    title_ro: 'Experiențe',
    title_en: 'Experiences',
    lesson_type: 'practice',
    purpose_ro: 'Exersare',
    estimated_minutes: 4,
    objective_ro: 'Exprimă experiențe.',
    grammar_focus: grammarFocus,
    explanation_ro: 'Folosim Present Perfect pentru experiențe.',
    scenario_ro: 'O conversație despre călătorii.',
    new_language: [],
    examples: [],
    dialogue: [],
    exercises: [],
  };
}

function phrase(id: string, lessonId: string, english: string, grammarFocus?: string): ForYouCard {
  return {
    id,
    kind: 'phrase',
    lane: 'new',
    topic: 'Experiențe',
    reason: 'Nou',
    interactive: false,
    lesson: lesson(lessonId, grammarFocus),
    english,
    romanian: 'Am vizitat Parisul.',
  };
}

function quiz(id: string, lessonId: string, answer: string): ForYouCard {
  return {
    id,
    kind: 'quiz',
    lane: 'new',
    topic: 'Experiențe',
    reason: 'Test',
    interactive: true,
    lesson: lesson(lessonId),
    exercise: { id: `exercise:${id}`, type: 'choice', skill: 'grammar', prompt_ro: 'Alege.', answer },
  };
}

describe('identitatea conținutului For You', () => {
  it('grupează formatele diferite provenite din aceeași lecție', () => {
    const first = phrase('phrase:one', 'B1-U1-L1', 'I have visited Paris.');
    const second = quiz('quiz:one', 'B1-U1-L1', 'She has visited Rome.');
    expect(sharesLearningContent(first, second)).toBe(true);
    expect(dedupeLearningCards([first, second])).toEqual([first]);
  });

  it('recunoaște aceeași propoziție chiar dacă apare în lecții diferite', () => {
    const first = phrase('phrase:one', 'B1-U1-L1', 'I have visited Paris.');
    const second = quiz('quiz:two', 'B1-U2-L3', 'I have visited Paris!');
    expect(learningKeysForCard(first)).toContain('text:i have visited paris');
    expect(sharesLearningContent(first, second)).toBe(true);
  });

  it('nu repetă aceeași competență sub propoziții și formate diferite', () => {
    const first = phrase('phrase:one', 'B1-U1-L1', 'I have visited Paris.');
    const second = quiz('quiz:two', 'B1-U2-L3', 'She has finished the report.');
    expect(learningKeysForCard(first)).toContain('focus:present perfect');
    expect(sharesLearningContent(first, second)).toBe(true);
  });

  it('păstrează ideile cu adevărat diferite', () => {
    const cards = [
      phrase('phrase:one', 'B1-U1-L1', 'I have visited Paris.'),
      phrase('phrase:two', 'B1-U2-L1', 'Could you send me the report?', 'Polite requests'),
    ];
    expect(dedupeLearningCards(cards)).toHaveLength(2);
  });

  it('respectă ideile deja prezente în loturile anterioare', () => {
    const card = phrase('phrase:one', 'B1-U1-L1', 'I have visited Paris.');
    expect(dedupeLearningCards([card], learningKeysForCard(card))).toEqual([]);
  });
});
