import type { CorrectionMode, Profile } from '../types';
import { defaultProfile } from '../db/db';
import { storage } from '../storage';
import { ONBOARDING_OPTIONS } from '../content';

const STORAGE_KEY = 'englezaai.onboardingDraft.v1';
const SHORT_PROGRESS_KEY = 'englezaai.shortOnboarding.v1';
const KNOWN_ACCOUNT_KEY = 'englezaai.knownAccount.v1';
const COMPLETED_KEY_PREFIX = 'englezaai.onboardingCompleted.v1.';
const FIRST_LESSON_KEY_PREFIX = 'englezaai.firstLessonPending.v1.';

export interface OnboardingDraft {
  nativeLanguage: string;
  mainObjective: string;
  perceivedLevel: string;
  dailyGoalMinutes: number;
  temporalObjective: string;
  interests: string[];
  correctionMode: CorrectionMode;
  romanianHelp: 'multa' | 'putina';
  aiSpeed: 'lent' | 'normal' | 'provocare';
}

export function shortOnboardingDraft(mainObjective: string, perceivedLevel: string): OnboardingDraft {
  return {
    nativeLanguage: 'română', mainObjective, perceivedLevel, dailyGoalMinutes: 10,
    temporalObjective: 'progres general', interests: [], correctionMode: 'immediate',
    romanianHelp: 'multa', aiSpeed: 'normal',
  };
}

export interface ShortOnboardingProgress { objective: string; level: string; step: number; answer: number | null }
export function loadShortOnboardingProgress(): ShortOnboardingProgress {
  const empty = { objective: '', level: '', step: 0, answer: null };
  try {
    const value = JSON.parse(storage.getItem(SHORT_PROGRESS_KEY) || 'null');
    if (!value || !ONBOARDING_OPTIONS.objectives.includes(value.objective)) return empty;
    const level = ONBOARDING_OPTIONS.perceivedLevels.includes(value.level) ? value.level : '';
    return { objective: value.objective, level, step: level && value.step === 2 ? 2 : value.step >= 1 ? 1 : 0, answer: value.answer === 0 || value.answer === 1 ? value.answer : null };
  } catch { return empty; }
}
export function saveShortOnboardingProgress(value: ShortOnboardingProgress) {
  storage.setItem(SHORT_PROGRESS_KEY, JSON.stringify(value));
}

export function profileFromOnboardingDraft(draft: OnboardingDraft, base: Profile = defaultProfile()): Profile {
  const perceivedIndex = ONBOARDING_OPTIONS.perceivedLevels.indexOf(draft.perceivedLevel);
  return {
    ...base,
    ...draft,
    onboarded: true,
    currentLevel: perceivedIndex <= 1 ? 'A1' : perceivedIndex <= 3 ? 'A2' : 'B1',
    targetLevel: perceivedIndex >= 3 ? 'B2' : 'B1',
  };
}

export function saveOnboardingDraft(draft: OnboardingDraft): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    if (!ONBOARDING_OPTIONS.objectives.includes(parsed.mainObjective!) || !ONBOARDING_OPTIONS.perceivedLevels.includes(parsed.perceivedLevel!)) return null;
    const defaults = shortOnboardingDraft(parsed.mainObjective!, parsed.perceivedLevel!);
    return {
      ...defaults,
      nativeLanguage: ['română', 'engleză', 'spaniolă', 'italiană'].includes(parsed.nativeLanguage!) ? parsed.nativeLanguage! : defaults.nativeLanguage,
      dailyGoalMinutes: ONBOARDING_OPTIONS.times.includes(parsed.dailyGoalMinutes!) ? parsed.dailyGoalMinutes! : defaults.dailyGoalMinutes,
      temporalObjective: ONBOARDING_OPTIONS.temporalObjectives.includes(parsed.temporalObjective!) ? parsed.temporalObjective! : defaults.temporalObjective,
      interests: Array.isArray(parsed.interests) ? parsed.interests.filter(value => ONBOARDING_OPTIONS.interests.includes(value)) : [],
      correctionMode: ['immediate', 'discreet', 'final'].includes(parsed.correctionMode!) ? parsed.correctionMode! : defaults.correctionMode,
      romanianHelp: parsed.romanianHelp === 'putina' ? 'putina' : 'multa',
      aiSpeed: ['lent', 'normal', 'provocare'].includes(parsed.aiSpeed!) ? parsed.aiSpeed! : defaults.aiSpeed,
    };
  } catch {
    return null;
  }
}

export function clearOnboardingDraft(): void {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(SHORT_PROGRESS_KEY);
}

export function hasKnownAccount(): boolean {
  return storage.getItem(KNOWN_ACCOUNT_KEY) === 'true';
}

export function markKnownAccount(): void {
  storage.setItem(KNOWN_ACCOUNT_KEY, 'true');
}

/** Persistat per cont: protejează utilizatorii existenți dacă un profil vechi pierde
 * accidental flag-ul `onboarded` după migrare/update. */
export function hasCompletedOnboardingLocally(uid: string): boolean {
  return storage.getItem(`${COMPLETED_KEY_PREFIX}${uid}`) === 'true';
}

export function markOnboardingCompleted(uid: string): void {
  storage.setItem(`${COMPLETED_KEY_PREFIX}${uid}`, 'true');
}

/** Handoff-ul se păstrează până când navigatorul este montat, separat pentru fiecare cont. */
export function markFirstLessonPending(uid: string): void {
  storage.setItem(`${FIRST_LESSON_KEY_PREFIX}${uid}`, 'true');
}

export function hasFirstLessonPending(uid: string): boolean {
  return storage.getItem(`${FIRST_LESSON_KEY_PREFIX}${uid}`) === 'true';
}

export function clearFirstLessonPending(uid: string): void {
  storage.removeItem(`${FIRST_LESSON_KEY_PREFIX}${uid}`);
}

/** Profilurile create înainte de introducerea flag-ului `onboarded` au deja date
 * imposibil de obținut din profilul implicit. Aceste semnale permit migrarea lor
 * fără să sară onboarding-ul pentru un cont cu adevărat nou. */
export function hasOnboardingCompletionEvidence(profile: Partial<Profile>): boolean {
  return profile.onboarded === true
    || profile.testDone === true
    || (profile.xp ?? 0) > 0
    || Boolean(profile.interests?.length)
    || Boolean(profile.topProblems?.length)
    || Boolean(profile.recommendedPlanRo?.trim());
}
