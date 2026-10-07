import type { AdminClient, AdminUser, ClientPlatform } from './types';
export const PLATFORMS = { android: 'Android', ios: 'iOS', web: 'Web', unknown: 'Necunoscută' };
export function normalizePlatform(value: unknown): ClientPlatform | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (['ios', 'ipados', 'iphone os'].includes(key)) return 'ios';
  if (key === 'android') return 'android';
  if (['web', 'web_billing'].includes(key)) return 'web';
  return null;
}
export function userClient(user: AdminUser): AdminClient {
  const profile = user.profile, rc = user.commerce;
  const native = normalizePlatform(profile.lastPlatform);
  const useRevenueCat = Boolean(rc?.platform && (!native || (rc.platform === native && !profile.lastSeenAt && !profile.appVersion) || (rc.lastSeenAt && profile.lastSeenAt && rc.lastSeenAt > profile.lastSeenAt)));
  return useRevenueCat && rc ? {
    platform: rc.platform, source: 'revenuecat', appVersion: rc.appVersion, build: '', osVersion: rc.osVersion,
    lastSeenAt: rc.lastSeenAt, country: rc.country,
  } : {
    platform: native, source: native ? 'profile' : null, appVersion: profile.appVersion || '', build: profile.appBuild || '',
    osVersion: profile.osVersion || '', lastSeenAt: profile.lastSeenAt || '', country: rc?.country || '',
  };
}
export function userPlatform(user: AdminUser): keyof typeof PLATFORMS {
  return userClient(user).platform || 'unknown';
}
export function platformStats(users: AdminUser[]) {
  return (Object.keys(PLATFORMS) as (keyof typeof PLATFORMS)[]).map(key => ({
    label: PLATFORMS[key], value: users.filter(user => userPlatform(user) === key).length,
  }));
}
