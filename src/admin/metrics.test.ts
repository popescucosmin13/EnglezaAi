import { describe, expect, it } from 'vitest';
import { calendarDay, csvCell, shiftDay, summarize, usersCsv } from './metrics';
import type { AdminUser } from './types';

const row = (activity: AdminUser['activity']): AdminUser => ({ uid: 'u1', profile: {}, auth: null, totals: null, activity, errors: [], warnings: [] });
describe('admin reporting windows', () => {
  it('compares exactly seven calendar days including today with the preceding seven days', () => {
    const data = summarize([row([{ date: '2026-09-09', sessionCount: 2, speakingSec: 100 }, { date: '2026-09-03', sessionCount: 1, speakingSec: 60 }, { date: '2026-09-02', sessionCount: 8, speakingSec: 500 }, { date: '2026-08-27', sessionCount: 1 }, { date: '2026-08-26', sessionCount: 50 }, { date: '2026-09-10', sessionCount: 50 }])], 7, '2026-09-09');
    expect(data.series).toHaveLength(7);
    expect(data.series[0].date).toBe('2026-09-03');
    expect(data.sessions).toBe(3);
    expect(data.speakingSec).toBe(160);
    expect(data.previousSessions).toBe(9);
    expect(data.active).toBe(1);
    expect(data.previousActive).toBe(1);
  });
  it('counts distinct users, excludes empty activity and fills missing dates with zero', () => {
    const result = summarize([row([{ date: '2026-09-08', xp: 10 }, { date: '2026-09-09', lessonDone: true }]), row([{ date: '2026-09-09', sessionCount: 0 }]), row([{ date: '2026-09-09', appActiveSec: 30 }])], 7, '2026-09-09');
    expect(result.active).toBe(2);
    expect(result.series[6].active).toBe(2);
    expect(result.series[0].active).toBe(0);
    expect(result.lessons).toBe(1);
  });
  it('uses Bucharest dates across midnight and daylight saving changes', () => {
    expect(calendarDay(new Date('2026-09-08T22:30:00Z'))).toBe('2026-09-09');
    expect(shiftDay('2026-03-30', -1)).toBe('2026-03-29');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('deduplicates same-user days and keeps unknown lifetime totals blank in export', () => {
    const user = row([{ date: '2026-09-09', sessionCount: 1 }, { date: '2026-09-09', sessionCount: 1 }]);
    expect(summarize([user], 7, '2026-09-09').sessions).toBe(1);
    expect(usersCsv([user])).toContain('"Necunoscut"');
    expect(usersCsv([user]).startsWith('\uFEFF')).toBe(true);
  });
});
describe('CSV export safety', () => {
  it.each(['=HYPERLINK("https://example.com")', '+SUM(1,2)', '-1+1', '@SUM(1,2)', '  =1+1', '\tformula'])('neutralizes formula-like user input: %s', value => {
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  });
  it('escapes quotes, commas and newlines without modifying ordinary email addresses', () => {
    expect(csvCell('name@example.com')).toBe('"name@example.com"');
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
});
