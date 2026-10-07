// RESCUE — cuvântul care nu-ți vine, rezolvat pe loc și cu cost aproape zero în tokeni.
//
// Cascada de cost (oprire la primul hit):
//   1. dicționar-seed local     → 0 tokeni, <5ms  (cuvintele frecvente)
//   2. cache Firestore          → 0 tokeni        (orice cuvânt deja salvat o dată)
//   3. LLM pe tier ieftin       → tokeni minimi    (doar ce nu e acoperit; rezultatul se cache-uiește)
//
// Fiecare rescue devine item de vocabular cu propoziția-sursă (§3, §8) — la revizie primești
// propriul context, nu un flashcard steril.

import type { Profile, RescueEvent, RescueTrigger } from '../types';
import { chatJson } from './openrouter';
import { buildRescuePrompt } from '../prompts';
import { lookupRescue, normalizeRo } from '../logic/rescue-dictionary';
import { getCachedRescue, cacheRescue } from '../db/db';
import { addVocabItem } from '../logic/engine';

export interface RescueRequest {
  trigger: RescueTrigger;
  roTerm: string;
  contextBefore?: string;
  contextAfter?: string;
  profile: Profile;
}

interface RescueApiResponse {
  en: string;
  alternatives?: string[];
  register?: string;
}

/** Rezolvă un blocaj lexical. Nu aruncă: la eșec total întoarce null și UI-ul rămâne curat. */
export async function rescueWord(req: RescueRequest): Promise<RescueEvent | null> {
  const normalized = normalizeRo(req.roTerm);
  if (!normalized) return null;

  const base = {
    trigger: req.trigger,
    roTerm: req.roTerm.trim(),
    sourceSentence: [req.contextBefore, '___', req.contextAfter].filter(Boolean).join(' ').trim() || undefined,
    ts: Date.now(),
  };

  // 1. dicționar-seed local
  const seed = lookupRescue(normalized);
  if (seed) return { ...base, enWord: seed.en, alternatives: seed.alternatives, source: 'dictionary' };

  // 2. cache Firestore (best-effort — o eroare de rețea nu blochează cascada)
  try {
    const cached = await getCachedRescue(normalized);
    if (cached?.en) return { ...base, enWord: cached.en, alternatives: cached.alternatives, source: 'cache' };
  } catch (e) {
    console.warn('Cache-ul RESCUE nu a putut fi citit:', e);
  }

  // 3. LLM pe tier ieftin, output minuscul; rezultatul se salvează în cache pentru data viitoare
  try {
    const res = await chatJson<RescueApiResponse>(
      [{ role: 'user', content: buildRescuePrompt(req.roTerm, req.contextBefore ?? '', req.contextAfter ?? '') }],
      {
        tier: 'utility',
        temperature: 0.2,
        feature: 'rescue_word',
        maxTokens: 120,
        timeoutMs: 12_000, // răspuns pe loc — cedăm repede dacă providerul întârzie
        validate: (v) => typeof (v as RescueApiResponse)?.en === 'string' && (v as RescueApiResponse).en.trim().length > 0,
      }
    );
    const enWord = res.en.trim();
    const alternatives = (res.alternatives ?? []).filter((a) => typeof a === 'string' && a.trim()).slice(0, 2);
    void cacheRescue(normalized, { en: enWord, alternatives }).catch(() => {});
    return { ...base, enWord, alternatives, source: 'ai' };
  } catch (e) {
    console.warn('RESCUE (LLM) a eșuat:', e);
    return null;
  }
}

/**
 * Salvează cuvântul salvat prin RESCUE în coada de vocabular, cu propoziția-sursă.
 * Item nou → scadent curând, ca un cuvânt care ți-a lipsit efectiv să aibă prioritate (§8).
 */
export async function saveRescueToQueue(ev: RescueEvent): Promise<void> {
  try {
    await addVocabItem({
      word: ev.enWord,
      translation: ev.roTerm,
      kind: ev.enWord.trim().includes(' ') ? 'expression' : 'word',
      example: ev.sourceSentence ?? '',
    });
  } catch (e) {
    console.warn('Salvarea cuvântului RESCUE în coadă a eșuat:', e);
  }
}
