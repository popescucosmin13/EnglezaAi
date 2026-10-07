import { describe, expect, it } from 'vitest';
import { arrangeForYouCards } from './arrange';
import { interactionIsCoolingDown } from './cooldown';
import type { ForYouCard, ForYouInteraction } from './types';

function card(id: string, interactive: boolean): ForYouCard {
  return { id, interactive } as ForYouCard;
}

describe('arrangeForYouCards', () => {
  it('introduce un exercițiu activ după cel mult două carduri pasive', () => {
    const arranged = arrangeForYouCards([
      card('p1', false),
      card('p2', false),
      card('p3', false),
      card('a1', true),
      card('p4', false),
      card('a2', true),
    ]);

    let passiveRun = 0;
    for (const item of arranged) {
      passiveRun = item.interactive ? 0 : passiveRun + 1;
      expect(passiveRun).toBeLessThanOrEqual(2);
    }
    expect(arranged.map((item) => item.id)).toEqual(['p1', 'p2', 'a1', 'p3', 'p4', 'a2']);
  });

  it('păstrează ordinea când ritmul este deja activ', () => {
    const arranged = arrangeForYouCards([card('p1', false), card('a1', true), card('p2', false)]);
    expect(arranged.map((item) => item.id)).toEqual(['p1', 'a1', 'p2']);
  });

  it('nu pune mai mult de două teste consecutive', () => {
    const arranged = arrangeForYouCards([
      card('a1', true), card('a2', true), card('a3', true), card('a4', true), card('p1', false), card('p2', false),
    ]);
    let activeRun = 0;
    for (const item of arranged) {
      activeRun = item.interactive ? activeRun + 1 : 0;
      expect(activeRun).toBeLessThanOrEqual(2);
    }
  });
});

describe('pauza inteligentă după reușită', () => {
  function interaction(patch: Partial<ForYouInteraction>): ForYouInteraction {
    return {
      views: 1, completions: 1, answers: 1, correctAnswers: 1, hints: 0, reveals: 0,
      liked: false, saved: false, hidden: false, known: false,
      lastSeenAt: '2026-08-12T10:00:00.000Z', nextEligibleAt: '', ...patch,
    };
  }

  it('ascunde până la termen un card rezolvat corect', () => {
    const now = Date.parse('2026-08-12T12:00:00.000Z');
    expect(interactionIsCoolingDown(interaction({ nextEligibleAt: '2026-08-13T10:00:00.000Z' }), now)).toBe(true);
  });

  it('permite recapitularea când termenul a sosit', () => {
    const now = Date.parse('2026-08-14T12:00:00.000Z');
    expect(interactionIsCoolingDown(interaction({ nextEligibleAt: '2026-08-13T10:00:00.000Z' }), now)).toBe(false);
  });

  it('protejează și progresul vechi, salvat înainte de câmpul de programare', () => {
    const now = Date.parse('2026-08-12T20:00:00.000Z');
    expect(interactionIsCoolingDown(interaction({ nextEligibleAt: '' }), now)).toBe(true);
  });
});
