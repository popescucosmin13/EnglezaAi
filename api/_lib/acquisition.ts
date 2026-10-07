import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getAdminAuth, hasFirebaseServiceAccount } from './auth.js';
import { calendarDay, shiftDay } from '../../src/admin/metrics.js';
import { validDays } from './admin-validation.js';
import { ACQUISITION_EVENTS, ACQUISITION_ERRORS, ACQUISITION_FLOW, acquisitionEventKey, type AcquisitionEvent, type AcquisitionBucket, type AcquisitionReport } from '../../src/acquisition/model.js';

export interface AcquisitionBatch { journeyId: string; platform: AcquisitionBucket['platform']; version: string; events: AcquisitionEvent[] }
export function parseAcquisitionBatch(value: unknown): AcquisitionBatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.journeyId !== 'string' || !/^[a-f0-9]{32}$/.test(body.journeyId)
    || !['android', 'ios', 'web'].includes(String(body.platform))
    || typeof body.version !== 'string' || !/^[a-zA-Z0-9.+_-]{1,32}$/.test(body.version)
    || !Array.isArray(body.events) || !body.events.length || body.events.length > 24) return null;
  const events: AcquisitionEvent[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const event = raw as AcquisitionEvent;
    if (!ACQUISITION_EVENTS.includes(event.name) || Object.keys(raw).some(key => !['name', 'code'].includes(key))) return null;
    if (event.name === 'signup_error' ? !ACQUISITION_ERRORS.includes(event.code!) : event.code !== undefined) return null;
    events.push({ name: event.name, ...(event.code ? { code: event.code } : {}) });
  }
  if (Object.keys(body).some(key => !['journeyId', 'platform', 'version', 'events'].includes(key))) return null;
  return { journeyId: body.journeyId, platform: body.platform as AcquisitionBucket['platform'], version: body.version, events };
}

/** One count per installation and milestone, including when requests retry or race.
 * Daily totals belong to the first-open cohort, even when signup happens later. */
export async function recordAcquisition(batch: AcquisitionBatch, uid: string | null): Promise<void> {
  if (!hasFirebaseServiceAccount()) throw new Error('Firebase telemetry unavailable');
  getAdminAuth();
  const fs = getFirestore();
  const ref = fs.collection('acquisitionJourneys').doc(batch.journeyId);
  await fs.runTransaction(async transaction => {
    const [snapshot, deletion] = await Promise.all([
      transaction.get(ref), uid ? transaction.get(fs.collection('acquisitionDeletedAccounts').doc(createHash('sha256').update(uid).digest('hex'))) : Promise.resolve(null),
    ]);
    if (deletion?.data()?.deleted === true) return;
    const previous = snapshot.data();
    if (previous?.forgotten === true) return;
    if (!previous && !batch.events.some(event => event.name === 'first_open')) throw new Error('Acquisition journey missing');
    if (previous && (previous.platform !== batch.platform || (previous.uid && uid && previous.uid !== uid))) throw new Error('Acquisition journey mismatch');
    const date = previous?.date || calendarDay(new Date());
    const seen: Record<string, boolean> = { ...previous?.seen };
    const counts: Record<string, unknown> = {}, errors: Record<string, unknown> = {};
    for (const event of batch.events) {
      const key = acquisitionEventKey(event);
      if (seen[key]) continue;
      seen[key] = true;
      if (event.name === 'signup_error') {
        errors[event.code!] = FieldValue.increment(1);
        if (!seen.signup_error) counts.signup_error = FieldValue.increment(1);
        seen.signup_error = true;
      } else counts[event.name] = FieldValue.increment(1);
    }
    if (!Object.keys(counts).length && !Object.keys(errors).length) return;
    transaction.set(ref, {
      date, platform: batch.platform, version: previous?.version || batch.version, flow: ACQUISITION_FLOW,
      seen, ...(uid ? { uid } : {}), updatedAt: FieldValue.serverTimestamp(),
      ...(!previous ? { createdAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
    transaction.set(fs.collection('acquisitionDaily').doc(`${date}_${batch.platform}_${ACQUISITION_FLOW}`), {
      date, platform: batch.platform, flow: ACQUISITION_FLOW,
      ...(Object.keys(counts).length ? { counts } : {}),
      ...(Object.keys(errors).length ? { errors } : {}), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function readAcquisition(body: Record<string, unknown>): Promise<AcquisitionReport> {
  const days = validDays(body.days ?? 30);
  const to = calendarDay(new Date()), from = shiftDay(to, 1 - days);
  if (!hasFirebaseServiceAccount()) throw new Error('Firebase telemetry unavailable');
  getAdminAuth();
  // At most 90 days × 3 platforms. No user pagination or compound index required.
  const snapshot = await getFirestore().collection('acquisitionDaily').where('date', '>=', from).where('date', '<=', to).get();
  const buckets = snapshot.docs.filter(doc => doc.get('flow') === ACQUISITION_FLOW).map(doc => {
    const data = doc.data();
    const pick = (keys: readonly string[], values: Record<string, unknown> = {}) => Object.fromEntries(keys.map(key => [key, typeof values[key] === 'number' && Number.isFinite(values[key]) ? Math.max(0, values[key] as number) : 0]));
    return { date: data.date, platform: data.platform, counts: pick(ACQUISITION_EVENTS, data.counts), errors: pick(ACQUISITION_ERRORS, data.errors) } as AcquisitionBucket;
  });
  return { from, to, flow: ACQUISITION_FLOW, buckets };
}

/** Remove the account association on deletion. The tombstone also prevents a late
 * queued request from restoring personal data; daily counts remain anonymous. */
export async function forgetAcquisition(journeyId: string | undefined, uid: string): Promise<void> {
  getAdminAuth();
  const fs = getFirestore();
  if (journeyId) {
    const ref = fs.collection('acquisitionJourneys').doc(journeyId);
    await fs.runTransaction(async transaction => {
      const previous = (await transaction.get(ref)).data();
      if (previous?.uid && previous.uid !== uid) throw new Error('Acquisition journey mismatch');
      transaction.set(ref, { forgotten: true, uid: FieldValue.delete() }, { merge: true });
    });
  }
  // A hash-only suppression marker protects against in-flight events verified just
  // before deletion. It contains no UID or link to a journey and exposes no report data.
  await fs.collection('acquisitionDeletedAccounts').doc(createHash('sha256').update(uid).digest('hex')).set({ deleted: true });
  for (;;) {
    const snapshot = await fs.collection('acquisitionJourneys').where('uid', '==', uid).limit(100).get();
    if (snapshot.empty) break;
    const batch = fs.batch();
    for (const doc of snapshot.docs) batch.set(doc.ref, { forgotten: true, uid: FieldValue.delete() }, { merge: true });
    await batch.commit();
  }
}
