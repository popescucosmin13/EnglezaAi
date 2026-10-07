import { describe, expect, it } from 'vitest';
import { platformStats } from './platforms';
import { normalizeAdminProfile } from '../../api/_lib/admin-normalize';
import { usersCsv } from './metrics';
import type { AdminUser } from './types';
const user = (value?: unknown): AdminUser => ({ uid: 'u', profile: normalizeAdminProfile({ lastPlatform: value }), auth: null, totals: null, activity: [], errors: [], warnings: [] });
describe('admin platform reporting', () => {
  it('counts every account once, retaining missing and invalid platforms as unknown', () => {
    const stats = platformStats([user('android'), user('android'), user('ios'), user('web'), user(), user('windows')]);
    expect(stats.map(s => s.value)).toEqual([2, 1, 1, 2]);
    expect(stats.reduce((sum, s) => sum + s.value, 0)).toBe(6);
  });
  it('includes the observed platform in CSV exports', () => {
    expect(usersCsv([user('ios')])).toContain('"iOS"');
    expect(usersCsv([user()])).toContain('"Necunoscută"');
  });
});
