import { beforeEach, describe, expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('../storage', () => ({ storage: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }));
vi.mock('../db/db', () => ({ defaultProfile: () => ({ onboarded: false, currentLevel: 'A1', targetLevel: 'B1', xp: 0 }) }));
import { clearFirstLessonPending, clearOnboardingDraft, hasFirstLessonPending, loadOnboardingDraft, loadShortOnboardingProgress, markFirstLessonPending, profileFromOnboardingDraft, saveOnboardingDraft, saveShortOnboardingProgress, shortOnboardingDraft } from './draft';
beforeEach(() => values.clear());
describe('short onboarding migration and persistence', () => {
  it('resumes a two-answer draft with empty interests across signup and verification', () => {
    const draft = shortOnboardingDraft('călătorii', 'pot construi propoziții simple');
    saveOnboardingDraft(draft);
    expect(loadOnboardingDraft()).toEqual(draft);
    expect(profileFromOnboardingDraft(loadOnboardingDraft()!)).toMatchObject({ onboarded: true, currentLevel: 'A2', mainObjective: 'călătorii' });
  });
  it('retains preferences from old seven-step drafts', () => {
    const draft = { ...shortOnboardingDraft('interviuri', 'pot conversa, dar fac multe greșeli'), dailyGoalMinutes: 30, interests: ['tehnologie', 'business'], correctionMode: 'final' as const };
    saveOnboardingDraft(draft); expect(loadOnboardingDraft()).toEqual(draft);
  });
  it('does not skip required answers when local data is corrupt', () => {
    values.set('englezaai.onboardingDraft.v1', '{broken'); expect(loadOnboardingDraft()).toBeNull();
    saveShortOnboardingProgress({ objective: 'călătorii', level: '', step: 2, answer: 1 });
    expect(loadShortOnboardingProgress().step).toBe(1);
    clearOnboardingDraft(); expect(loadShortOnboardingProgress().step).toBe(0);
  });
  it('keeps the first lesson handoff through draft cleanup without redirecting other accounts', () => {
    expect(hasFirstLessonPending('existing-account')).toBe(false);
    markFirstLessonPending('new-account');
    clearOnboardingDraft();
    expect(hasFirstLessonPending('new-account')).toBe(true);
    expect(hasFirstLessonPending('another-account')).toBe(false);
    clearFirstLessonPending('new-account');
    expect(hasFirstLessonPending('new-account')).toBe(false);
  });
});
