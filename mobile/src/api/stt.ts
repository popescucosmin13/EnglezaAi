// STT unificat prin OpenRouter (audio → model multimodal). Pe nativ nu există Web Speech,
// deci parametrul liveText rămâne doar pentru compatibilitatea semnăturii (mereu gol).

import { getSettings } from '../settings';
import { transcribeViaOpenRouter } from './openrouter';
import type { RecordedAudio } from '../audio/recorder';

/**
 * Transcrie o înregistrare. `liveText` există doar pentru compatibilitate cu web-ul
 * (acolo venea din Web Speech); dacă e gol se folosește întotdeauna STT-ul cloud.
 * `contextHint` ajută modelul să dezambiguizeze cuvintele neclare (subiect, vocabular așteptat).
 */
export async function transcribe(
  audio: RecordedAudio,
  liveText?: string,
  contextHint?: string
): Promise<{ text: string; wav: RecordedAudio }> {
  const s = getSettings();
  if (s.sttProvider === 'webspeech') {
    const live = (liveText ?? '').trim();
    if (live) return { text: live, wav: audio };
  }
  const base64 = await audio.base64();
  const text = await transcribeViaOpenRouter(base64, contextHint, audio.format);
  return { text, wav: audio };
}

/** Hint standard pentru exercițiile cu text de referință (repetă/citește propoziția afișată). */
export function referenceHint(referenceText: string): string {
  return `The speaker is practicing pronunciation and attempts to read this reference sentence aloud: "${referenceText}". Transcribe their actual words, including mispronunciations and omissions.`;
}
