// Pronunție v2 (§18): sunetele slabe ale userului + fraze personalizate generate zilnic.

import { chatJson } from '../api/openrouter';
import { hasOpenRouterKey } from '../settings';
import { buildPersonalizedPronPrompt } from '../prompts';
import { getPronResults, getVocab, todayStr, getPronBank, savePronSet, deletePronSet, newId } from '../db/db';
import type { PronPhrase } from '../types';
import { storage } from '../storage';

export type { PronPhrase };

export const SOUND_LABELS: Record<string, string> = {
  th: 'th (think/this)',
  w_v: 'w vs v',
  ee_i: 'ee vs i (sheep/ship)',
  h: 'h aspirat',
  ed: '-ed final',
  stress: 'accentul cuvintelor',
};
const ALL_SOUNDS = Object.keys(SOUND_LABELS);

const FALLBACK_PHRASES: PronPhrase[] = [
  { text: 'I think this is the third threat this month', targets: ['th'] },
  { text: 'The vendor verified the vulnerability on our website', targets: ['w_v'] },
  { text: 'We patched and deployed the updated version yesterday', targets: ['ed'] },
  { text: 'Please check this sheet before you ship it', targets: ['ee_i'] },
  { text: 'How has your helpdesk handled the hardware?', targets: ['h'] },
  { text: 'They thanked the team for the thorough review', targets: ['th'] },
  { text: 'A weak password was viewed on the victim workstation', targets: ['w_v'] },
  { text: 'He needs to read each field in the leaked file', targets: ['ee_i'] },
];

/** Sunetele cu media sub 70% din ultimele rezultate (→ rotația de mâine, §18). */
export async function weakSounds(): Promise<string[]> {
  const results = await getPronResults();
  if (results.length === 0) return ALL_SOUNDS.slice(0, 5);
  const recent = results.slice(-40);
  const byTarget = new Map<string, { sum: number; n: number }>();
  for (const r of recent)
    for (const t of r.targets) {
      const cur = byTarget.get(t) ?? { sum: 0, n: 0 };
      cur.sum += r.score;
      cur.n += 1;
      byTarget.set(t, cur);
    }
  const weak = ALL_SOUNDS.filter((s) => {
    const v = byTarget.get(s);
    return !v || v.sum / v.n < 70;
  });
  return weak.length > 0 ? weak : ALL_SOUNDS.slice(0, 3);
}

const KEY_PREFIX = 'en2.pronPhrases.';
/** Câte seturi nefolosite ținem în avans în Firestore pentru zilele când tier-ul gratuit pică. */
const BANK_TARGET_SIZE = 3;

export type PhraseSource = 'generated' | 'bank' | 'static';
interface GeneratedPhraseSet { phrases: PronPhrase[]; usedPaidFallback: boolean }

/** O generare pe tier-ul gratuit; null la eșec (rate limit, rețea, JSON invalid). */
async function generatePhraseSet(allowFreeFallback = true): Promise<GeneratedPhraseSet | null> {
  if (!hasOpenRouterKey()) return null;
  try {
    const sounds = await weakSounds();
    const vocab = (await getVocab()).map((v) => v.word);
    let usedPaidFallback = false;
    const gen = await chatJson<{ phrases: PronPhrase[] }>(
      [{ role: 'user', content: buildPersonalizedPronPrompt(sounds, vocab) }],
      {
        tier: 'free',
        allowFreeFallback,
        feature: allowFreeFallback ? 'pronunciation_daily' : 'pronunciation_bank',
        maxTokens: 1200,
        onMeta: (meta) => { usedPaidFallback ||= meta.fallback; },
        validate: (v) => {
          const phrases = (v as { phrases?: PronPhrase[] })?.phrases;
          return Array.isArray(phrases) && phrases.length > 0 && phrases.every((p) => typeof p?.text === 'string' && Array.isArray(p?.targets));
        },
      }
    );
    return Array.isArray(gen.phrases) && gen.phrases.length > 0 ? { phrases: gen.phrases, usedPaidFallback } : null;
  } catch (e) {
    console.warn('Generarea frazelor personalizate a eșuat:', e);
    return null;
  }
}

/** Umple depozitul până la țintă — best-effort, în fundal, se oprește la primul eșec. */
async function topUpBank(): Promise<void> {
  try {
    const bank = await getPronBank();
    for (let i = bank.length; i < BANK_TARGET_SIZE; i++) {
      // Depozitul este o optimizare gratuită; nu are voie să cadă pe modelul plătit.
      const generated = await generatePhraseSet(false);
      if (!generated) return;
      await savePronSet({ id: newId(), phrases: generated.phrases, createdAt: new Date().toISOString() });
    }
  } catch { /* depozitul e doar o plasă de siguranță */ }
}

/** Consumă cel mai vechi set din depozit (cel mai apropiat de sunetele slabe de atunci încoace). */
async function takeFromBank(): Promise<PronPhrase[] | null> {
  try {
    const bank = (await getPronBank()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const pick = bank[0];
    if (!pick) return null;
    await deletePronSet(pick.id);
    return pick.phrases;
  } catch {
    return null;
  }
}

/**
 * Frazele zilei, cu sursa lor: generate live → din depozit → static.
 * Doar variantele reale se cacheuiesc pe zi; fallback-ul static NU se salvează,
 * ca următoarea deschidere să reîncerce generarea.
 */
export async function getPersonalizedPhrasesDetailed(): Promise<{ phrases: PronPhrase[]; source: PhraseSource }> {
  const key = KEY_PREFIX + todayStr();
  const cached = storage.getItem(key);
  if (cached) return { phrases: JSON.parse(cached), source: (storage.getItem(key + '.src') as PhraseSource) ?? 'generated' };

  const generated = await generatePhraseSet();
  if (generated) {
    storage.setItem(key, JSON.stringify(generated.phrases));
    storage.setItem(key + '.src', 'generated');
    if (!generated.usedPaidFallback) void topUpBank();
    return { phrases: generated.phrases, source: 'generated' };
  }

  // Generarea e picată chiar acum — nu mai încercăm și reumplerea; depozitul se reface în prima zi bună.
  const fromBank = await takeFromBank();
  if (fromBank) {
    storage.setItem(key, JSON.stringify(fromBank));
    storage.setItem(key + '.src', 'bank');
    return { phrases: fromBank, source: 'bank' };
  }

  return { phrases: FALLBACK_PHRASES, source: 'static' };
}

/** Frazele personalizate ale zilei (§33). */
export async function getPersonalizedPhrases(): Promise<PronPhrase[]> {
  return (await getPersonalizedPhrasesDetailed()).phrases;
}
