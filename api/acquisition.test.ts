import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), record: vi.fn(), forget: vi.fn(), rate: vi.fn() }));
vi.mock('./_lib/auth.js', () => ({ getAdminAuth: () => ({ verifyIdToken: mocks.verify }), postOnly: (req: any, res: any) => { if (req.method === 'POST') return true; res.status(405).json({}); return false; } }));
vi.mock('./_lib/rate-limit.js', () => ({ allowRequestAsync: mocks.rate }));
vi.mock('./_lib/acquisition.js', async importOriginal => ({ ...(await importOriginal<object>()), recordAcquisition: mocks.record, forgetAcquisition: mocks.forget }));
import handler from './acquisition';
const body = { journeyId: 'a'.repeat(32), platform: 'android', version: '1.1.4', events: [{ name: 'first_open' }] };
function response() { const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res); return res; }
async function invoke(events = body.events, authorization?: string) {
  const res = response();
  await handler({ method: 'POST', body: { ...body, events }, headers: authorization ? { authorization } : {} } as VercelRequest, res as unknown as VercelResponse);
  return res;
}
beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockResolvedValue(true); mocks.verify.mockResolvedValue({ uid: 'actual-user', email_verified: false }); mocks.record.mockResolvedValue(undefined); });
describe('acquisition endpoint', () => {
  it('accepts anonymous opening measurements without exposing account data', async () => {
    const res = await invoke(); expect(res.status).toHaveBeenCalledWith(200); expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.record).toHaveBeenCalledWith(body, null);
  });
  it('requires a real token for signup, while permitting an unverified new account', async () => {
    expect((await invoke([{ name: 'sign_up' }])).status).toHaveBeenCalledWith(401);
    const res = await invoke([{ name: 'first_open' }, { name: 'sign_up' }], 'Bearer real-token');
    expect(res.status).toHaveBeenCalledWith(200); expect(mocks.verify).toHaveBeenCalledWith('real-token', true); expect(mocks.record.mock.calls[0][1]).toBe('actual-user');
  });
  it('rejects forged verification and lessons from an unverified account', async () => {
    for (const name of ['email_verified', 'lesson_started']) expect((await invoke([{ name }], 'Bearer token')).status).toHaveBeenCalledWith(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('respects rate limiting and fails clearly when persistence is unavailable', async () => {
    mocks.rate.mockResolvedValue(false); await invoke(); expect(mocks.record).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValue(true); mocks.record.mockRejectedValue(new Error('offline'));
    expect((await invoke()).status).toHaveBeenCalledWith(503);
  });
  it('derives the deletion target from the token and supports deletion from web', async () => {
    const res = response();
    await handler({ method: 'POST', body: { action: 'forget' }, headers: { authorization: 'Bearer token' } } as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.forget).toHaveBeenCalledWith(undefined, 'actual-user');
    const denied = response();
    await handler({ method: 'POST', body: { action: 'forget', uid: 'another-user' }, headers: { authorization: 'Bearer token' } } as VercelRequest, denied as unknown as VercelResponse);
    expect(denied.status).toHaveBeenCalledWith(400);
  });
});
