import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAdminUid, requireUser } from './auth.js';
import { hasRevenueCatPro, isRevenueCatAdminConfigured } from './revenuecat-admin.js';

export type AccessPlan = 'free' | 'pro' | 'admin';
export type QuotaRoute = 'openrouter' | 'tts' | 'azure' | 'grammar';

export interface AccessContext {
  uid: string;
  plan: AccessPlan;
}

export interface QuotaUsage {
  route: QuotaRoute;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface AccessSnapshot {
  plan: AccessPlan;
  isPro: boolean;
  enforcementEnabled: boolean;
  resetAt: string;
  usage: QuotaUsage[];
}

const ROUTES: QuotaRoute[] = ['openrouter', 'tts', 'azure', 'grammar'];
const FREE_OPENROUTER_FEATURES = new Set([
  'conversation_turn_daily',
  'conversation_turn_leveltest',
  'speech_to_text',
  'batch_analysis',
  'level_test_evaluation',
  'microlesson_daily',
  'conversation_summary',
  'memory_update',
  'pronunciation_daily',
  'pronunciation_bank',
  'mistake_prompt_ro',
]);
const DEFAULT_DAILY_LIMITS: Record<'free' | 'pro', Record<QuotaRoute, number>> = {
  // Free oferă testul inițial și o singură sesiune zilnică de aproximativ 5 minute.
  // OpenRouter include atât STT, cât și replicile profesorului și raportul simplu.
  free: { openrouter: 50, tts: 15, azure: 5, grammar: 30 },
  // Trial folosește entitlement-ul Pro și primește aceleași limite de fair-use.
  pro: { openrouter: 500, tts: 300, azure: 100, grammar: 1000 },
};

const PLAN_CACHE = new Map<string, { plan: AccessPlan; expiresAt: number }>();
const localDailyUsage = new Map<string, number>();

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function quotaLimit(plan: AccessPlan, route: QuotaRoute): number | null {
  if (plan === 'admin') return null;
  const envName = `${plan.toUpperCase()}_${route.toUpperCase()}_DAILY_LIMIT`;
  return positiveInt(process.env[envName], DEFAULT_DAILY_LIMITS[plan][route]);
}

function quotaTimeZone(): string {
  return process.env.QUOTA_TIME_ZONE?.trim() || 'Europe/Bucharest';
}

export function quotaDayId(at = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: quotaTimeZone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/** Prima minută care aparține zilei următoare în fusul configurat (inclusiv la DST). */
export function nextQuotaResetAt(now = Date.now()): number {
  const today = quotaDayId(now);
  let low = now;
  let high = now + 30 * 60 * 60_000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (quotaDayId(mid) === today) low = mid;
    else high = mid;
  }
  return high;
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function quotaKey(uid: string, route: QuotaRoute, day = quotaDayId()): string {
  return `quota:${day}:${route}:${uid}`;
}

function sweepLocalUsage(today: string): void {
  if (localDailyUsage.size < 1000) return;
  for (const key of localDailyUsage.keys()) {
    if (!key.startsWith(`quota:${today}:`)) localDailyUsage.delete(key);
  }
}

async function upstashPipeline(commands: unknown[][]): Promise<Array<{ result?: unknown }>> {
  const cfg = upstashConfig();
  if (!cfg) throw new Error('Upstash nu este configurat.');
  const response = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!response.ok) throw new Error(`Upstash ${response.status}`);
  return response.json() as Promise<Array<{ result?: unknown }>>;
}

async function consume(uid: string, route: QuotaRoute): Promise<number> {
  const key = quotaKey(uid, route);
  if (upstashConfig()) {
    try {
      const result = await upstashPipeline([['INCR', key], ['EXPIRE', key, 172800]]);
      return Math.max(0, Number(result?.[0]?.result ?? 1));
    } catch (error) {
      console.warn('Contorizarea zilnică Upstash este indisponibilă; folosesc fallback local:', error);
    }
  }
  sweepLocalUsage(quotaDayId());
  const used = (localDailyUsage.get(key) ?? 0) + 1;
  localDailyUsage.set(key, used);
  return used;
}

async function readUsage(uid: string): Promise<Record<QuotaRoute, number>> {
  const keys = ROUTES.map((route) => quotaKey(uid, route));
  if (upstashConfig()) {
    try {
      const result = await upstashPipeline(keys.map((key) => ['GET', key]));
      return Object.fromEntries(ROUTES.map((route, index) => [route, Math.max(0, Number(result?.[index]?.result ?? 0))])) as Record<QuotaRoute, number>;
    } catch (error) {
      console.warn('Citirea cotelor Upstash este indisponibilă; folosesc fallback local:', error);
    }
  }
  return Object.fromEntries(ROUTES.map((route) => [route, localDailyUsage.get(keys[ROUTES.indexOf(route)]) ?? 0])) as Record<QuotaRoute, number>;
}

function accessPlanCacheKey(uid: string): string {
  return `access-plan:${uid}`;
}

export async function clearAccessPlanCache(uid: string): Promise<void> {
  PLAN_CACHE.delete(uid);
  if (!upstashConfig()) return;
  try {
    await upstashPipeline([['DEL', accessPlanCacheKey(uid)]]);
  } catch (error) {
    console.warn('Nu am putut invalida cache-ul distribuit al planului:', error);
  }
}

export async function resolveAccessPlan(uid: string): Promise<AccessPlan> {
  if (isAdminUid(uid)) return 'admin';
  const cached = PLAN_CACHE.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.plan;

  if (upstashConfig()) {
    try {
      const distributed = String((await upstashPipeline([['GET', accessPlanCacheKey(uid)]]))?.[0]?.result ?? '');
      if (distributed === 'free' || distributed === 'pro') {
        PLAN_CACHE.set(uid, { plan: distributed, expiresAt: Date.now() + 60_000 });
        return distributed;
      }
    } catch (error) {
      console.warn('Cache-ul distribuit al planului nu este disponibil:', error);
    }
  }

  let plan: AccessPlan = 'free';
  if (isRevenueCatAdminConfigured()) {
    try {
      plan = (await hasRevenueCatPro(uid)) ? 'pro' : 'free';
    } catch (error) {
      // Un utilizator nou/free poate să nu existe încă în RevenueCat. Nu blocăm produsul gratuit.
      console.warn('RevenueCat nu a putut confirma planul; folosesc Free pentru această verificare:', error);
    }
  }
  const ttlSec = plan === 'pro' ? 300 : 60;
  PLAN_CACHE.set(uid, { plan, expiresAt: Date.now() + ttlSec * 1000 });
  if (upstashConfig()) {
    try {
      await upstashPipeline([['SETEX', accessPlanCacheKey(uid), ttlSec, plan]]);
    } catch (error) {
      console.warn('Nu am putut scrie cache-ul distribuit al planului:', error);
    }
  }
  return plan;
}

function setQuotaHeaders(res: VercelResponse, route: QuotaRoute, used: number, limit: number | null): void {
  res.setHeader('X-EnglezaAI-Quota-Route', route);
  res.setHeader('X-EnglezaAI-Quota-Used', used);
  res.setHeader('X-EnglezaAI-Quota-Limit', limit ?? 'unlimited');
  res.setHeader('X-EnglezaAI-Quota-Remaining', limit == null ? 'unlimited' : Math.max(0, limit - used));
  res.setHeader('X-EnglezaAI-Quota-Reset', new Date(nextQuotaResetAt()).toISOString());
}

/** Autentifică, rezolvă Free/Pro/Admin și consumă atomic o unitate din cota rutei. */
export async function requireAiAccess(
  req: VercelRequest,
  res: VercelResponse,
  route: QuotaRoute,
  feature?: string
): Promise<AccessContext | null> {
  const uid = await requireUser(req, res);
  if (!uid) return null;
  const plan = await resolveAccessPlan(uid);
  const context = { uid, plan };

  if (plan === 'admin' || process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED !== 'true') {
    setQuotaHeaders(res, route, 0, null);
    return context;
  }

  if (plan === 'free' && route === 'openrouter' && !FREE_OPENROUTER_FEATURES.has(feature ?? '')) {
    res.status(403).json({
      code: 'PRO_FEATURE_REQUIRED',
      error: 'Această funcție este disponibilă numai în EnglezaAI Pro.',
      plan,
      feature: feature ?? 'unknown',
    });
    return null;
  }

  const limit = quotaLimit(plan, route)!;
  const used = await consume(uid, route);
  setQuotaHeaders(res, route, used, limit);
  if (used <= limit) return context;

  res.status(429).json({
    code: 'DAILY_QUOTA_EXCEEDED',
    error: plan === 'free'
      ? 'Ai consumat accesul Free disponibil astăzi. Revino mâine sau activează EnglezaAI Pro.'
      : 'Ai atins limita zilnică de utilizare rezonabilă. Cota se resetează automat mâine.',
    plan,
    route,
    used,
    limit,
    remaining: 0,
    resetAt: new Date(nextQuotaResetAt()).toISOString(),
  });
  return null;
}

export async function getAccessSnapshot(uid: string): Promise<AccessSnapshot> {
  const plan = await resolveAccessPlan(uid);
  const enforcementEnabled = process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true';
  const used = await readUsage(uid);
  return {
    plan,
    isPro: plan === 'pro' || plan === 'admin',
    enforcementEnabled,
    resetAt: new Date(nextQuotaResetAt()).toISOString(),
    usage: ROUTES.map((route) => {
      const limit = !enforcementEnabled || plan === 'admin' ? null : quotaLimit(plan, route);
      return {
        route,
        used: used[route],
        limit,
        remaining: limit == null ? null : Math.max(0, limit - used[route]),
      };
    }),
  };
}
