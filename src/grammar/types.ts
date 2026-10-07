// Cursul de gramatică de bază — tipuri + verificarea răspunsurilor.
//
// Tot cursul e STATIC (scris de mână, în română) și funcționează fără internet și fără AI:
// e „manualul" pe care te poți baza mereu, spre deosebire de microlecțiile generate din
// greșelile tale. Verificarea exercițiilor se face local, ca răspunsul să fie instant.

import type { Cefr, MistakeCategory } from '../types';

export interface GrammarExample {
  /** Varianta corectă, în engleză. */
  en: string;
  /** Traducerea în română. */
  ro: string;
  /** Varianta greșită pe care o spun frecvent românii (opțional). */
  bad?: string;
  /** De ce e greșită varianta de mai sus / ce trebuie reținut. */
  noteRo?: string;
}

export type ExerciseKind =
  /** Alegi varianta corectă dintre opțiuni. */
  | 'choice'
  /** Completezi cuvântul lipsă din spațiul liber (___). */
  | 'fill'
  /** Rescrii corect o propoziție greșită. */
  | 'fix'
  /** Traduci din română în engleză. */
  | 'translate'
  /** Construiești propoziția atingând cuvintele amestecate, fără să scrii nimic. */
  | 'order';

export interface GrammarExercise {
  kind: ExerciseKind;
  /**
   * Textul exercițiului:
   *  - `choice` / `fill`: propoziția cu ___ în locul cuvântului lipsă
   *  - `fix`: propoziția greșită
   *  - `translate` / `order`: propoziția în română
   */
  text: string;
  /** Doar pentru `choice`. */
  options?: string[];
  /** Răspunsul corect (cuvântul pentru `fill`, propoziția întreagă pentru `fix`/`translate`). */
  answer: string;
  /** Alte formulări acceptate ca fiind corecte. */
  accept?: string[];
  /** Explicația arătată după răspuns — partea din care se învață efectiv. */
  explainRo: string;
}

export interface GrammarLesson {
  id: string;
  moduleId: string;
  level: Cefr;
  titleRo: string;
  /** Ce știi să faci după lecție — o propoziție. */
  goalRo: string;
  /** Regula în două rânduri: cardul „pe scurt" de deasupra lecției, pentru cine nu are chef de teorie. */
  shortRo: string;
  /** Trucul de memorat — fraza care rămâne în cap după ce uiți explicația. */
  mnemonicRo?: string;
  /** Lecțiile care ar trebui știute înainte (id-uri) — folosite pentru traseul recomandat. */
  requires?: string[];
  /** Categoria de greșeli corespunzătoare, pentru legătura cu greșelile tale reale. */
  category: MistakeCategory;
  /** Explicația, în markdown simplu (titluri `#`, liste `-`, **bold**, `cod`). */
  bodyRo: string;
  examples: GrammarExample[];
  exercises: GrammarExercise[];
}

export interface GrammarModule {
  id: string;
  titleRo: string;
  descRo: string;
}

// ---------- Verificarea răspunsurilor ----------

/**
 * Normalizează un răspuns pentru comparație: fără majuscule, fără punctuație de final,
 * cu apostroful tipografic redus la ' și cu formele scurte desfăcute (isn't = is not),
 * ca răspunsul corect să nu fie respins pentru un detaliu de scriere.
 *
 * `'s` NU se desface: e ambiguu (is / has / posesiv), deci ar strica mai mult decât ajută;
 * unde contează, lecția pune varianta și în `accept`.
 */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\bcan't\b/g, 'cannot')
    .replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not')
    .replace(/'re\b/g, ' are')
    .replace(/'m\b/g, ' am')
    .replace(/'ll\b/g, ' will')
    .replace(/'ve\b/g, ' have')
    .replace(/'d\b/g, ' would')
    .replace(/[.!?;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Răspunsul e corect dacă se potrivește cu varianta principală sau cu una acceptată. */
export function checkAnswer(ex: GrammarExercise, input: string): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return [ex.answer, ...(ex.accept ?? [])].some((a) => normalizeAnswer(a) === got);
}

/** Textul exercițiului cu răspunsul pus în locul spațiului liber — arătat la feedback. */
export function filledText(ex: GrammarExercise): string {
  if (ex.kind === 'choice' || ex.kind === 'fill') return ex.text.replace('___', ex.answer);
  return ex.answer;
}

// ---------- Exercițiile de tip „construiește propoziția" ----------

/** Hash stabil pe un șir — ca amestecarea cuvintelor să fie mereu aceeași pentru același exercițiu. */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Cuvintele amestecate pentru un exercițiu `order`, derivate chiar din răspuns.
 * Amestecarea e deterministă (nu se reașază la fiecare randare) și garantat diferită
 * de ordinea corectă — altfel exercițiul s-ar rezolva singur.
 */
export function orderWords(ex: GrammarExercise): string[] {
  const words = ex.answer.replace(/[.!?]/g, '').split(/\s+/).filter(Boolean);
  if (words.length < 3) return words;

  let seed = seedOf(ex.text + ex.answer) || 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.join(' ') === words.join(' ')) shuffled.reverse();
  return shuffled;
}
