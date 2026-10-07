import { describe, expect, it } from 'vitest';
import { normalizeAdminActivity, normalizeAdminProfile } from './admin-normalize';

describe('legacy and untrusted profile documents', () => {
  it('normalizes malformed display fields so one profile cannot break the admin UI', () => {
    const result = normalizeAdminProfile({ email: { nested: 'bad' }, xp: NaN, streak: -5, currentLevel: 'admin', mainObjective: ['not-text'], scores: { grammar: 1000, conversation: 'bad', pronunciation: 62 }, interests: ['travel', {}], onboarded: 'false' });
    expect(result.email).toBe(''); expect(result.xp).toBe(0); expect(result.streak).toBe(0);
    expect(result.currentLevel).toBeUndefined(); expect(result.mainObjective).toBe('');
    expect(result.scores).toEqual({ grammar: 100, pronunciation: 62 });
    expect(result.interests).toEqual(['travel']); expect(result.onboarded).toBe(false);
  });
  it('does not concatenate string metrics or include nonfinite activity', () => {
    expect(normalizeAdminActivity({ date: '2026-09-09', sessionCount: '9000', speakingSec: Infinity, xp: -1, lessonDone: true })).toMatchObject({ date: '2026-09-09', sessionCount: 0, speakingSec: 0, xp: 0, lessonDone: true });
  });
});
