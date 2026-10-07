// Progresul la cursul de gramatică: scorurile per lecție + scara de repetiție a fiecărui exercițiu.
//
// Fișierul ăsta ține DOAR starea locală (localStorage pe web, AsyncStorage pe nativ) și regulile
// de îmbinare — fără rețea, ca să poată fi citit sincron la prima randare și testat fără Firestore.
// Urcarea/aducerea din cloud stă în `sync.ts`, care se abonează la scrierile de aici.

import { storage } from '../storage';
import type { ReviewState } from '../types';
import { newReviewState, applyReview, isDue, todayStr } from '../srs/ladder';

const KEY = 'en2.grammar.progress.v1';
// v2: cheile exercițiilor folosesc „__" în loc de „#", ca să fie chei de map valide în Firestore
const DRILL_KEY = 'en2.grammar.drill.v2';

export interface LessonProgress {
  /** Lecția a fost deschisă și citită măcar o dată. */
  read: boolean;
  /** Cel mai bun scor obținut la exerciții. */
  best: number;
  /** Din câte exerciții — se schimbă dacă lecția e extinsă. */
  total: number;
  /** De câte ori ai făcut setul de exerciții. */
  attempts: number;
  /** Ultima dată (YYYY-MM-DD) la care ai lucrat la lecție. */
  lastAt: string;
}

export type GrammarProgress = Record<string, LessonProgress>;
export type DrillMemory = Record<string, ReviewState>;

export interface GrammarState {
  progress: GrammarProgress;
  drill: DrillMemory;
}

// ---------- Abonarea sincronizării ----------

type ChangeListener = () => void;
let listener: ChangeListener | null = null;

/** `sync.ts` se înregistrează aici ca să urce în cloud după fiecare scriere locală. */
export function onGrammarChange(fn: ChangeListener | null): void {
  listener = fn;
}

function notify(): void {
  try {
    listener?.();
  } catch {
    /* sincronizarea nu trebuie să poată rupe salvarea locală */
  }
}

// ---------- Citire / scriere locală ----------

function readJson<T>(key: string): T | undefined {
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getGrammarProgress(): GrammarProgress {
  return readJson<GrammarProgress>(KEY) ?? {};
}

export function getDrillMemory(): DrillMemory {
  return readJson<DrillMemory>(DRILL_KEY) ?? {};
}

function writeProgress(p: GrammarProgress): void {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stocare indisponibilă — progresul rămâne doar pe sesiunea curentă */
  }
  notify();
}

function writeDrill(memory: DrillMemory): void {
  try {
    storage.setItem(DRILL_KEY, JSON.stringify(memory));
  } catch {
    /* ignore */
  }
  notify();
}

/** Scrie starea îmbinată (folosit de sincronizare) fără să declanșeze o nouă urcare. */
export function writeGrammarState(state: GrammarState): void {
  try {
    storage.setItem(KEY, JSON.stringify(state.progress));
    storage.setItem(DRILL_KEY, JSON.stringify(state.drill));
  } catch {
    /* ignore */
  }
}

function entry(p: GrammarProgress, lessonId: string): LessonProgress {
  return p[lessonId] ?? { read: false, best: 0, total: 0, attempts: 0, lastAt: '' };
}

export function markLessonRead(lessonId: string): GrammarProgress {
  const p = getGrammarProgress();
  const e = entry(p, lessonId);
  p[lessonId] = { ...e, read: true, lastAt: todayStr() };
  writeProgress(p);
  return p;
}

/** Salvează rezultatul unui set de exerciții; păstrează cel mai bun scor obținut vreodată. */
export function saveLessonScore(lessonId: string, correct: number, total: number): GrammarProgress {
  const p = getGrammarProgress();
  const e = entry(p, lessonId);
  p[lessonId] = {
    read: true,
    best: Math.max(e.best, correct),
    total,
    attempts: e.attempts + 1,
    lastAt: todayStr(),
  };
  writeProgress(p);
  return p;
}

export function resetGrammarProgress(): void {
  try {
    storage.removeItem(KEY);
    storage.removeItem(DRILL_KEY);
  } catch {
    /* ignore */
  }
  notify(); // golește și copia din cloud, altfel s-ar întoarce la următoarea sincronizare
}

// ---------- Memoria antrenamentului mixt (repetiție spațiată pe exercițiu) ----------
//
// Fiecare exercițiu are propria scară de repetare: greșit → revine imediat, corect → peste 1, 3,
// 7, 14… zile. Așa nu mai reiei ce știi deja și revii exact pe ce ți-a scăpat.

/** Cheia unui exercițiu în memoria de repetiție: lecție + poziție în lecție. */
export function drillKey(lessonId: string, index: number): string {
  return `${lessonId}__${index}`;
}

/** Înregistrează rezultatul unui exercițiu și reprogramează-l pe scara de repetiție. */
export function recordDrillAnswer(key: string, ok: boolean): DrillMemory {
  const memory = getDrillMemory();
  const state = memory[key] ?? newReviewState();
  memory[key] = applyReview(state, ok ? 'good' : 'fail');
  writeDrill(memory);
  return memory;
}

/** Câte exerciții deja întâlnite sunt programate pentru azi. */
export function dueCount(memory: DrillMemory, date = todayStr()): number {
  return Object.values(memory).filter((s) => isDue(s, date)).length;
}

// ---------- Îmbinarea între dispozitive ----------
//
// „Cel mai bun câștigă", nu „ultimul câștigă": dacă exersezi și pe telefon, și pe laptop, nu vrei
// ca dispozitivul deschis a doua oară să șteargă progresul făcut pe primul.

function mergeLesson(a: LessonProgress, b: LessonProgress): LessonProgress {
  return {
    read: a.read || b.read,
    best: Math.max(a.best, b.best),
    total: Math.max(a.total, b.total),
    attempts: Math.max(a.attempts, b.attempts),
    lastAt: a.lastAt > b.lastAt ? a.lastAt : b.lastAt,
  };
}

export function mergeProgress(local: GrammarProgress, remote: GrammarProgress): GrammarProgress {
  const out: GrammarProgress = { ...remote };
  for (const [id, l] of Object.entries(local)) {
    const r = out[id];
    out[id] = r ? mergeLesson(l, r) : l;
  }
  return out;
}

/** La exerciții câștigă starea repetată cel mai recent — ea știe adevărata programare. */
export function mergeDrill(local: DrillMemory, remote: DrillMemory): DrillMemory {
  const out: DrillMemory = { ...remote };
  for (const [key, l] of Object.entries(local)) {
    const r = out[key];
    if (!r) {
      out[key] = l;
      continue;
    }
    const lAt = l.lastReviewedAt ?? '';
    const rAt = r.lastReviewedAt ?? '';
    out[key] = lAt === rAt ? (l.step >= r.step ? l : r) : lAt > rAt ? l : r;
  }
  return out;
}
