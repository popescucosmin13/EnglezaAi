import { describe, expect, it } from 'vitest';
import { configPatch, profilePatch, validDays, validId } from './admin-validation';

describe('admin mutation validation', () => {
  it.each([{ role: 'admin' }, { email: 'other@example.com' }, { xp: 9999 }, { currentLevel: ['A1'] }, { correctionMode: {} }, { dailyGoalMinutes: '15' }, { dailyGoalMinutes: 5.5 }, { dailyGoalMinutes: 121 }, { mainObjective: '  ' }, {}])('rejects forbidden or invalid profile patches: %j', patch => {
    expect(() => profilePatch(patch)).toThrow();
  });
  it('only accepts explicit pedagogical settings', () => {
    const patch = { currentLevel: 'B2', targetLevel: 'C1', dailyGoalMinutes: 30, mainObjective: 'Carieră', correctionMode: 'final' };
    expect(profilePatch(patch)).toEqual(patch);
  });
  it.each([null, '', '..', '/', 'user/sessions/id', 'a\nb'])('rejects invalid document paths: %j', id => expect(() => validId(id)).toThrow());
  it.each([0, 1, 365, NaN, 'other'])('rejects unbounded reporting windows: %j', days => expect(() => validDays(days)).toThrow());
  it('allows supported calendar windows and valid UIDs', () => { expect(validDays(90)).toBe(90); expect(validId('user-123')).toBe('user-123'); });
  it('rejects secrets, invalid providers and incorrect boolean types in configuration', () => {
    expect(() => configPatch({ apiKey: 'secret' })).toThrow();
    expect(() => configPatch({ ttsProvider: 'invented' })).toThrow();
    expect(() => configPatch({ googleTtsMobileEnglish: 'true' })).toThrow();
    expect(configPatch({ freeModel: '', googleTtsMobileEnglish: false })).toEqual({ freeModel: '', googleTtsMobileEnglish: false });
  });
});
