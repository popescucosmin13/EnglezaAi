// Speaking Lab — metrici de fluență calculate 100% pe client, din turele conversației și timing.
// Zero tokeni AI: semnalul care contează (când te blochezi, cât de lung vorbești, când scapi
// un cuvânt în română) se măsoară din date pe care aplicația le are deja, nu se cere unui model.
//
// Notă onestă despre MLR: „mean length of run" ideal cere marcaje de pauză DIN INTERIORUL unei
// replici (word timings), pe care STT-ul turn-based nu le dă. Aproximăm run-ul prin lungimea
// medie a replicii (fără filler-e) — un proxy bun de fluență, care poate fi rafinat mai târziu
// dacă se adaugă recunoaștere continuă (Azure streaming).

import type { Utterance, FluencyMetrics } from '../types';
import { lookupRescue } from './rescue-dictionary';

export type { FluencyMetrics };

// Filler-e englezești + românești: ezitări pure și circumlocuții tipice („cum se spune").
// Deliberat conservator — „like"/„so" nu intră, ar produce fals-pozitive uriașe.
const FILLER_PATTERNS: RegExp[] = [
  /\b(uh+|um+|erm+|hmm+|eh+|er)\b/gi,
  /\b(ă+|îî+|păi)\b/gi,
  /\bhow (do )?you say\b/gi,
  /\bwhat('?s| is) the word\b/gi,
  /\bthe thing (that|you|which)\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi,
];

// Cuvinte/mărci clar românești strecurate în engleză. Diacriticele sunt semnalul cel mai sigur;
// lista de cuvinte-funcție prinde și textul fără diacritice (tastatură engleză, STT).
const RO_DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;
const RO_WORDS = /\b(și|sau|este|sunt|pentru|acum|vreau|trebuie|adică|deci|foarte|aici|acolo|cumva|ceva|nimic|pentru că|nu știu|cum se spune|chestia|lucrul|aia|asta)\b/gi;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'ăâîșț\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

/**
 * Numără cuvintele românești (mărci de code-switch) dintr-o replică. Trei semnale, în ordine:
 *  1. diacritice românești (semnalul cel mai sigur),
 *  2. cuvânt cunoscut din dicționarul RESCUE (exact substantivele pe care learner-ul le scapă,
 *     ex. „aspirator", „frigider" — fără diacritice, altfel indetectabile determinist),
 *  3. cuvinte-funcție românești fără diacritice.
 */
export function countCodeSwitchWords(text: string): number {
  let n = 0;
  for (const w of words(text)) {
    if (RO_DIACRITICS.test(w)) { n += 1; continue; }
    if (lookupRescue(w)) n += 1; // substantiv românesc cunoscut, chiar fără diacritice
  }
  const funcMatches = text.match(RO_WORDS);
  if (funcMatches) n += funcMatches.filter((m) => !RO_DIACRITICS.test(m) && !lookupRescue(m)).length;
  return n;
}

function fillersIn(text: string): number {
  return countMatches(text, FILLER_PATTERNS);
}

/** Cuvinte „reale" dintr-o replică, fără filler-ele detectate (pentru MLR). */
function contentWordCount(text: string): number {
  const total = words(text).length;
  const fillers = fillersIn(text);
  return Math.max(0, total - fillers);
}

/**
 * Calculează metricile de fluență dintr-o listă de replici + timpul efectiv vorbit (secunde).
 * Pur, determinist, fără efecte secundare — poate rula la finalul sesiunii sau într-un test.
 */
export function computeFluency(turns: Utterance[], speakingSec: number): FluencyMetrics {
  const userTurns = turns.filter((t) => t.role === 'user' && t.text.trim().length > 0);
  if (userTurns.length === 0) {
    return { ttfwMs: 0, mlr: 0, pausesOver1_5s: 0, codeSwitches: 0, fillerRate: 0, wordsPerMinute: 0, utterances: 0 };
  }

  const hesitations = userTurns.map((t) => t.hesitationMs).filter((h): h is number => typeof h === 'number' && h >= 0);
  const ttfwMs = median(hesitations);
  const pausesOver1_5s = hesitations.filter((h) => h > 1500).length;

  const totalContentWords = userTurns.reduce((a, t) => a + contentWordCount(t.text), 0);
  const totalWords = userTurns.reduce((a, t) => a + words(t.text).length, 0);
  const mlr = Math.round((totalContentWords / userTurns.length) * 10) / 10;

  const codeSwitches = userTurns.reduce((a, t) => a + countCodeSwitchWords(t.text), 0);

  const totalFillers = userTurns.reduce((a, t) => a + fillersIn(t.text), 0);
  const speakingMin = Math.max(speakingSec, 1) / 60;
  const fillerRate = Math.round((totalFillers / speakingMin) * 10) / 10;
  const wordsPerMinute = Math.round(totalWords / speakingMin);

  return { ttfwMs, mlr, pausesOver1_5s, codeSwitches, fillerRate, wordsPerMinute, utterances: userTurns.length };
}

/** Etichete RO pentru afișare, cu unitatea potrivită. */
export const FLUENCY_LABELS_RO: Record<keyof Omit<FluencyMetrics, 'utterances'>, { label: string; unit: string; help: string }> = {
  ttfwMs: { label: 'Start', unit: 's', help: 'Cât durează până începi să vorbești. Mai mic = te blochezi mai puțin.' },
  mlr: { label: 'Lungime frază', unit: 'cuv.', help: 'Câte cuvinte spui fără să te oprești. Mai mare = mai fluent.' },
  pausesOver1_5s: { label: 'Pauze lungi', unit: '', help: 'Pauze de gândire peste 1,5 secunde.' },
  codeSwitches: { label: 'Cuvinte în română', unit: '', help: 'Cuvinte care ți-au lipsit și le-ai spus în română.' },
  fillerRate: { label: 'Ezitări', unit: '/min', help: '„ăăă", „how you say" — pe minut de vorbire.' },
  wordsPerMinute: { label: 'Ritm', unit: 'cuv/min', help: 'Cât de repede vorbești, în cuvinte pe minut.' },
};
