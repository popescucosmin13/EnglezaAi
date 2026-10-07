// Repetiție spațiată pe scară fixă (§16): aceeași sesiune → 1z → 3z → 7z → 14z → 30z → 60z.
// Intervalul se adaptează: răspuns rapid/spontan urcă mai repede, eșecul coboară.

import type { ReviewState } from '../types';

export const LADDER_DAYS = [0, 1, 3, 7, 14, 30, 60];

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function newReviewState(): ReviewState {
  return { step: 0, nextReviewAt: todayStr(), correctUses: 0, failures: 0 };
}

export type ReviewOutcome = 'fail' | 'slow' | 'good' | 'fast' | 'spontaneous';

/**
 * fail = greșit; slow = corect dar cu ezitare; good = corect;
 * fast = corect și rapid; spontaneous = folosit corect spontan în conversație (sare un pas în plus).
 */
export function applyReview(state: ReviewState, outcome: ReviewOutcome): ReviewState {
  const s = { ...state, lastReviewedAt: todayStr() };
  if (outcome === 'fail') {
    s.failures += 1;
    s.step = Math.max(0, s.step - 2);
  } else {
    s.correctUses += 1;
    const bump = outcome === 'slow' ? 0 : outcome === 'good' ? 1 : outcome === 'fast' ? 1 : 2;
    s.step = Math.min(LADDER_DAYS.length - 1, s.step + Math.max(bump, outcome === 'slow' ? 1 : bump));
  }
  // "slow" rămâne pe loc dar tot programează o repetare apropiată
  if (outcome === 'slow') s.step = Math.max(1, state.step);
  s.nextReviewAt = dateInDays(LADDER_DAYS[s.step]);
  return s;
}

export function isDue(state: ReviewState, date = todayStr()): boolean {
  return state.nextReviewAt <= date;
}
