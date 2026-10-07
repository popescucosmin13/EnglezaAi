// Teste pentru scara de repetiție spațiată (§16).

import { describe, it, expect } from 'vitest';
import { LADDER_DAYS, todayStr, newReviewState, applyReview, isDue } from './ladder';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

describe('todayStr', () => {
  it('formatează data ca YYYY-MM-DD', () => {
    expect(todayStr(new Date(2026, 6, 15))).toBe('2026-07-15');
    expect(todayStr(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('newReviewState', () => {
  it('începe la pasul 0, scadent azi', () => {
    const s = newReviewState();
    expect(s.step).toBe(0);
    expect(s.correctUses).toBe(0);
    expect(s.failures).toBe(0);
    expect(s.nextReviewAt).toBe(todayStr());
    expect(isDue(s)).toBe(true);
  });
});

describe('applyReview', () => {
  it('good urcă un pas și programează repetarea conform scării', () => {
    const s = applyReview(newReviewState(), 'good');
    expect(s.step).toBe(1);
    expect(s.correctUses).toBe(1);
    expect(s.nextReviewAt).toBe(daysFromNow(LADDER_DAYS[1]));
  });

  it('spontaneous sare un pas în plus', () => {
    const s = applyReview(newReviewState(), 'spontaneous');
    expect(s.step).toBe(2);
    expect(s.nextReviewAt).toBe(daysFromNow(LADDER_DAYS[2]));
  });

  it('fail coboară două trepte și incrementează failures', () => {
    const start = { step: 3, nextReviewAt: todayStr(), correctUses: 2, failures: 0 };
    const s = applyReview(start, 'fail');
    expect(s.step).toBe(1);
    expect(s.failures).toBe(1);
    expect(s.correctUses).toBe(2); // eșecul nu adaugă utilizări corecte
    expect(s.nextReviewAt).toBe(daysFromNow(LADDER_DAYS[1]));
  });

  it('fail nu coboară sub pasul 0', () => {
    const s = applyReview({ step: 1, nextReviewAt: todayStr(), correctUses: 0, failures: 0 }, 'fail');
    expect(s.step).toBe(0);
    expect(s.nextReviewAt).toBe(todayStr());
    expect(isDue(s)).toBe(true);
  });

  it('slow rămâne pe treapta curentă dar programează o repetare apropiată', () => {
    const s = applyReview({ step: 3, nextReviewAt: todayStr(), correctUses: 1, failures: 0 }, 'slow');
    expect(s.step).toBe(3);
    expect(s.correctUses).toBe(2);
    expect(s.nextReviewAt).toBe(daysFromNow(LADDER_DAYS[3]));
  });

  it('slow de la pasul 0 urcă totuși la 1 (nu rămâne scadent azi)', () => {
    const s = applyReview(newReviewState(), 'slow');
    expect(s.step).toBe(1);
  });

  it('nu depășește ultima treaptă a scării', () => {
    const top = LADDER_DAYS.length - 1;
    const s = applyReview({ step: top, nextReviewAt: todayStr(), correctUses: 8, failures: 0 }, 'spontaneous');
    expect(s.step).toBe(top);
    expect(s.nextReviewAt).toBe(daysFromNow(LADDER_DAYS[top]));
  });

  it('nu mută starea inițială (imutabilitate)', () => {
    const start = newReviewState();
    applyReview(start, 'good');
    expect(start.step).toBe(0);
    expect(start.correctUses).toBe(0);
  });
});

describe('isDue', () => {
  it('scadent azi sau în trecut, nescadent în viitor', () => {
    expect(isDue({ step: 0, nextReviewAt: daysFromNow(-3), correctUses: 0, failures: 0 })).toBe(true);
    expect(isDue({ step: 0, nextReviewAt: todayStr(), correctUses: 0, failures: 0 })).toBe(true);
    expect(isDue({ step: 0, nextReviewAt: daysFromNow(1), correctUses: 0, failures: 0 })).toBe(false);
  });

  it('acceptă o dată de referință explicită', () => {
    expect(isDue({ step: 0, nextReviewAt: '2026-07-20', correctUses: 0, failures: 0 }, '2026-07-21')).toBe(true);
    expect(isDue({ step: 0, nextReviewAt: '2026-07-20', correctUses: 0, failures: 0 }, '2026-07-19')).toBe(false);
  });
});
