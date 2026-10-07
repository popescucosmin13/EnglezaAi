import { activeDay, calendarDay, shiftDay } from './metrics.js';
import { userClient, userPlatform, PLATFORMS } from './platforms.js';
import type { AdminUser } from './types';

export function commercialLabel(user: AdminUser): string {
  const commerce = user.commerce;
  if (commerce?.isPro === true) return 'Pro';
  if (commerce?.isPro === false) return 'Fără Pro';
  return commerce?.status === 'unlinked' ? 'Fără profil RevenueCat' : 'Plan indisponibil';
}
export function growthInsights(users: AdminUser[], days: number, today: string) {
  const start = shiftDay(today, 1 - days), previous = shiftDay(start, -days);
  const seen = (u: AdminUser, from: string, to = today) => u.activity.some(a => a.date && a.date >= from && a.date <= to && activeDay(a));
  const current = users.filter(u => seen(u, start));
  const prior = users.filter(u => seen(u, previous, shiftDay(start, -1)));
  const returning = prior.filter(u => seen(u, start)).length;
  const daily = users.filter(u => seen(u, today)).length;
  const weekly = users.filter(u => seen(u, shiftDay(today, -6))).length;
  const monthly = days >= 30 ? users.filter(u => seen(u, shiftDay(today, -29))).length : null;
  const cohorts = Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const from = shiftDay(start, i * 7), to = shiftDay(from, 6) < today ? shiftDay(from, 6) : today;
    const members = users.filter(u => {
      const at = u.auth?.createdAt;
      return at && Number.isFinite(Date.parse(at)) && calendarDay(new Date(at)) >= from && calendarDay(new Date(at)) <= to;
    });
    function retention(offset: number) {
      const eligible = members.filter(u => shiftDay(calendarDay(new Date(u.auth!.createdAt)), offset) < today);
      return { eligible: eligible.length, returned: eligible.filter(u => { const target = shiftDay(calendarDay(new Date(u.auth!.createdAt)), offset); return seen(u, target, target); }).length };
    }
    return { from, to, count: members.length, d1: retention(1), d7: retention(7) };
  }).reverse();
  return { current: current.length, prior: prior.length, returning, lost: prior.length - returning, daily, weekly, monthly, cohorts,
    platformRows: (Object.keys(PLATFORMS) as (keyof typeof PLATFORMS)[]).map(platform => {
      const members = users.filter(u => userPlatform(u) === platform);
      return { platform, label: PLATFORMS[platform], count: members.length, active: members.filter(u => seen(u, start)).length, pro: members.filter(u => u.commerce?.isPro === true).length };
    }),
  };
}
export function clientDistribution(users: AdminUser[], field: 'version' | 'country') {
  const counts = new Map<string, number>();
  for (const user of users) {
    const client = userClient(user);
    const key = field === 'version' ? `${PLATFORMS[userPlatform(user)]} · ${client.appVersion ? `v${client.appVersion}` : 'versiune neînregistrată'}` : client.country || 'Țară neînregistrată';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
