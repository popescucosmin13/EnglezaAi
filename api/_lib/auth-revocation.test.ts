import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const verify = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn(), cert: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: verify }) }));
import { requireUser } from './auth';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('suspended and revoked account access', () => {
  it('always asks Firebase to check revocation and disabled status', async () => {
    vi.stubEnv('ALLOWED_FIREBASE_UID', ''); verify.mockResolvedValue({ uid: 'user', email_verified: true });
    const res = { status: vi.fn(), json: vi.fn() };
    expect(await requireUser({ headers: { authorization: 'Bearer token' } } as VercelRequest, res as unknown as VercelResponse)).toBe('user');
    expect(verify).toHaveBeenCalledWith('token', true);
  });
  it('rejects tokens invalidated by suspension', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    verify.mockRejectedValue(new Error('auth/user-disabled'));
    const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    expect(await requireUser({ headers: { authorization: 'Bearer revoked-token' } } as VercelRequest, res as unknown as VercelResponse)).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
