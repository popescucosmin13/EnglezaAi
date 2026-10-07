import { normalizePlatform } from '../../src/admin/platforms.js';
import type { AdminCommerce } from '../../src/admin/types';

export const rcItems = (value: any): any[] => Array.isArray(value?.items) ? value.items : [];
export const rcNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const rcTimestamp = (value: unknown): number | null => {
  const n = rcNumber(value);
  return n !== null && n > 0 && Number.isFinite(new Date(n).getTime()) ? n : null;
};
export function commerceSnapshot(customer: any, proId: string | null): AdminCommerce {
  const active = rcItems(customer?.active_entitlements);
  const pro = proId ? active.find(e => e?.entitlement_id === proId) : null;
  const seen = rcTimestamp(customer?.last_seen_at);
  return {
    status: 'linked', isPro: pro ? true : !proId || !Array.isArray(customer?.active_entitlements?.items) || customer?.active_entitlements?.next_page ? null : false,
    expiresAt: rcTimestamp(pro?.expires_at), platform: normalizePlatform(customer?.last_seen_platform),
    appVersion: String(customer?.last_seen_app_version || '').slice(0, 60),
    osVersion: String(customer?.last_seen_platform_version || '').slice(0, 60),
    country: String(customer?.last_seen_country || '').slice(0, 10), lastSeenAt: seen ? new Date(seen).toISOString() : '',
  };
}
export function normalizeOverview(value: any) {
  const metrics: any[] = Array.isArray(value?.metrics) ? value.metrics : [];
  return metrics.map((metric: any) => ({
    id: String(metric?.id || ''), name: String(metric?.name || metric?.id || ''),
    description: String(metric?.description || ''), value: rcNumber(metric?.value),
    unit: String(metric?.unit || ''), period: String(metric?.period || ''), updatedAt: rcTimestamp(metric?.last_updated_at),
  }));
}
export function normalizeApp(app: any) {
  // Explicit allowlist: app payloads can also contain store credentials.
  return { id: String(app?.id || ''), name: String(app?.name || ''), type: String(app?.type || ''),
    identifier: String(app?.app_store?.bundle_id || app?.play_store?.package_name || app?.mac_app_store?.bundle_id || ''),
  };
}
