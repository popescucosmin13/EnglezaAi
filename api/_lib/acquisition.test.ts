import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ documents: new Map<string, any>(), now: new Date('2026-09-28T12:00:00Z') }));
vi.mock('./auth.js', () => ({ getAdminAuth: vi.fn(), hasFirebaseServiceAccount: () => true }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (value: number) => ({ increment: value }), serverTimestamp: () => 'timestamp', delete: () => 'deleted' },
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, set: async (value: any) => mocks.documents.set(`${name}/${id}`, value) }),
      where: (_field: string, _operation: string, uid: string) => ({ limit: () => ({ get: async () => {
        const docs = [...mocks.documents.entries()].filter(([path, value]) => path.startsWith(`${name}/`) && value.uid === uid).map(([path]) => ({ ref: { path } }));
        return { docs, empty: !docs.length };
      } }) }),
    }),
    batch: () => {
      const writes: [any, any][] = [];
      return { set: (ref: any, value: any) => writes.push([ref, value]), commit: async () => {
        for (const [ref, value] of writes) { const next = { ...mocks.documents.get(ref.path), ...value }; if (next.uid === 'deleted') delete next.uid; mocks.documents.set(ref.path, next); }
      } };
    },
    runTransaction: async (callback: (transaction: any) => Promise<void>) => callback({
      get: async (ref: { path: string }) => ({ data: () => mocks.documents.get(ref.path) }),
      set: (document: { path: string }, value: any) => {
        const ref = document.path;
        const previous = mocks.documents.get(ref) || {};
        const next = { ...previous, ...value };
        if (next.uid === 'deleted') delete next.uid;
        for (const key of ['counts', 'errors']) if (value[key]) {
          next[key] = Object.keys(value[key]).length ? { ...previous[key] } : {};
          for (const [field, amount] of Object.entries(value[key])) next[key][field] = (next[key][field] || 0) + (amount as any).increment;
        }
        mocks.documents.set(ref, next);
      },
    }),
  }),
}));
import { forgetAcquisition, parseAcquisitionBatch, recordAcquisition } from './acquisition';
const batch = { journeyId: 'a'.repeat(32), platform: 'android' as const, version: '1.1.4', events: [{ name: 'first_open' as const }] };
beforeEach(() => { mocks.documents.clear(); vi.useFakeTimers(); vi.setSystemTime(mocks.now); });
afterEach(() => vi.useRealTimers());
describe('acquisition measurements', () => {
  it('rejects arbitrary events, personal fields, malformed IDs and oversized batches', () => {
    expect(parseAcquisitionBatch(batch)).toEqual(batch);
    for (const invalid of [{ ...batch, email: 'private@example.com' }, { ...batch, journeyId: '../users' }, { ...batch, events: [{ name: 'purchase' }] }, { ...batch, events: [{ name: 'signup_error', code: 'private@example.com' }] }, { ...batch, events: [{ name: 'first_open', password: 'secret' }] }, { ...batch, events: Array(25).fill(batch.events[0]) }]) expect(parseAcquisitionBatch(invalid)).toBeNull();
  });
  it('deduplicates retries and multiple error codes without inflating affected installations', async () => {
    const events = [...batch.events, { name: 'signup_error' as const, code: 'network' as const }, { name: 'signup_error' as const, code: 'email_in_use' as const }];
    await recordAcquisition({ ...batch, events }, null); await recordAcquisition({ ...batch, events }, null);
    const daily = mocks.documents.get('acquisitionDaily/2026-09-28_android_short-v1');
    expect(daily.counts).toEqual({ first_open: 1, signup_error: 1 });
    expect(daily.errors).toEqual({ network: 1, email_in_use: 1 });
    await recordAcquisition({ ...batch, events: [{ name: 'signup_view' }] }, null);
    expect(mocks.documents.get('acquisitionDaily/2026-09-28_android_short-v1').errors).toEqual({ network: 1, email_in_use: 1 });
  });
  it('removes account associations and ignores late requests after account deletion', async () => {
    const signup = { ...batch, events: [...batch.events, { name: 'sign_up' as const }] };
    await recordAcquisition(signup, 'new-user');
    await expect(forgetAcquisition(batch.journeyId, 'other-user')).rejects.toThrow('mismatch');
    await forgetAcquisition(batch.journeyId, 'new-user');
    await recordAcquisition({ ...batch, events: [{ name: 'email_verified' }] }, 'new-user');
    expect(mocks.documents.get(`acquisitionJourneys/${batch.journeyId}`).uid).toBeUndefined();
    expect(mocks.documents.get('acquisitionDaily/2026-09-28_android_short-v1').counts).toEqual({ first_open: 1, sign_up: 1 });
  });
  it('also deletes associations from another device through web account deletion', async () => {
    const signup = { ...batch, events: [...batch.events, { name: 'sign_up' as const }] };
    await recordAcquisition(signup, 'new-user');
    await recordAcquisition({ ...signup, journeyId: 'b'.repeat(32) }, 'new-user');
    await forgetAcquisition(undefined, 'new-user');
    expect([...mocks.documents.values()].some(value => value.uid === 'new-user')).toBe(false);
    await recordAcquisition({ ...signup, journeyId: 'c'.repeat(32) }, 'new-user');
    expect(mocks.documents.has(`acquisitionJourneys/${'c'.repeat(32)}`)).toBe(false);
  });
  it('keeps next-day signup in the original opening cohort and rejects account reassignment', async () => {
    await recordAcquisition(batch, null); vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
    const signup = { ...batch, events: [{ name: 'sign_up' as const }] };
    await recordAcquisition(signup, 'new-user');
    expect(mocks.documents.get('acquisitionDaily/2026-09-28_android_short-v1').counts.sign_up).toBe(1);
    expect(mocks.documents.has('acquisitionDaily/2026-09-29_android_short-v1')).toBe(false);
    await expect(recordAcquisition(signup, 'other-user')).rejects.toThrow('mismatch');
  });
});
