// STT unificat: OpenRouter (audio → model multimodal) sau textul deja obținut live prin Web Speech.

import { getSettings } from '../settings';
import { transcribeViaOpenRouter } from './openrouter';
import { blobToWav16k, blobToBase64 } from '../audio/wav';

/**
 * Transcrie un Blob audio. `liveText` e transcrierea obținută live prin Web Speech (dacă există).
 * Cu provider webspeech folosim liveText-ul; dacă acesta lipsește (exercițiile de pronunție,
 * vocabular, teste — unde nu rulează recunoașterea live), trecem pe STT-ul cloud, altfel
 * am compara vorbirea cu un text gol și orice scor ar ieși 0%.
 * `contextHint` ajută modelul să dezambiguizeze cuvintele neclare (subiect, vocabular așteptat).
 */
export async function transcribe(blob: Blob, liveText?: string, contextHint?: string): Promise<{ text: string; wav: Blob }> {
  const wav = await blobToWav16k(blob);
  const s = getSettings();
  if (s.sttProvider === 'webspeech') {
    const live = (liveText ?? '').trim();
    if (live) return { text: live, wav };
  }
  const base64 = await blobToBase64(wav);
  const text = await transcribeViaOpenRouter(base64, contextHint);
  return { text, wav };
}

/** Hint standard pentru exercițiile cu text de referință (repetă/citește propoziția afișată). */
export function referenceHint(referenceText: string): string {
  return `The speaker is practicing pronunciation and attempts to read this reference sentence aloud: "${referenceText}". Transcribe their actual words, including mispronunciations and omissions.`;
}
