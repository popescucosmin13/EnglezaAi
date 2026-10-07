import { describe, expect, it } from 'vitest';
import type { Mistake } from '../types';
import { mistakeChoiceOptions, mistakeContext } from './mistake-context';

function mistake(patch: Partial<Mistake>): Mistake {
  return {
    id: 'm1',
    original: 'I want',
    corrected: 'I wanted',
    category: 'past_simple',
    severity: 'medium',
    explanationRo: 'Contextul este trecut; trebuie past simple.',
    firstSeenAt: '2026-08-11T10:00:00.000Z',
    lastSeenAt: '2026-08-11T10:00:00.000Z',
    occurrenceCount: 1,
    status: 'new',
    review: { step: 0, nextReviewAt: '2026-08-11', lastReviewedAt: '', correctUses: 0, failures: 0 },
    ...patch,
  };
}

describe('contextul unei greșeli', () => {
  it('preferă propozițiile complete în opțiuni', () => {
    const item = mistake({ original: 'Yesterday I want to leave.', corrected: 'Yesterday I wanted to leave.', originalFragment: 'I want', correctFragment: 'I wanted' });
    expect(mistakeChoiceOptions(item)).toEqual(['Yesterday I want to leave.', 'Yesterday I wanted to leave.']);
  });

  it('arată explicit limita când istoricul conține doar fragmente ambigue', () => {
    expect(mistakeContext(mistake({}))).toEqual({
      label: 'Indiciu din corectura salvată',
      text: 'Contextul este trecut; trebuie past simple.',
      limited: true,
    });
  });

  it('folosește sensul românesc salvat când există', () => {
    expect(mistakeContext(mistake({ promptRo: 'Atunci voiam să plec.' })).text).toBe('Atunci voiam să plec.');
  });
});
