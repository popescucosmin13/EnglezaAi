import type { DailyActivity, Profile } from '../../src/types';
import type { AdminUser } from '../../src/admin/types';
import { normalizePlatform } from '../../src/admin/platforms.js';

const numeric = (value: unknown, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

/** User-owned Firestore documents may come from old clients or contain invalid fields. */
export function normalizeAdminProfile(data: Record<string, unknown>): AdminUser['profile'] {
  const result: AdminUser['profile'] = {
    email: text(data.email, 254), onboarded: data.onboarded === true, testDone: data.testDone === true,
    xp: numeric(data.xp), streak: numeric(data.streak), lastActiveDay: day(data.lastActiveDay), startDate: day(data.startDate),
    mainObjective: text(data.mainObjective), dailyGoalMinutes: numeric(data.dailyGoalMinutes, 120),
    interests: Array.isArray(data.interests) ? data.interests.filter((v): v is string => typeof v === 'string').slice(0, 30).map(v => v.slice(0, 100)) : [],
  };
  const platform = normalizePlatform(data.lastPlatform);
  if (platform) result.lastPlatform = platform;
  for (const key of ['appVersion', 'appBuild', 'osVersion'] as const) result[key] = text(data[key], 60);
  const seen = data.lastSeenAt;
  const seenDate = typeof seen === 'string' ? new Date(seen) : seen && typeof (seen as { toDate?: unknown }).toDate === 'function' ? (seen as { toDate(): Date }).toDate() : null;
  if (seenDate && Number.isFinite(seenDate.getTime())) result.lastSeenAt = seenDate.toISOString();
  for (const key of ['currentLevel', 'targetLevel'] as const) {
    if (typeof data[key] === 'string' && ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(data[key])) result[key] = data[key] as Profile[typeof key];
  }
  if (typeof data.correctionMode === 'string' && ['discreet', 'immediate', 'final'].includes(data.correctionMode)) result.correctionMode = data.correctionMode as Profile['correctionMode'];
  if (data.scores && typeof data.scores === 'object' && !Array.isArray(data.scores)) {
    const scores = data.scores as Record<string, unknown>;
    result.scores = Object.fromEntries(Object.entries(scores).filter(([key, value]) => ['conversation', 'grammar', 'pronunciation', 'vocabulary', 'listening'].includes(key) && typeof value === 'number' && Number.isFinite(value)).map(([key, value]) => [key, numeric(value, 100)]));
  }
  return result;
}
export function normalizeAdminActivity(data: Record<string, unknown>): Partial<DailyActivity> {
  const result: Record<string, number | boolean | string> = { date: day(data.date) };
  for (const key of ['speakingSec', 'appActiveSec', 'sessionCount', 'vocabReviews', 'pronPhrases', 'shadowPhrases', 'expressionsUsed', 'sentencesRepeated', 'xp']) result[key] = numeric(data[key]);
  for (const key of ['lessonDone', 'testDone', 'noRomanianConvo', 'oldMistakeFixed', 'noHelpConvo']) result[key] = data[key] === true;
  return result;
}
