import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commerceSnapshot, normalizeApp, normalizeOverview } from './revenuecat-normalize';
import { getRevenueCatDashboard, getRevenueCatProfiles, getRevenueCatCustomer } from './revenuecat-admin';

const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv('REVENUECAT_PROJECT_ID', 'project-test'); vi.stubEnv('REVENUECAT_V2_SECRET_KEY', 'server-secret'); vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const ok = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
describe('RevenueCat data quality', () => {
  it('distinguishes missing financial values from reported zero', () => {
    expect(normalizeOverview({ metrics: [{ id: 'mrr' }, { id: 'revenue', value: 0 }] }).map(m => m.value)).toEqual([null, 0]);
  });
  it('does not expose app credentials when reading the app catalog', () => {
    expect(normalizeApp({ id: 'ios', name: 'EnglezaAI', type: 'app_store', app_store: { bundle_id: 'com.example.englezaai', shared_secret: 'never-send' }, private_key: 'private' })).toEqual({ id: 'ios', name: 'EnglezaAI', type: 'app_store', identifier: 'com.example.englezaai' });
  });
  it('keeps plan unknown for incomplete entitlements, while recovering iOS', () => {
    const customer = { last_seen_platform: 'iOS', active_entitlements: { items: [], next_page: '/more' } };
    expect(commerceSnapshot(customer, 'pro')).toMatchObject({ platform: 'ios', isPro: null });
    expect(commerceSnapshot({ active_entitlements: { items: [] } }, null).isPro).toBeNull();
    expect(commerceSnapshot({ active_entitlements: { items: [] } }, 'pro').isPro).toBe(false);
  });
  it('handles not-yet-created customers separately from upstream failures', async () => {
    fetchMock.mockImplementation((url: string) => url.includes('/entitlements') ? ok({ items: [{ id: 'pro', lookup_key: 'englezaai_pro' }] }) : url.endsWith('/ios-user') ? ok({ last_seen_platform: 'ios', active_entitlements: { items: [{ entitlement_id: 'pro' }] } }) : Promise.resolve(new Response('{}', { status: url.endsWith('/absent') ? 404 : 503 })));
    const result = await getRevenueCatProfiles(['ios-user', 'absent', 'failed']);
    expect(result.get('ios-user')).toMatchObject({ platform: 'ios', isPro: true });
    expect(result.get('absent')).toMatchObject({ status: 'unlinked', isPro: null });
    expect(result.get('failed')).toMatchObject({ status: 'unavailable', isPro: null });
  });
  it('bounds paged dashboard reads, preserves cursor and tolerates unavailable financial metrics', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/metrics')) return Promise.resolve(new Response('{"message":"Permission denied"}', { status: 403 }));
      if (url.includes('/apps')) return ok({ items: [{ id: 'a', name: 'iOS', type: 'app_store', app_store: { bundle_id: 'com.example.englezaai', shared_secret: 'private' } }] });
      if (url.includes('/customers?')) return ok({ items: [{ id: 'ios-user' }], next_page: '/more' });
      if (url.includes('/customers/')) return ok({ id: 'ios-user', last_seen_platform: 'iOS' });
      return ok({ items: [{ id: 'pro', lookup_key: 'englezaai_pro' }] });
    });
    const result = await getRevenueCatDashboard({ paged: true, cursor: 'previous+id' });
    expect(result).toMatchObject({ nextCursor: 'ios-user', paginationPending: true, revenue30d: null });
    expect(result.customers[0].platform).toBe('ios');
    expect(result.customers[0].planKnown).toBe(false);
    expect(result.warnings).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=25&starting_after=previous%2Bid');
    expect(JSON.stringify(result)).not.toContain('private');
    await expect(getRevenueCatDashboard({ cursor: 42 })).rejects.toThrow('Cursor');
  });
  it('does not label missing revenue as zero or use the wrong nested product', async () => {
    fetchMock.mockImplementation((url: string) => url.includes('/subscriptions?') ? ok({ items: [{ id: 's', product_id: 'wanted', entitlements: { items: [{ products: { items: [{ id: 'different', display_name: 'Wrong' }] } }] } }] }) : ok({ items: [] }));
    const result = await getRevenueCatCustomer('user');
    expect(result.subscriptions[0]).toMatchObject({ productName: 'wanted', revenueUsd: null });
  });
});
