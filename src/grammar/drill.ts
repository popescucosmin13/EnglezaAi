// Antrenamentul mixt: un set scurt de exerciții luate din tot cursul, nu dintr-o singură lecție.
//
// Prioritatea e simplă și verificabilă: întâi ce ai greșit și e programat pentru azi (scara de
// repetiție), apoi ce n-ai văzut încă din lecțiile citite, la final restul cursului. Așa
// antrenamentul rămâne pe ce nu știi, nu pe ce ai nimerit deja de trei ori.

import { isDue, todayStr } from '../srs/ladder';
import { GRAMMAR_COURSE } from './index';
import type { GrammarExercise } from './types';
import { drillKey, type DrillMemory, type GrammarProgress } from './progress';

export interface DrillItem {
  lessonId: string;
  lessonTitleRo: string;
  index: number;
  exercise: GrammarExercise;
}

export const DRILL_SIZE = 12;

export function buildDrill(
  memory: DrillMemory,
  progress: GrammarProgress,
  size = DRILL_SIZE,
  date = todayStr()
): DrillItem[] {
  const due: { item: DrillItem; step: number }[] = [];
  const unseenRead: DrillItem[] = [];
  const unseenRest: DrillItem[] = [];

  for (const lesson of GRAMMAR_COURSE) {
    const read = Boolean(progress[lesson.id]?.read);
    lesson.exercises.forEach((exercise, index) => {
      const item: DrillItem = { lessonId: lesson.id, lessonTitleRo: lesson.titleRo, index, exercise };
      const state = memory[drillKey(lesson.id, index)];
      if (!state) {
        (read ? unseenRead : unseenRest).push(item);
      } else if (isDue(state, date)) {
        due.push({ item, step: state.step });
      }
    });
  }

  // pasul mic = l-ai greșit recent, deci vine primul
  due.sort((a, b) => a.step - b.step);

  return [...due.map((d) => d.item), ...unseenRead, ...unseenRest].slice(0, size);
}

/**
 * Lecția de la care are sens să continui: prima nestăpânită din ordinea cursului ale cărei
 * lecții-condiție sunt deja citite. Dacă ai o categorie de greșeli dominantă în conversații,
 * are prioritate lecția care o acoperă.
 */
export function recommendedLesson(progress: GrammarProgress, weakCategory?: string): string | undefined {
  const mastered = (id: string) => {
    const p = progress[id];
    const lesson = GRAMMAR_COURSE.find((l) => l.id === id);
    return Boolean(p && lesson && p.best >= lesson.exercises.length);
  };
  const ready = (id: string) => {
    const lesson = GRAMMAR_COURSE.find((l) => l.id === id);
    return (lesson?.requires ?? []).every((r) => progress[r]?.read);
  };

  const open = GRAMMAR_COURSE.filter((l) => !mastered(l.id));
  if (open.length === 0) return undefined;

  if (weakCategory) {
    const match = open.find((l) => l.category === weakCategory && ready(l.id));
    if (match) return match.id;
  }
  return (open.find((l) => ready(l.id)) ?? open[0]).id;
}
