import type { Utterance } from '../types';

export const FULL_CONTEXT_TURNS = 12;
export const RECENT_CONTEXT_TURNS = 8;
export const SUMMARY_REFRESH_TURNS = 8;

export function shouldAppendUserContent(turns: Utterance[], content: string): boolean {
  const last = turns[turns.length - 1];
  return !(last?.role === 'user' && last.text.trim() === content.trim());
}

export function formatRollingSummaryInput(previousSummary: string, newlyAgedTurns: Utterance[]): string {
  const turnsText = newlyAgedTurns
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Teacher'}: ${t.text}`)
    .join('\n');
  if (!previousSummary.trim()) return `New conversation turns:\n${turnsText}`;
  return `Previous compact summary:\n${previousSummary.trim()}\n\nNew conversation turns to merge:\n${turnsText}`;
}

export function turnsAfterSummary(turns: Utterance[], summaryThrough: number): Utterance[] {
  return turns.slice(Math.max(0, Math.min(summaryThrough, turns.length)));
}

function isContextDependentLearnerReply(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= 7 || /^(yes|no|maybe|probably|because|it|that|this|they|he|she|i do|i did|i have|i am|not really)\b/i.test(text.trim());
}

function lastTeacherQuestion(text: string): string {
  const end = text.lastIndexOf('?');
  if (end < 0) return '';
  const before = text.slice(0, end);
  const start = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?')) + 1;
  return text.slice(start, end + 1).trim();
}

/**
 * Memoria are nevoie în principal de ce a spus learner-ul. Din replica profesorului păstrăm
 * numai ultima întrebare; fără întrebare, păstrăm contextul doar pentru răspunsuri dependente sau corecturi.
 */
export function compactTranscriptForMemory(turns: Utterance[], maxChars = 7000): string {
  const rows: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role !== 'user') continue;
    const previous = turns[i - 1];
    if (previous?.role === 'ai') {
      const question = lastTeacherQuestion(previous.text);
      if (question) rows.push(`Teacher context: ${question.slice(0, 180)}`);
      else if (isContextDependentLearnerReply(turn.text) || /small correction|please repeat|say it again/i.test(previous.text)) {
        rows.push(`Teacher context: ${previous.text.slice(0, 240)}`);
      }
    }
    rows.push(`Learner: ${turn.text}`);
  }
  return rows.join('\n').slice(0, maxChars);
}
