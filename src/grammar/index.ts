// Cursul de gramatică de bază — punctul unic de intrare.
//
// Conținut static, în română, disponibil offline și fără AI: 4 module × lecții cu explicație,
// exemple corect/greșit și exerciții verificate local.

import type { GrammarLesson, GrammarModule } from './types';
import { BASICS_LESSONS } from './basics';
import { TENSES_LESSONS } from './tenses';
import { DETAILS_LESSONS } from './details';
import { TRAPS_LESSONS } from './traps';
import { NEXT_LESSONS } from './next';

export * from './types';

export const GRAMMAR_MODULES: GrammarModule[] = [
  {
    id: 'basics',
    titleRo: 'Bazele propoziției',
    descRo: 'Cum se construiește o propoziție corectă: ordine, articole, plural, adjective.',
  },
  {
    id: 'tenses',
    titleRo: 'Timpurile verbale',
    descRo: 'Prezent, trecut, viitor și present perfect — când folosești fiecare.',
  },
  {
    id: 'details',
    titleRo: 'Detaliile care te dau de gol',
    descRo: 'Prepoziții, întrebări, cantități, comparative, modale, posesiv, adverbe.',
  },
  {
    id: 'traps',
    titleRo: 'Capcanele românilor',
    descRo: 'Traduceri cuvânt cu cuvânt, prieteni falși, -ing vs to, condiționalul.',
  },
  {
    id: 'next',
    titleRo: 'Pasul următor (B1–B2)',
    descRo: 'Pasiv, vorbire indirectă, relative, povestire la trecut, verbe frazale, conectori.',
  },
];

export const GRAMMAR_COURSE: GrammarLesson[] = [
  ...BASICS_LESSONS,
  ...TENSES_LESSONS,
  ...DETAILS_LESSONS,
  ...TRAPS_LESSONS,
  ...NEXT_LESSONS,
];

export function lessonsOfModule(moduleId: string): GrammarLesson[] {
  return GRAMMAR_COURSE.filter((l) => l.moduleId === moduleId);
}

export function findLesson(id: string): GrammarLesson | undefined {
  return GRAMMAR_COURSE.find((l) => l.id === id);
}

/** Numărul total de exerciții din curs — folosit pentru progresul global. */
export const TOTAL_EXERCISES = GRAMMAR_COURSE.reduce((n, l) => n + l.exercises.length, 0);
