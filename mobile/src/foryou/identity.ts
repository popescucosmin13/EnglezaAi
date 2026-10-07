import type { ForYouCard } from './types';

function normalizedText(text: string): string {
  return text
    .toLocaleLowerCase('en-US')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addTextKey(keys: Set<string>, text?: string): void {
  const normalized = normalizedText(text ?? '');
  if (normalized.length >= 4) keys.add(`text:${normalized}`);
}

/**
 * Cheile reprezintă ideea învățată, nu forma vizuală a cardului.
 * Astfel, o expresie, un dialog și un quiz din aceeași lecție nu sunt
 * tratate ca trei lucruri noi în același feed.
 */
export function learningKeysForCard(card: ForYouCard): string[] {
  const keys = new Set<string>();

  if ('lesson' in card) {
    keys.add(`lesson:${card.lesson.lesson_id}`);
    const focus = normalizedText(card.lesson.grammar_focus);
    if (focus.length >= 4) keys.add(`focus:${focus}`);
  }

  if (card.kind === 'discovery') keys.add(`discovery:${card.discovery.id}`);
  if (card.kind === 'story') keys.add(`story:${card.episode.id}`);
  if (card.kind === 'phrase') addTextKey(keys, card.english);
  if (card.kind === 'dialogue') card.lines.forEach((line) => addTextKey(keys, line.text));
  if (card.kind === 'insight') addTextKey(keys, card.example);
  if (card.kind === 'mistake') addTextKey(keys, card.mistake.correctFragment ?? card.mistake.corrected);
  if (card.kind === 'vocab') addTextKey(keys, card.vocab.word);

  if (card.kind === 'quiz' || card.kind === 'listening') {
    addTextKey(keys, card.exercise.answer);
    addTextKey(keys, card.exercise.full_answer);
    card.exercise.accepted_answers?.forEach((answer) => addTextKey(keys, answer));
    card.exercise.model_answers?.forEach((answer) => addTextKey(keys, answer));
    card.exercise.tts_texts?.forEach((answer) => addTextKey(keys, answer));
  }

  return [...keys];
}

export function sharesLearningContent(a: ForYouCard, b: ForYouCard): boolean {
  const first = new Set(learningKeysForCard(a));
  return learningKeysForCard(b).some((key) => first.has(key));
}

export function dedupeLearningCards(cards: ForYouCard[], initialKeys: Iterable<string> = []): ForYouCard[] {
  const used = new Set(initialKeys);
  return cards.filter((card) => {
    const keys = learningKeysForCard(card);
    if (keys.some((key) => used.has(key))) return false;
    keys.forEach((key) => used.add(key));
    return true;
  });
}
