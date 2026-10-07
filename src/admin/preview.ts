import type { AdminPage, AdminUser, AdminUserDetail, BackendStatus } from './types';
import { calendarDay, shiftDay } from './metrics';

// Only imported dynamically behind import.meta.env.DEV. Never a fallback for live data.
export function previewPage(days: number): AdminPage {
  const today = calendarDay(new Date());
  const names = ['Andrei Popa', 'Maria Ionescu', 'Alex Dumitru', 'Ioana Marin', 'Radu Stan', 'Elena Dinu', 'Mihai Rusu', 'Diana Pavel', 'Vlad Matei', 'Ana Tudor', 'Cristian Oprea', 'Bianca Luca'];
  const users: AdminUser[] = Array.from({ length: 36 }, (_, i) => {
    const displayName = names[i % names.length];
    const email = `${displayName.toLowerCase().replace(' ', '.')}${i > 11 ? i : ''}@example.com`;
    return {
      uid: `demo-user-${i + 1}`, auth: { email, displayName, disabled: i === 7, emailVerified: i % 11 !== 0, createdAt: `${shiftDay(today, -i * 2)}T10:00:00Z`, lastSignInAt: `${shiftDay(today, -i % 10)}T10:00:00Z`, providers: ['password'] },
      profile: { email, currentLevel: (['A1', 'A2', 'B1', 'B2', 'B1', 'A2'] as const)[i % 6], targetLevel: 'C1', onboarded: i % 9 !== 0, testDone: i % 7 !== 0, xp: 370 + i * 120, streak: i % 16, dailyGoalMinutes: 15, mainObjective: 'Engleză pentru carieră și conversații', correctionMode: 'final', lastActiveDay: shiftDay(today, -(i % 10)), scores: { grammar: 45 + i, conversation: 60 + i % 25, listening: 50 + i, vocabulary: 55 + i, pronunciation: 65 + i % 20 } },
      commerce: { status: i === 35 ? 'unavailable' : 'linked', isPro: i === 35 ? null : i % 4 === 0, expiresAt: i % 4 === 0 ? Date.now() + 20 * 86400000 : null, platform: i === 35 ? null : (['ios', 'android', 'web'] as const)[i % 3], appVersion: i === 35 ? '' : i % 3 === 0 ? '1.1.2' : '1.1.1', osVersion: i % 3 === 0 ? '18.6' : '15', country: i % 6 ? 'RO' : 'GB', lastSeenAt: new Date().toISOString() },
      totals: { sessions: 14 + i * 3, speakingSec: 8200 + i * 790, mistakes: 8 + i % 14, vocab: 45 + i * 9 },
      activity: Array.from({ length: days * 2 }, (_, j) => ({ date: shiftDay(today, -j), appActiveSec: 500 + i * 17, sessionCount: 1 + (j + i) % 2, speakingSec: 220 + i * 12, vocabReviews: 3 + i % 12, pronPhrases: i % 4, xp: 35 + i, lessonDone: i % 3 === 0 })).filter((_, j) => (i + j) % (j > days ? 5 : 3) === 0 && i < 31),
      errors: i % 11 === 0 ? [{ id: `demo-error-${i}`, uid: `demo-user-${i + 1}`, email, at: `${shiftDay(today, -(i % 4))}T09:34:00Z`, message: i ? 'Redarea audio a fost întreruptă de dispozitiv.' : 'Răspunsul serviciului de transcriere a depășit timpul de așteptare.', source: 'manual', page: i ? '#/practice' : '#/session', version: '1.1.0', resolved: i === 33 }] : [], warnings: [],
    };
  });
  return { users, totalUsers: users.length, nextCursor: null, days, today, generatedAt: new Date().toISOString() };
}
export function previewDetail(): AdminUserDetail {
  return { sessions: Array.from({ length: 5 }, (_, i) => ({ id: `session-${i}`, startedAt: new Date(Date.now() - i * 86400000).toISOString(), type: i % 2 ? 'free' : 'daily', userSpeakingSec: 320 + i * 40, wordCount: 260 + i * 32, errorCount: i + 1, reportStatus: 'ready' })), mistakes: [{ id: 'mistake-demo', original: 'I have 28 years.', corrected: 'I am 28 years old.', category: 'unnatural_phrasing', status: 'learning', occurrenceCount: 3 }], vocab: [{ id: 'word-demo', text: 'make progress', translation: 'a face progrese', status: 'active' }], collections: [{ name: 'lessons', count: 18 }, { name: 'tests', count: 2 }, { name: 'pron', count: 47 }, { name: 'reports', count: 4 }] };
}
export const previewStatus: BackendStatus = { services: { openrouter: true, googleAi: true, azure: true, grammar: true, revenueCat: true, mailjet: true, firebaseEmailLinks: true }, server: { firebaseProjectId: 'englezaai-demo', azureRegion: 'eastus', grammarEndpoint: 'grammar.example.com', uidRestricted: false, subscriptionEnforcement: true, appUrl: 'example.com' } };
