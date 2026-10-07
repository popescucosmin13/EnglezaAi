import { describe, it, expect } from 'vitest';
import { GRAMMAR_COURSE, GRAMMAR_MODULES, checkAnswer, normalizeAnswer, findLesson, orderWords } from './index';
import { buildDrill, recommendedLesson } from './drill';
import { drillKey, mergeProgress, mergeDrill, type DrillMemory, type GrammarProgress } from './progress';
import { newReviewState } from '../srs/ladder';

describe('normalizeAnswer', () => {
  it('ignoră majuscule, punctuația finală și spațiile în plus', () => {
    expect(normalizeAnswer('  I am   Ready! ')).toBe('i am ready');
  });

  it('desface formele scurte, ca „isn\'t" să fie egal cu „is not"', () => {
    expect(normalizeAnswer("She isn't happy")).toBe(normalizeAnswer('She is not happy'));
    expect(normalizeAnswer("I can't swim")).toBe(normalizeAnswer('I cannot swim'));
    expect(normalizeAnswer("They won't come")).toBe(normalizeAnswer('They will not come'));
    expect(normalizeAnswer("I'll help you")).toBe(normalizeAnswer('I will help you'));
  });

  it('tratează apostroful tipografic ca pe cel simplu', () => {
    expect(normalizeAnswer('I don’t know')).toBe(normalizeAnswer("I don't know"));
  });
});

describe('checkAnswer', () => {
  const ex = {
    kind: 'fix' as const,
    text: 'I have 25 years.',
    answer: 'I am 25 years old.',
    accept: ['I am 25.'],
    explainRo: 'test',
  };

  it('acceptă răspunsul principal și variantele din accept', () => {
    expect(checkAnswer(ex, 'i am 25 years old')).toBe(true);
    expect(checkAnswer(ex, "I'm 25.")).toBe(true);
    expect(checkAnswer(ex, 'I am 25')).toBe(true);
  });

  it('respinge răspunsurile greșite și pe cele goale', () => {
    expect(checkAnswer(ex, 'I have 25 years')).toBe(false);
    expect(checkAnswer(ex, '   ')).toBe(false);
  });
});

describe('îmbinarea progresului între dispozitive', () => {
  const lesson = (over: Partial<GrammarProgress[string]> = {}): GrammarProgress[string] => ({
    read: false, best: 0, total: 10, attempts: 0, lastAt: '2026-01-01', ...over,
  });

  it('păstrează cel mai bun scor, nu ultimul salvat', () => {
    const local: GrammarProgress = { articles: lesson({ read: true, best: 9, attempts: 2, lastAt: '2026-02-01' }) };
    const remote: GrammarProgress = { articles: lesson({ read: true, best: 4, attempts: 5, lastAt: '2026-03-01' }) };

    const merged = mergeProgress(local, remote);
    expect(merged.articles.best).toBe(9);
    expect(merged.articles.attempts).toBe(5);
    expect(merged.articles.lastAt).toBe('2026-03-01');
  });

  it('ține lecțiile care există doar pe un dispozitiv', () => {
    const merged = mergeProgress({ plural: lesson({ read: true }) }, { articles: lesson({ best: 3 }) });
    expect(Object.keys(merged).sort()).toEqual(['articles', 'plural']);
  });

  it('la exerciții câștigă starea repetată cel mai recent', () => {
    const key = drillKey('articles', 0);
    const older: DrillMemory = { [key]: { ...newReviewState(), step: 4, lastReviewedAt: '2026-01-01', nextReviewAt: '2026-01-15' } };
    const newer: DrillMemory = { [key]: { ...newReviewState(), step: 0, lastReviewedAt: '2026-02-01', nextReviewAt: '2026-02-01' } };

    expect(mergeDrill(older, newer)[key].step).toBe(0);
    expect(mergeDrill(newer, older)[key].step).toBe(0);
  });

  it('la aceeași dată păstrează pasul mai avansat', () => {
    const key = drillKey('plural', 2);
    const a: DrillMemory = { [key]: { ...newReviewState(), step: 3, lastReviewedAt: '2026-02-01' } };
    const b: DrillMemory = { [key]: { ...newReviewState(), step: 1, lastReviewedAt: '2026-02-01' } };
    expect(mergeDrill(a, b)[key].step).toBe(3);
    expect(mergeDrill(b, a)[key].step).toBe(3);
  });
});

describe('conținutul cursului', () => {
  it('are id-uri unice de lecție', () => {
    const ids = GRAMMAR_COURSE.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leagă fiecare lecție de un modul existent', () => {
    const moduleIds = new Set(GRAMMAR_MODULES.map((m) => m.id));
    for (const l of GRAMMAR_COURSE) expect(moduleIds.has(l.moduleId)).toBe(true);
  });

  it('are „pe scurt" în fiecare lecție', () => {
    for (const l of GRAMMAR_COURSE) {
      expect(l.shortRo.trim(), `${l.id} fără rezumat`).not.toBe('');
      for (const req of l.requires ?? []) {
        expect(GRAMMAR_COURSE.some((x) => x.id === req), `${l.id} cere lecția inexistentă ${req}`).toBe(true);
      }
    }
  });

  it('are exerciții valide în fiecare lecție', () => {
    for (const l of GRAMMAR_COURSE) {
      expect(l.exercises.length, `${l.id} fără exerciții`).toBeGreaterThan(0);
      for (const ex of l.exercises) {
        expect(ex.answer.trim(), `${l.id}: exercițiu fără răspuns`).not.toBe('');
        expect(ex.explainRo.trim(), `${l.id}: exercițiu fără explicație`).not.toBe('');
        // răspunsul corect trebuie să treacă propria verificare
        expect(checkAnswer(ex, ex.answer), `${l.id}: „${ex.text}" nu-și acceptă propriul răspuns`).toBe(true);
        if (ex.kind === 'choice') {
          expect(ex.options, `${l.id}: „${ex.text}" fără opțiuni`).toBeTruthy();
          expect(ex.options!.length).toBeGreaterThanOrEqual(2);
          expect(ex.options, `${l.id}: răspunsul lipsește dintre opțiuni`).toContain(ex.answer);
        }
        if (ex.kind === 'choice' || ex.kind === 'fill') {
          expect(ex.text, `${l.id}: „${ex.text}" nu are spațiu liber (___)`).toContain('___');
        }
        if (ex.kind === 'order') {
          const words = orderWords(ex);
          expect(words.length, `${l.id}: „${ex.text}" e prea scurt pentru construit`).toBeGreaterThanOrEqual(4);
          // cuvintele amestecate trebuie să conțină exact cuvintele răspunsului, dar în altă ordine
          const target = ex.answer.replace(/[.!?]/g, '').split(/\s+/);
          expect([...words].sort()).toEqual([...target].sort());
          expect(words.join(' ')).not.toBe(target.join(' '));
          expect(checkAnswer(ex, words.join(' ')), `${l.id}: amestecul e deja răspunsul`).toBe(false);
        }
      }
    }
  });

  it('amestecă la fel de fiecare dată același exercițiu de construit', () => {
    const ex = GRAMMAR_COURSE.flatMap((l) => l.exercises).find((e) => e.kind === 'order')!;
    expect(orderWords(ex)).toEqual(orderWords(ex));
  });

  it('antrenamentul mixt scoate primele exercițiile datorate, apoi pe cele din lecțiile citite', () => {
    const failed = { ...newReviewState(), step: 0, nextReviewAt: '2000-01-01' };
    const memory: DrillMemory = { [drillKey('articles', 3)]: failed };
    const progress: GrammarProgress = {
      plural: { read: true, best: 0, total: 0, attempts: 0, lastAt: '2026-01-01' },
    };

    const drill = buildDrill(memory, progress, 5);
    expect(drill).toHaveLength(5);
    expect(drill[0].lessonId).toBe('articles');
    expect(drill[0].index).toBe(3);
    // restul vin din lecția deja citită, nu din prima lecție a cursului
    expect(drill.slice(1).every((d) => d.lessonId === 'plural')).toBe(true);
  });

  it('nu programează exercițiile care nu sunt încă datorate', () => {
    const memory: DrillMemory = {};
    for (const l of GRAMMAR_COURSE) {
      l.exercises.forEach((_, i) => {
        memory[drillKey(l.id, i)] = { ...newReviewState(), step: 4, nextReviewAt: '2999-01-01' };
      });
    }
    expect(buildDrill(memory, {}, 10)).toHaveLength(0);
  });

  it('recomandă prima lecție nestăpânită, dar preferă categoria în care greșești', () => {
    expect(recommendedLesson({})).toBe(GRAMMAR_COURSE[0].id);

    const progress: GrammarProgress = {
      'word-order': { read: true, best: 9, total: 9, attempts: 1, lastAt: '2026-01-01' },
      'to-be': { read: true, best: 0, total: 0, attempts: 0, lastAt: '2026-01-01' },
    };
    expect(recommendedLesson(progress)).toBe('to-be');
    expect(recommendedLesson(progress, 'article')).toBe('articles');
  });

  it('găsește o lecție după id', () => {
    expect(findLesson('articles')?.titleRo).toBe('Articolele: a / an / the');
    expect(findLesson('nu-exista')).toBeUndefined();
  });
});
