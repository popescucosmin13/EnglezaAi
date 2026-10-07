import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ set: vi.fn(), increment: vi.fn((n: number) => ({ increment: n })), collection: vi.fn(), doc: vi.fn() }));
vi.mock('./auth.js', () => ({ hasFirebaseServiceAccount: () => true, getAdminAuth: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { increment: mocks.increment, serverTimestamp: () => 'server-time' }, FieldPath: {}, getFirestore: () => ({ collection: mocks.collection }) }));
import { normalizeMeasurement, recordTelemetry } from './telemetry';
import { summarizeJev, telemetryByUser, telemetryTotals, type TelemetryBucket } from '../../src/admin/telemetry';
const event = { uid: 'verified-user', feature: 'chat', model: 'provider/model.v1', startedAt: Date.parse('2026-09-08T22:00:00Z'), durationMs: 123, failed: false };
beforeEach(() => { vi.clearAllMocks(); mocks.collection.mockReturnValue({ doc: mocks.doc }); mocks.doc.mockReturnValue({ set: mocks.set }); mocks.set.mockResolvedValue(undefined); });
describe('server user telemetry', () => {
  it('uses the Bucharest calendar day and isolates users and models in safe document IDs', () => {
    const row = normalizeMeasurement(event);
    expect(row.date).toBe('2026-09-09'); expect(row.id).toMatch(/^2026-09-09_[a-f0-9]{64}$/);
    expect(normalizeMeasurement({ ...event, uid: 'another' }).id).not.toBe(row.id);
    expect(normalizeMeasurement({ ...event, model: 'other' }).id).not.toBe(row.id);
    expect(normalizeMeasurement({ ...event, durationMs: 999 }).id).toBe(row.id);
  });
  it('distinguishes a reported zero cost from missing, malformed or negative cost', () => {
    expect(normalizeMeasurement(event)).toMatchObject({ costUsd: 0, costReported: 0, tokensReported: 0 });
    expect(normalizeMeasurement({ ...event, usage: { cost: 0, total_tokens: 0 } })).toMatchObject({ costUsd: 0, costReported: 1, tokensReported: 1 });
    expect(normalizeMeasurement({ ...event, usage: { cost: -1, total_tokens: Infinity } })).toMatchObject({ costUsd: 0, costReported: 0, tokensReported: 0 });
  });
  it('stores only numeric usage and technical labels, with no prompts or content', async () => {
    await recordTelemetry({ ...event, usage: { prompt_tokens: 10, completion_tokens: 5, cost: .002, prompt_tokens_details: { cached_tokens: 4 }, content: 'secret conversation' } });
    expect(mocks.collection).toHaveBeenCalledWith('adminTelemetry');
    const stored = mocks.set.mock.calls[0][0];
    expect(stored.uid).toBe('verified-user'); expect(stored.totalTokens).toEqual({ increment: 15 }); expect(stored.requests).toEqual({ increment: 1 });
    expect(JSON.stringify(stored)).not.toContain('secret');
    expect(mocks.set.mock.calls[0][1]).toEqual({ merge: true });
  });
  it('does not cause an AI retry when telemetry storage fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.set.mockRejectedValue(new Error('Firestore unavailable'));
    await expect(recordTelemetry(event)).resolves.toBeUndefined(); expect(log).toHaveBeenCalled(); log.mockRestore();
  });
  it('aggregates the same user across dates and functions without mixing another user', () => {
    const a = { ...normalizeMeasurement({ ...event, usage: { cost: .1, total_tokens: 100 } }), email: 'a@example.com' } as TelemetryBucket;
    const b = { ...a, id: 'second', date: '2026-09-08', feature: 'translate' };
    const c = { ...a, uid: 'other', id: 'third', errors: 1, costReported: 0, costUsd: 0 };
    expect(telemetryByUser([a, b, c])[0]).toMatchObject({ uid: event.uid, requests: 2, totalTokens: 200, costUsd: .2, durationMs: 246 });
    expect(telemetryTotals([a, b, c])).toMatchObject({ requests: 3, errors: 1, costReported: 2 });
  });
  it('separates Jev recommendations and costs from the original analysis calls', () => {
    const row = (feature: string, requests: number, costUsd: number, errors = 0) => ({
      ...normalizeMeasurement({ ...event, feature }), feature, requests, errors, costUsd, costReported: requests,
    }) as TelemetryBucket;
    const summary = summarizeJev([
      row('turn_analysis', 4, 0.04),
      row('batch_analysis', 2, 0.03),
      row('jev_shadow_turn_analysis_utility', 3, 0.00003),
      row('jev_shadow_turn_analysis_premium', 1, 0.00001),
      row('jev_shadow_batch_analysis_error', 1, 0, 1),
      row('conversation_turn_daily', 6, 0.2),
    ]);
    expect(summary.analysisCalls).toMatchObject({ requests: 6, costUsd: 0.07 });
    expect(summary.attempts).toMatchObject({ requests: 5, errors: 1 });
    expect(summary.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: 'turn_analysis', route: 'utility', requests: 3 }),
      expect.objectContaining({ task: 'batch_analysis', route: 'error', requests: 1 }),
    ]));
  });
});
