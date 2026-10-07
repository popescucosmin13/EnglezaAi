import { afterEach, describe, expect, it } from 'vitest';
import { nextQuotaResetAt, quotaDayId, quotaLimit } from './access';

const originalTimeZone = process.env.QUOTA_TIME_ZONE;
const originalFreeOpenRouter = process.env.FREE_OPENROUTER_DAILY_LIMIT;

afterEach(() => {
  if (originalTimeZone == null) delete process.env.QUOTA_TIME_ZONE;
  else process.env.QUOTA_TIME_ZONE = originalTimeZone;
  if (originalFreeOpenRouter == null) delete process.env.FREE_OPENROUTER_DAILY_LIMIT;
  else process.env.FREE_OPENROUTER_DAILY_LIMIT = originalFreeOpenRouter;
});

describe('planuri și cote zilnice', () => {
  it('ține Free mult sub limita Pro și lasă Admin nelimitat', () => {
    expect(quotaLimit('free', 'openrouter')).toBe(50);
    expect(quotaLimit('pro', 'openrouter')).toBe(500);
    expect(quotaLimit('admin', 'openrouter')).toBeNull();
  });

  it('permite ajustarea limitelor din environment fără release nou', () => {
    process.env.FREE_OPENROUTER_DAILY_LIMIT = '12';
    expect(quotaLimit('free', 'openrouter')).toBe(12);
    process.env.FREE_OPENROUTER_DAILY_LIMIT = 'invalid';
    expect(quotaLimit('free', 'openrouter')).toBe(50);
  });

  it('resetează cota la începutul următoarei zile în fusul configurat', () => {
    process.env.QUOTA_TIME_ZONE = 'UTC';
    const now = Date.parse('2026-08-18T23:30:00.000Z');
    expect(quotaDayId(now)).toContain('2026');
    expect(new Date(nextQuotaResetAt(now)).toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });
});
