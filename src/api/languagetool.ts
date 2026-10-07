// Verificare deterministă prin backend-ul propriu; acesta proxiază serviciul LanguageTool self-hosted.

import { apiError, apiFetch } from './backend';
import type { GrammarMatch } from '../types';

export type LtMatch = GrammarMatch;

/** Aruncă eroare descriptivă la eșec — apelantul decide cum raportează (nu ascundem eșecul ca „0 rezultate"). */
export async function checkWithLanguageTool(text: string): Promise<LtMatch[]> {
  let res: Response;
  try {
    res = await apiFetch('grammar', {
      method: 'POST',
      body: JSON.stringify({ text, language: 'en-US' }),
    });
  } catch {
    throw new Error('Nu s-a putut contacta LanguageTool (rețea indisponibilă).');
  }
  if (res.status === 429) throw new Error('Serviciul de gramatică: limită de cereri depășită. Încearcă din nou peste puțin.');
  if (!res.ok) throw await apiError(res, 'Serviciul de gramatică');
  const data = await res.json();
  return (data.matches ?? [])
    .map((m: any) => ({
      message: m.message,
      shortMessage: m.shortMessage || '',
      offset: m.offset,
      length: m.length,
      replacements: (m.replacements ?? []).slice(0, 3).map((r: any) => r.value),
      ruleId: m.rule?.id ?? '',
      category: m.rule?.category?.name ?? '',
    }))
    .filter((m: LtMatch) => !isSpellingMatch(m));
}

/**
 * Textul verificat aici e întotdeauna un transcript VORBIT: ortografia nu poate fi greșeala
 * vorbitorului. „Typo"-urile sunt artefacte STT („exactlly"), iar pe nume proprii necunoscute
 * dicționarului produc înlocuiri absurde („Moeciu" → „Media") care ajungeau în harta greșelilor.
 * Regulile gramaticale reale (articole, acord, prepoziții...) trec mai departe nefiltrate.
 */
function isSpellingMatch(m: LtMatch): boolean {
  return /morfologik|spell|hunspell/i.test(m.ruleId) || /typo|spelling|ortografie/i.test(m.category);
}
