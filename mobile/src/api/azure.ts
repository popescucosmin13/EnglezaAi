// Azure Pronunciation Assessment (REST) + fallback local prin STT-diff — portat de pe web.
// Pe iOS înregistrarea este deja WAV PCM16 mono 16 kHz (formatul cerut de Azure);
// pe Android (m4a) apelul Azure va eșua în validare și se folosește automat STT-diff.

import type { WordScore, PhonemeScore } from '../types';
import type { RecordedAudio } from '../audio/recorder';
import { apiError, apiFetch } from './backend';
import { referenceHint, transcribe } from './stt';

export interface PronAssessment {
  accuracyScore: number; // 0-100
  fluencyScore: number;
  prosodyScore?: number;
  words: WordScore[];
  phonemes: PhonemeScore[];
  source: 'azure' | 'stt-diff';
}

/**
 * Scoring pe fonem cu Azure Speech, cu fallback automat pe STT-diff dacă backend-ul nu răspunde.
 * Sursa reală a scorului este în `result.source` — interfața trebuie să o afișeze pe aceea.
 * `wav` trebuie să fie PCM16 mono 16kHz (garantat pe iOS de Recorder).
 */
export async function assessWithAzure(wav: RecordedAudio, referenceText: string): Promise<PronAssessment> {
  let data: any;
  try {
    if (wav.format !== 'wav') throw new Error('Azure cere WAV PCM16 (pe acest dispozitiv se înregistrează m4a).');
    const res = await apiFetch('azure', {
      method: 'POST',
      body: JSON.stringify({ audioBase64: await wav.base64(), referenceText }),
    });
    if (!res.ok) throw await apiError(res, 'Azure Speech');
    data = await res.json();
    // Plasă de siguranță pe client (pe lângă cea de pe server): un răspuns fără PA nu poate
    // produce un scor real — orice am calcula din el ar fi un 0 fals afișat utilizatorului.
    if (!data?.NBest?.[0]?.PronunciationAssessment) {
      throw new Error(`Azure nu a returnat scoruri de pronunție (status: ${data?.RecognitionStatus ?? 'necunoscut'}).`);
    }
  } catch (error) {
    console.warn('Azure Speech indisponibil, folosesc evaluarea STT-diff:', error);
    const { text } = await transcribe(wav, undefined, referenceHint(referenceText));
    // un transcript gol ar produce scor 0% fals — mai bine cerem o nouă încercare
    if (!text.trim()) throw new Error('Nu s-a auzit nimic în înregistrare — mai încearcă.');
    return sttDiffAssessment(referenceText, text);
  }
  const best = data?.NBest?.[0];
  if (!best) throw new Error('Azure nu a recunoscut vorbirea.');
  const pa = best.PronunciationAssessment ?? {};
  const words: WordScore[] = (best.Words ?? []).map((w: any) => ({
    word: w.Word,
    score: Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0),
  }));
  const phonemeMap = new Map<string, { sum: number; n: number }>();
  for (const w of best.Words ?? []) {
    for (const p of w.Phonemes ?? []) {
      const key = p.Phoneme;
      const sc = p.PronunciationAssessment?.AccuracyScore ?? 0;
      const cur = phonemeMap.get(key) ?? { sum: 0, n: 0 };
      cur.sum += sc;
      cur.n += 1;
      phonemeMap.set(key, cur);
    }
  }
  const phonemes: PhonemeScore[] = [...phonemeMap.entries()].map(([phoneme, { sum, n }]) => ({
    phoneme,
    score: Math.round(sum / n),
  }));
  return {
    accuracyScore: Math.round(pa.AccuracyScore ?? 0),
    fluencyScore: Math.round(pa.FluencyScore ?? 0),
    prosodyScore: pa.ProsodyScore != null ? Math.round(pa.ProsodyScore) : undefined,
    words,
    phonemes,
    source: 'azure',
  };
}

// ---------- Fallback: comparație transcriere vs. text de referință ----------

/**
 * Contracțiile uzuale le expandăm înainte de comparație: STT-ul transcrie des „I'm / it's / you're"
 * acolo unde textul de referință are forma lungă — o pronunție perfect corectă nu trebuie penalizată.
 */
const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is', "it's": 'it is',
  "we're": 'we are', "they're": 'they are', "i've": 'i have', "we've": 'we have',
  "you've": 'you have', "they've": 'they have', "i'll": 'i will', "you'll": 'you will',
  "he'll": 'he will', "she'll": 'she will', "we'll": 'we will', "they'll": 'they will',
  "i'd": 'i would', "you'd": 'you would', "he'd": 'he would', "she'd": 'she would',
  "it'd": 'it would', "we'd": 'we would', "they'd": 'they would', "won't": 'will not',
  "can't": 'cannot', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "couldn't": 'could not',
  "shouldn't": 'should not', "wouldn't": 'would not', "mustn't": 'must not',
};

function normWords(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return raw.flatMap((w) => (CONTRACTIONS[w] ? CONTRACTIONS[w].split(' ') : [w]));
}

/**
 * Potrivire tolerantă la variațiile minore de transcriere (STT): cuvinte egale, sau unul e
 * rădăcina celuilalt (inflexiuni/plural — work/worked, year/years), cu minim 4 litere pe cuvântul
 * scurt ca să nu apară potriviri false pe cuvinte scurte (the/there, car/cart). Astfel un cuvânt
 * rostit corect dar transcris cu o terminație diferită nu mai e punctat greșit.
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/** Aliniere pe cuvinte (LCS): cuvintele din referință care apar în ordine în transcriere → 100, restul → 0. */
export function sttDiffAssessment(referenceText: string, transcript: string): PronAssessment {
  const ref = normWords(referenceText);
  const hyp = normWords(transcript);
  const n = ref.length;
  const m = hyp.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = wordsMatch(ref[i - 1], hyp[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // backtrack: marchează cuvintele din referință potrivite
  const matched = new Array(n).fill(false);
  let i = n,
    j = m;
  while (i > 0 && j > 0) {
    if (wordsMatch(ref[i - 1], hyp[j - 1])) {
      matched[i - 1] = true;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const words: WordScore[] = ref.map((w, idx) => ({ word: w, score: matched[idx] ? 100 : 0 }));
  const overall = n > 0 ? Math.round((matched.filter(Boolean).length / n) * 100) : 0;
  return { accuracyScore: overall, fluencyScore: overall, words, phonemes: [], source: 'stt-diff' };
}
