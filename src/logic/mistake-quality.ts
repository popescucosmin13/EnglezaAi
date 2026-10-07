import type { Mistake } from '../types';

const SPEECH_FILLER_RE = /\b(?:uh+|um+|erm+|hmm+)\b/gi;

/** Comparație pedagogică: ignoră majusculele și punctuația, dar păstrează apostroful și cratima. */
export function normalizeForCorrectionComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,!?;:"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasSpeechFillers(text: string): boolean {
  SPEECH_FILLER_RE.lastIndex = 0;
  return SPEECH_FILLER_RE.test(text);
}

/** Ezitările STT nu trebuie predate ca parte din varianta corectă. */
export function sanitizeCorrectionText(text: string): string {
  SPEECH_FILLER_RE.lastIndex = 0;
  return text
    .replace(SPEECH_FILLER_RE, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMeaningfulCorrection(original: string, corrected: string): boolean {
  const before = normalizeForCorrectionComparison(original);
  const after = normalizeForCorrectionComparison(corrected);
  return before.length > 0 && after.length > 0 && before !== after;
}

/** Elimină repetițiile imediate de 1-2 cuvinte („we we", „I want I want”) — bâlbe de vorbire sau STT dublat. */
function collapseRepeats(text: string): string {
  const ws = normalizeForCorrectionComparison(sanitizeCorrectionText(text)).split(' ').filter(Boolean);
  const out: string[] = [];
  for (const w of ws) {
    out.push(w);
    for (const n of [1, 2]) {
      while (out.length >= 2 * n && out.slice(-2 * n, -n).join(' ') === out.slice(-n).join(' ')) {
        out.length -= n;
      }
    }
  }
  return out.join(' ');
}

/**
 * „we we" → „we": o corectură care doar elimină repetiții involuntare nu e o greșeală de limbă,
 * ci un artefact al vorbirii/transcrierii — nu se predă și nu intră în harta greșelilor.
 */
export function isDisfluencyOnlyCorrection(original: string, corrected: string): boolean {
  const a = collapseRepeats(original);
  if (a.length === 0) return false;
  return a === collapseRepeats(corrected);
}

const words = (s: string): string[] => s.match(/[A-Za-z][A-Za-z']*/g) ?? [];

/** Numele utilizatorului, derivat din email (ex. "alex.ionescu" → ["alex", "ionescu"]). */
export function protectedNamesFromEmail(email?: string): string[] {
  if (!email) return [];
  return (email.split('@')[0] ?? '')
    .split(/[^A-Za-z]+/)
    .filter((t) => t.length >= 3)
    .map((t) => t.toLowerCase());
}

/**
 * O „corectură" care doar înlocuiește un nume propriu (ex. Alex → Cosmic) nu e o greșeală de limbă.
 * Semnal: toate cuvintele eliminate sunt nume protejate sau cuvinte cu majusculă în mijlocul frazei.
 */
export function isProperNounOnlyCorrection(original: string, corrected: string, protectedNames: string[] = []): boolean {
  const kept = new Set(words(corrected).map((w) => w.toLowerCase()));
  const removed = words(original)
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !kept.has(w.toLowerCase()));
  if (removed.length === 0) return false;
  return removed.every(({ w, i }) => protectedNames.includes(w.toLowerCase()) || (i > 0 && /^[A-Z]/.test(w)));
}

/**
 * Înlocuire de nume propriu la nivel de fragment (ex. „Moeciu" → „Media"): un cuvânt cu majusculă
 * din interiorul propoziției, „corectat" în alt cuvânt cu majusculă, nu e o greșeală de limbă —
 * e un nume pe care corectorul nu îl cunoaște.
 */
export function isProperNounFragmentSwap(original: string, wrong: string, right: string): boolean {
  const w = wrong.trim();
  const r = right.trim();
  if (!/^[A-Z][a-zA-Z''-]*$/.test(w) || !/^[A-Z]/.test(r)) return false;
  const idx = original.indexOf(w);
  return idx > 0; // majusculă în interiorul propoziției = nume propriu, nu început de frază
}

/** Înregistrările vechi invalide rămân în backup, dar nu mai intră în UI, exerciții sau statistici. */
export function isUsableMistake(
  mistake: Pick<Mistake, 'original' | 'corrected'> & Partial<Pick<Mistake, 'originalFragment' | 'correctFragment'>>,
  protectedNames: string[] = []
): boolean {
  // fragmentul atomic e ce se afișează și se exersează — dacă el e doar o bâlbă, cardul e zgomot
  const wrong = mistake.originalFragment?.trim() || mistake.original;
  const right = mistake.correctFragment?.trim() || mistake.corrected;
  return (
    !hasSpeechFillers(mistake.corrected)
    && isMeaningfulCorrection(mistake.original, mistake.corrected)
    && !isProperNounOnlyCorrection(mistake.original, mistake.corrected, protectedNames)
    && !isProperNounFragmentSwap(mistake.original, wrong, right)
    && !isDisfluencyOnlyCorrection(wrong, right)
  );
}

/** Ce afișăm pe un card de greșeală: fragmentul atomic dacă există, altfel propoziția întreagă. */
export function mistakeDisplay(
  m: Pick<Mistake, 'original' | 'corrected' | 'originalFragment' | 'correctFragment'>
): { wrong: string; right: string; contextRight?: string } {
  const wrong = m.originalFragment?.trim() || m.original;
  const right = m.correctFragment?.trim() || m.corrected;
  const contextRight =
    m.originalFragment && normalizeForCorrectionComparison(m.corrected) !== normalizeForCorrectionComparison(right)
      ? m.corrected
      : undefined;
  return { wrong, right, contextRight };
}

export function replaceFirstCorrection(
  text: string,
  wrong: string,
  replacement: string
): { text: string; applied: boolean } {
  const needle = wrong.trim();
  const next = sanitizeCorrectionText(replacement);
  if (!needle || !next || !isMeaningfulCorrection(needle, next)) return { text, applied: false };
  const index = text.toLocaleLowerCase('en').indexOf(needle.toLocaleLowerCase('en'));
  if (index < 0) return { text, applied: false };
  return {
    text: `${text.slice(0, index)}${next}${text.slice(index + needle.length)}`,
    applied: true,
  };
}

