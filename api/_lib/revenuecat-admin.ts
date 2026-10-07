import type { AdminCommerce } from '../../src/admin/types';
import { AdminInputError } from './admin-validation.js';
import { commerceSnapshot, normalizeApp, normalizeOverview, rcNumber } from './revenuecat-normalize.js';

const REVENUECAT_API = 'https://api.revenuecat.com/v2';
const PRO_LOOKUP_KEY = process.env.REVENUECAT_PRO_ENTITLEMENT_LOOKUP_KEY || 'englezaai_pro';
let cachedProEntitlementId = '';

interface RevenueCatConfig {
  projectId: string;
  secretKey: string;
}

interface RevenueCatList<T = any> {
  items?: T[];
  next_page?: string | null;
}

class RevenueCatRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function config(): RevenueCatConfig {
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim() || '';
  const secretKey = process.env.REVENUECAT_V2_SECRET_KEY?.trim() || '';
  if (!projectId || !secretKey) {
    throw new Error('REVENUECAT_PROJECT_ID și REVENUECAT_V2_SECRET_KEY nu sunt configurate în Vercel.');
  }
  return { projectId, secretKey };
}

async function request(path: string, init: RequestInit = {}): Promise<any> {
  const { projectId, secretKey } = config();
  const response = await fetch(`${REVENUECAT_API}/projects/${encodeURIComponent(projectId)}${path}`, {
    signal: AbortSignal.timeout(6000),
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const rawDetail = data?.message || data?.error || data || `HTTP ${response.status}`;
    const detail = typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
    throw new RevenueCatRequestError(response.status, `RevenueCat Admin API: ${detail}`);
  }
  return data;
}

function isoDate(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function items(value: unknown): any[] {
  return Array.isArray((value as RevenueCatList | null)?.items) ? (value as RevenueCatList).items! : [];
}

async function customersWithAttributes(customers: any[]): Promise<{ customers: any[]; failed: number }> {
  const detailed: any[] = [];
  let failed = 0;
  const batchSize = 10;
  for (let start = 0; start < customers.length; start += batchSize) {
    const batch = customers.slice(start, start + batchSize);
    const resolved = await Promise.all(batch.map(async (customer) => {
      const customerId = String(customer?.id ?? '');
      if (!customerId) return customer;
      try {
        const detail = await request(`/customers/${encodeURIComponent(customerId)}?expand=attributes`);
        return { ...customer, ...detail };
      } catch {
        failed++;
        // Clientul poate dispărea între listare și cererea de detaliu; păstrăm
        // informațiile de bază ca să nu blocăm întregul panou Admin.
        return customer;
      }
    }));
    detailed.push(...resolved);
  }
  return { customers: detailed, failed };
}

async function requestAll(firstPath: string, maxPages = 20): Promise<RevenueCatList> {
  const collected: any[] = [];
  let path = firstPath;
  let nextPage: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await request(path);
    collected.push(...items(response));
    nextPage = typeof response?.next_page === 'string' ? response.next_page : null;
    if (!nextPage) break;
    const cursor = new URL(nextPage, 'https://api.revenuecat.com').searchParams.get('starting_after');
    if (!cursor) break;
    path = `${firstPath}${firstPath.includes('?') ? '&' : '?'}starting_after=${encodeURIComponent(cursor)}`;
  }
  return { items: collected, next_page: nextPage };
}

function nestedProduct(record: any): any | null {
  const products = items(record?.entitlements).flatMap(entitlement => items(entitlement?.products));
  return products.find((product) => product?.id === record?.product_id) ?? null;
}

function normalizeSubscription(subscription: any) {
  const product = nestedProduct(subscription);
  return {
    id: String(subscription?.id ?? ''),
    productId: String(product?.store_identifier ?? subscription?.product_id ?? ''),
    productName: String(product?.display_name ?? product?.store_identifier ?? subscription?.product_id ?? 'Abonament'),
    status: String(subscription?.status ?? 'unknown'),
    givesAccess: subscription?.gives_access === true,
    pendingPayment: subscription?.pending_payment === true,
    autoRenewalStatus: String(subscription?.auto_renewal_status ?? 'unknown'),
    startsAt: subscription?.starts_at ?? null,
    currentPeriodEndsAt: subscription?.current_period_ends_at ?? null,
    endsAt: subscription?.ends_at ?? null,
    environment: String(subscription?.environment ?? ''),
    store: String(subscription?.store ?? ''),
    country: String(subscription?.country ?? ''),
    managementUrl: typeof subscription?.management_url === 'string' ? subscription.management_url : null,
    revenueUsd: rcNumber(subscription?.total_revenue_in_usd?.gross),
  };
}

function normalizePurchase(purchase: any) {
  const product = nestedProduct(purchase);
  return {
    id: String(purchase?.id ?? ''),
    productId: String(product?.store_identifier ?? purchase?.product_id ?? ''),
    productName: String(product?.display_name ?? product?.store_identifier ?? purchase?.product_id ?? 'Achiziție'),
    status: String(purchase?.status ?? 'unknown'),
    purchasedAt: purchase?.purchased_at ?? null,
    environment: String(purchase?.environment ?? ''),
    store: String(purchase?.store ?? ''),
    country: String(purchase?.country ?? ''),
    revenueUsd: rcNumber(purchase?.revenue_in_usd?.gross),
  };
}

export function isRevenueCatAdminConfigured(): boolean {
  return Boolean(process.env.REVENUECAT_PROJECT_ID?.trim() && process.env.REVENUECAT_V2_SECRET_KEY?.trim());
}

export async function getRevenueCatDashboard(body: Record<string, unknown> = {}) {
  if (body.cursor != null && (typeof body.cursor !== 'string' || body.cursor.length > 1500 || !body.cursor.length)) throw new AdminInputError('Cursor RevenueCat invalid.');
  const [customers, entitlements, overviewResult, revenueResult, appsResult] = await Promise.all([
    body.paged === true ? request(`/customers?limit=25${body.cursor ? `&starting_after=${encodeURIComponent(String(body.cursor))}` : ''}`) : requestAll('/customers?limit=100'),
    request('/entitlements?limit=100'),
    request('/metrics/overview?currency=EUR').then((value) => ({ value, error: null })).catch((error) => ({ value: null, error: String(error?.message ?? error) })),
    request(`/metrics/revenue?start_date=${isoDate(29)}&end_date=${isoDate()}&currency=EUR&revenue_type=revenue`)
      .then((value) => ({ value, error: null }))
      .catch((error) => ({ value: null, error: String(error?.message ?? error) })),
    requestAll('/apps?limit=100', 2).then(value => ({ value, error: null })).catch(error => ({ value: null, error: String(error?.message ?? error) })),
  ]);

  const entitlementById = new Map(items(entitlements).map((entitlement) => [String(entitlement.id), entitlement]));
  // Endpoint-ul de listare nu include atributele clientului. Cerem detaliile
  // separat pentru ca atributul RevenueCat `$email` să poată fi afișat.
  const customerDetails = await customersWithAttributes(items(customers));
  const proDefinition = items(entitlements).find(e => e.lookup_key === PRO_LOOKUP_KEY);
  const normalizedCustomers = customerDetails.customers.map((customer) => {
    const snapshot = commerceSnapshot(customer, proDefinition?.id || null);
    const activeEntitlements = items(customer?.active_entitlements).map((active) => {
      const definition = entitlementById.get(String(active?.entitlement_id));
      return {
        id: String(active?.entitlement_id ?? ''),
        lookupKey: String(definition?.lookup_key ?? ''),
        displayName: String(definition?.display_name ?? definition?.lookup_key ?? 'Entitlement'),
        expiresAt: active?.expires_at ?? null,
      };
    });
    const email = items(customer?.attributes).find((attribute) => attribute?.name === '$email')?.value;
    return {
      id: String(customer?.id ?? ''),
      email: typeof email === 'string' ? email : null,
      isAnonymous: String(customer?.id ?? '').startsWith('$RCAnonymousID:'),
      firstSeenAt: customer?.first_seen_at ?? null,
      lastSeenAt: customer?.last_seen_at ?? null,
      appVersion: String(customer?.last_seen_app_version ?? ''),
      country: String(customer?.last_seen_country ?? ''),
      platform: commerceSnapshot(customer, null).platform || String(customer?.last_seen_platform ?? ''),
      platformVersion: String(customer?.last_seen_platform_version ?? ''),
      activeEntitlements,
      isPro: activeEntitlements.some((entitlement) => entitlement.lookupKey === PRO_LOOKUP_KEY),
      planKnown: snapshot.isPro !== null,
    };
  });

  return {
    configured: true,
    proLookupKey: PRO_LOOKUP_KEY,
    customers: normalizedCustomers,
    paginationPending: Boolean(customers?.next_page),
    nextCursor: customers?.next_page && items(customers).length ? String(items(customers)[items(customers).length - 1].id) : null,
    generatedAt: new Date().toISOString(),
    overview: normalizeOverview(overviewResult.value),
    apps: items(appsResult.value).map(normalizeApp),
    revenue30d: rcNumber(revenueResult.value?.value) !== null
      ? { value: revenueResult.value.value, currency: String(revenueResult.value.currency ?? 'EUR') }
      : null,
    warnings: [overviewResult.error && `Indicatori RevenueCat: ${overviewResult.error}`, revenueResult.error && `Venituri: ${revenueResult.error}`, appsResult.error && `Aplicații: ${appsResult.error}`, appsResult.value?.next_page && 'Lista aplicațiilor este parțială.', customerDetails.failed && `Detaliile pentru ${customerDetails.failed} clienți nu au putut fi citite; sunt păstrate informațiile de la listare.`, !proDefinition && `Entitlement-ul ${PRO_LOOKUP_KEY} nu a fost găsit. Starea Pro nu poate fi confirmată.`].filter(Boolean),
  };
}

export async function getRevenueCatCustomer(customerId: string) {
  const safeId = encodeURIComponent(customerId);
  const [customer, subscriptions, purchases] = await Promise.all([
    request(`/customers/${safeId}?expand=attributes`),
    requestAll(`/customers/${safeId}/subscriptions?limit=100`, 3),
    requestAll(`/customers/${safeId}/purchases?limit=100`, 3),
  ]);
  return {
    id: String(customer?.id ?? customerId),
    subscriptions: items(subscriptions).map(normalizeSubscription),
    purchases: items(purchases).map(normalizePurchase),
    historyPartial: Boolean(subscriptions.next_page || purchases.next_page),
  };
}

export async function getRevenueCatProfiles(ids: string[]): Promise<Map<string, AdminCommerce>> {
  const result = new Map<string, AdminCommerce>();
  const empty: AdminCommerce = { status: 'unavailable', isPro: null, expiresAt: null, platform: null, appVersion: '', osVersion: '', country: '', lastSeenAt: '' };
  if (!isRevenueCatAdminConfigured()) return new Map(ids.map(id => [id, { ...empty }]));
  const proId = await proEntitlementId().catch(() => null);
  for (let offset = 0; offset < ids.length; offset += 5) {
    await Promise.all(ids.slice(offset, offset + 5).map(async id => {
      try { result.set(id, commerceSnapshot(await request(`/customers/${encodeURIComponent(id)}`), proId)); }
      catch (error) { result.set(id, { ...empty, status: error instanceof RevenueCatRequestError && error.status === 404 ? 'unlinked' : 'unavailable' }); }
    }));
  }
  return result;
}

async function proEntitlementId(): Promise<string> {
  if (cachedProEntitlementId) return cachedProEntitlementId;
  const entitlements = await request('/entitlements?limit=100');
  const entitlement = items(entitlements).find((candidate) => candidate?.lookup_key === PRO_LOOKUP_KEY);
  if (!entitlement?.id) throw new Error(`Entitlement-ul RevenueCat ${PRO_LOOKUP_KEY} nu a fost găsit.`);
  cachedProEntitlementId = String(entitlement.id);
  return cachedProEntitlementId;
}

export async function hasRevenueCatPro(customerId: string): Promise<boolean> {
  const entitlementId = await proEntitlementId();
  try {
    const active = await request(`/customers/${encodeURIComponent(customerId)}/active_entitlements?limit=100`);
    return items(active).some((entitlement) => String(entitlement?.entitlement_id ?? '') === entitlementId);
  } catch (error) {
    // Conturile Free foarte noi pot ajunge la backend înainte ca SDK-ul RevenueCat să creeze customer-ul.
    if (error instanceof RevenueCatRequestError && error.status === 404) return false;
    throw error;
  }
}

export async function grantRevenueCatPro(customerId: string, expiresAt: number) {
  const entitlementId = await proEntitlementId();
  await request(`/customers/${encodeURIComponent(customerId)}/actions/grant_entitlement`, {
    method: 'POST',
    body: JSON.stringify({ entitlement_id: entitlementId, expires_at: expiresAt }),
  });
  return { ok: true, customerId, expiresAt };
}

export async function revokeRevenueCatPro(customerId: string) {
  const entitlementId = await proEntitlementId();
  await request(`/customers/${encodeURIComponent(customerId)}/actions/revoke_granted_entitlement`, {
    method: 'POST',
    body: JSON.stringify({ entitlement_id: entitlementId }),
  });
  return { ok: true, customerId };
}
