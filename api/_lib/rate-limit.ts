import type { VercelResponse } from '@vercel/node';

/**
 * Rate limiting pe două niveluri:
 *
 * 1. **Upstash Redis (REST)** — dacă UPSTASH_REDIS_REST_URL/TOKEN sunt configurate, contoarele
 *    sunt distribuite: limita se aplică corect indiferent de câte instanțe serverless rulează.
 *    Folosim API-ul REST direct (fără dependință nouă): INCR + EXPIRE pe o cheie per minut.
 *
 * 2. **Fallback local** — fără Upstash, comportamentul rămâne cel vechi (best-effort per
 *    instanță), dar bucket-urile expirate sunt curățate periodic ca să nu crească map-ul
 *    nelimitat în instanțele long-lived. ALLOWED_FIREBASE_UID rămâne protecția principală.
 */

const WINDOW_MS = 60_000;
const SWEEP_AFTER = 500; // după atâtea chei, trecerea curentă mai șterge din cele expirate
const MAX_BUCKETS = 5000; // plafon absolut — evacuăm cele mai vechi dacă se depășește

const buckets = new Map<string, { startedAt: number; count: number }>();

function sweep(now: number): void {
  if (buckets.size < SWEEP_AFTER) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(key);
  }
  if (buckets.size <= MAX_BUCKETS) return;
  // Evacuare de urgență (cele mai vechi primele — Map păstrează ordinea inserării).
  const overflow = buckets.size - MAX_BUCKETS;
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    if (++removed >= overflow) break;
  }
}

function allowLocal(uid: string, route: string, maxPerMinute: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const key = `${route}:${uid}`;
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.delete(key); // re-inserare la final, ca ordinea de evacuare să fie proaspătă
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count <= maxPerMinute) return { allowed: true, retryAfterSec: 0 };
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1000)) };
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function allowUpstash(uid: string, route: string, maxPerMinute: number): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const { url, token } = upstashConfig()!;
  const windowId = Math.floor(Date.now() / WINDOW_MS);
  const key = `rl:${route}:${uid}:${windowId}`;
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, 70], // fereastra + marjă; cheia moare singură, fără curățare manuală
    ]),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const data = (await res.json()) as { result?: unknown }[];
  const count = Number(data?.[0]?.result ?? 1);
  if (count <= maxPerMinute) return { allowed: true, retryAfterSec: 0 };
  const retryAfterSec = Math.max(1, WINDOW_MS / 1000 - Math.floor((Date.now() % WINDOW_MS) / 1000));
  return { allowed: false, retryAfterSec };
}

function reject(res: VercelResponse, retryAfterSec: number): boolean {
  res.setHeader('Retry-After', retryAfterSec);
  res.status(429).json({ error: 'Prea multe cereri. Încearcă din nou peste câteva secunde.' });
  return false;
}

/** Varianta sincronă (compatibilitate) — doar limitarea locală. */
export function allowRequest(res: VercelResponse, uid: string, route: string, maxPerMinute: number): boolean {
  const verdict = allowLocal(uid, route, maxPerMinute);
  return verdict.allowed ? true : reject(res, verdict.retryAfterSec);
}

/** Varianta async: Upstash dacă e configurat, cu cădere pe local dacă Redis nu răspunde. */
export async function allowRequestAsync(res: VercelResponse, uid: string, route: string, maxPerMinute: number): Promise<boolean> {
  if (!upstashConfig()) return allowRequest(res, uid, route, maxPerMinute);
  try {
    const verdict = await allowUpstash(uid, route, maxPerMinute);
    return verdict.allowed ? true : reject(res, verdict.retryAfterSec);
  } catch (error) {
    // Redis picat/rate-limitat pe el însuși — nu blocăm aplicația, cădem pe limitarea locală.
    console.warn('Rate limiting distribuit indisponibil, folosesc contorul local:', error);
    return allowRequest(res, uid, route, maxPerMinute);
  }
}
