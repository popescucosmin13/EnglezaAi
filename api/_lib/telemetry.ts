import { createHash } from 'node:crypto';
import { FieldValue, FieldPath, getFirestore } from 'firebase-admin/firestore';
import { getAdminAuth, hasFirebaseServiceAccount } from './auth.js';
import { calendarDay, shiftDay } from '../../src/admin/metrics.js';
import { AdminInputError, validDays } from './admin-validation.js';
import type { TelemetryBucket, TelemetryPage } from '../../src/admin/telemetry';
import { JEV_MODEL } from './jev-router.js';

interface Measurement {
  uid: string; feature: string; model: string; startedAt: number; durationMs: number; failed: boolean;
  usage?: unknown;
}
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown) => nonnegative(value) ? value : 0;
export function normalizeMeasurement(event: Measurement) {
  const usage = event.usage && typeof event.usage === 'object' ? event.usage as Record<string, any> : {};
  const date = calendarDay(new Date(event.startedAt));
  const feature = /^[a-z0-9_-]{1,64}$/i.test(event.feature) ? event.feature : 'unknown';
  const model = event.model.slice(0, 200);
  const id = `${date}_${createHash('sha256').update(JSON.stringify([event.uid, feature, model])).digest('hex')}`;
  return {
    id, uid: event.uid, date, feature, model,
    requests: 1, errors: event.failed ? 1 : 0,
    promptTokens: count(usage.prompt_tokens), completionTokens: count(usage.completion_tokens),
    totalTokens: nonnegative(usage.total_tokens) ? usage.total_tokens : count(usage.prompt_tokens) + count(usage.completion_tokens),
    cachedTokens: count(usage.prompt_tokens_details?.cached_tokens),
    costUsd: count(usage.cost), costReported: nonnegative(usage.cost) ? 1 : 0,
    tokensReported: nonnegative(usage.total_tokens) || (nonnegative(usage.prompt_tokens) && nonnegative(usage.completion_tokens)) ? 1 : 0,
    durationMs: count(event.durationMs),
  };
}

/** Awaited before the response finishes: serverless execution must not drop background writes.
 * No prompts, transcripts, audio, client-provided UID or provider errors are persisted.
 * Failed writes are logged and never turn a successful AI answer into a client retry.
 */
export async function recordTelemetry(event: Measurement): Promise<void> {
  try {
    if (!hasFirebaseServiceAccount()) throw new Error('Firebase service account unavailable');
    getAdminAuth();
    const { id, uid, date, feature, model, ...metrics } = normalizeMeasurement(event);
    await getFirestore().collection('adminTelemetry').doc(id).set({
      uid, date, feature, model,
      ...Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, FieldValue.increment(value)])),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {
    console.error('Admin telemetry write failed; measurement missing', { uid: event.uid, feature: event.feature });
  }
}

export async function readTelemetry(body: Record<string, unknown>): Promise<TelemetryPage> {
  const days = validDays(body.days ?? 30);
  const to = calendarDay(new Date()), from = shiftDay(to, 1 - days);
  if (!hasFirebaseServiceAccount()) throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY nu este configurat pentru telemetrie.');
  const auth = getAdminAuth();
  let query = getFirestore().collection('adminTelemetry').where('date', '>=', from).where('date', '<=', to).orderBy('date').orderBy(FieldPath.documentId()).limit(501);
  if (body.cursor != null) {
    const cursor = body.cursor as { date?: unknown; id?: unknown };
    if (!cursor || typeof cursor.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.date) || cursor.date < from || cursor.date > to || typeof cursor.id !== 'string' || !/^\d{4}-\d{2}-\d{2}_[a-f0-9]{64}$/.test(cursor.id)) throw new AdminInputError('Cursor de telemetrie invalid.');
    query = query.startAfter(cursor.date, cursor.id);
  }
  const snap = await query.get();
  const docs = snap.docs.slice(0, 500);
  const uids = [...new Set(docs.map(d => String(d.get('uid'))))];
  const emails = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 100) {
    const result = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })));
    for (const user of result.users) emails.set(user.uid, user.email || '');
  }
  return {
    buckets: docs.map(d => ({ ...d.data(), id: d.id, email: emails.get(d.get('uid')) || '' } as TelemetryBucket)),
    nextCursor: snap.size > 500 ? { date: docs[499].get('date'), id: docs[499].id } : null,
    from, to,
    router: { mode: process.env.JEV_ROUTER_MODE === 'shadow' ? 'shadow' : 'off', keyConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()), model: JEV_MODEL },
  };
}
