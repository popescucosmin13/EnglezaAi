import type { Mistake } from '../types';

function clean(text?: string): string {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function mistakeChoiceOptions(mistake: Mistake): string[] {
  const original = clean(mistake.original);
  const corrected = clean(mistake.corrected);
  if (original && corrected && original !== corrected && (wordCount(original) >= 3 || wordCount(corrected) >= 3)) {
    return [original, corrected];
  }
  return [
    clean(mistake.originalFragment) || original,
    clean(mistake.correctFragment) || corrected,
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
}

export function mistakeContext(mistake: Mistake): { label: string; text: string; limited: boolean } {
  const prompt = clean(mistake.promptRo);
  if (prompt) return { label: 'Sensul salvat', text: prompt, limited: false };

  const explanation = clean(mistake.explanationRo);
  if (explanation) {
    return { label: 'Indiciu din corectura salvată', text: explanation, limited: wordCount(clean(mistake.original)) < 3 };
  }

  const original = clean(mistake.original);
  if (wordCount(original) >= 3) return { label: 'Propoziția originală', text: original, limited: false };

  return {
    label: 'Indiciu din corectura salvată',
    text: 'Alege forma recomandată pentru situația în care ai folosit expresia.',
    limited: true,
  };
}
