import { describe, expect, it } from 'vitest';
import { growthInsights, commercialLabel } from './insights';
import { userClient, userPlatform } from './platforms';
import { normalizeAdminProfile } from '../../api/_lib/admin-normalize';
import type { AdminCommerce, AdminUser } from './types';

const row = (createdAt: string, activity: AdminUser['activity'] = []): AdminUser => ({ uid: createdAt, profile: {}, auth: { email: '', displayName: '', disabled: false, emailVerified: true, createdAt, lastSignInAt: '', providers: [] }, totals: null, activity, errors: [], warnings: [] });
const commerce: AdminCommerce = { status: 'linked', isPro: true, expiresAt: null, platform: 'ios', appVersion: '1.1.2', osVersion: '18', country: 'RO', lastSeenAt: '2026-09-16T12:00:00.000Z' };
describe('super admin platform recovery', () => {
  it('identifies old iOS clients through RevenueCat without changing their profile', () => {
    const user = { ...row('2026-09-01'), commerce };
    expect(userPlatform(user)).toBe('ios');
    expect(userClient(user)).toMatchObject({ source: 'revenuecat', appVersion: '1.1.2' });
    expect(user.profile.lastPlatform).toBeUndefined();
  });
  it('selects the most recent dated observation and does not mix versions across devices', () => {
    const user = { ...row('2026-09-01'), profile: { lastPlatform: 'web' as const, lastSeenAt: '2026-09-16T13:00:00.000Z', appVersion: 'web-42' }, commerce };
    expect(userClient(user)).toMatchObject({ platform: 'web', appVersion: 'web-42', osVersion: '' });
    user.profile.lastSeenAt = '2026-09-15T12:00:00.000Z';
    expect(userClient(user)).toMatchObject({ platform: 'ios', appVersion: '1.1.2', source: 'revenuecat' });
  });
  it('normalizes iOS variants and Firestore timestamps; refuses invented platforms', () => {
    expect(normalizeAdminProfile({ lastPlatform: 'iOS', lastSeenAt: { toDate: () => new Date('2026-09-16T12:00:00Z') } })).toMatchObject({ lastPlatform: 'ios', lastSeenAt: '2026-09-16T12:00:00.000Z' });
    expect(userPlatform({ ...row('2026-09-01'), profile: normalizeAdminProfile({ lastPlatform: 'macos' }) })).toBe('unknown');
    expect(commercialLabel(row('2026-09-01'))).toBe('Plan indisponibil');
  });
});
describe('growth cohorts and returning activity', () => {
  it('uses completed target days for D1/D7 and excludes immature cohorts from denominators', () => {
    const users = [row('2026-09-01T12:00:00Z', [{ date: '2026-09-02', sessionCount: 1 }, { date: '2026-09-08', vocabReviews: 1 }]), row('2026-09-09T12:00:00Z', [{ date: '2026-09-16', sessionCount: 1 }])];
    const result = growthInsights(users, 30, '2026-09-16');
    expect(result.cohorts.reduce((sum, c) => sum + c.d7.eligible, 0)).toBe(1);
    expect(result.cohorts.reduce((sum, c) => sum + c.d7.returned, 0)).toBe(1);
    expect(result.cohorts.reduce((sum, c) => sum + c.d1.eligible, 0)).toBe(2);
  });
  it('counts a user once per window and does not mistake an empty day for activity', () => {
    const a = row('2026-08-01', [{ date: '2026-09-05', sessionCount: 1 }, { date: '2026-09-16', lessonDone: true }, { date: '2026-09-16', lessonDone: true }]);
    const b = row('2026-08-02', [{ date: '2026-09-04', xp: 1 }, { date: '2026-09-16', sessionCount: 0 }]);
    expect(growthInsights([a, b], 7, '2026-09-16')).toMatchObject({ current: 1, prior: 2, returning: 1, lost: 1, daily: 1, weekly: 1, monthly: null });
  });
  it('assigns near-midnight registrations to the Bucharest cohort', () => {
    const result = growthInsights([row('2026-09-15T22:30:00Z')], 7, '2026-09-16');
    expect(result.cohorts[0].count).toBe(1);
    expect(result.cohorts[0].d1.eligible).toBe(0);
  });
});
