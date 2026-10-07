import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), isAdmin: vi.fn(), allowRequest: vi.fn(), page: vi.fn(), update: vi.fn(), detail: vi.fn(), account: vi.fn(), errors: vi.fn(), config: vi.fn(), audit: vi.fn() }));
vi.mock('./_lib/auth.js', () => ({ requireUser: mocks.requireUser, isAdminUid: mocks.isAdmin, postOnly: (req: VercelRequest, res: VercelResponse) => { if (req.method === 'POST') return true; res.status(405).json({ error: 'Method' }); return false; }, safeError: (res: VercelResponse) => res.status(502).json({ error: 'Unavailable' }) }));
vi.mock('./_lib/rate-limit.js', () => ({ allowRequestAsync: mocks.allowRequest }));
vi.mock('./_lib/access.js', () => ({ clearAccessPlanCache: vi.fn() }));
vi.mock('./_lib/revenuecat-admin.js', () => ({ getRevenueCatCustomer: vi.fn(), getRevenueCatDashboard: vi.fn(), grantRevenueCatPro: vi.fn(), revokeRevenueCatPro: vi.fn() }));
vi.mock('./_lib/admin-store.js', () => ({ getAdminPage: mocks.page, updateAdminProfile: mocks.update, getAdminUserDetail: mocks.detail, setAdminAccountStatus: mocks.account, setAdminErrorStatus: mocks.errors, saveAdminConfig: mocks.config, getAdminAudit: mocks.audit, runAudited: vi.fn() }));
vi.mock('./_lib/telemetry.js', () => ({ readTelemetry: vi.fn() }));
vi.mock('./_lib/acquisition.js', () => ({ readAcquisition: vi.fn() }));
import handler from './admin';

function response() { const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res); res.json.mockReturnValue(res); return res; }
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue('administrator'); mocks.isAdmin.mockReturnValue(true); mocks.allowRequest.mockResolvedValue(true); });
describe('admin API authorization and dispatch', () => {
  it.each(['acquisition', 'revenuecat-dashboard', 'revenuecat-customer', 'ai-telemetry', 'overview', 'user-detail', 'update-profile', 'account-status', 'error-status', 'save-config', 'audit-log', 'grant-pro', 'revoke-pro'])('denies %s to a regular authenticated user', async action => {
    mocks.isAdmin.mockReturnValue(false); const res = response();
    await handler({ method: 'POST', body: { action } } as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.page).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not read or mutate data without authentication', async () => {
    mocks.requireUser.mockResolvedValue(null); const res = response();
    await handler({ method: 'POST', body: { action: 'overview' } } as VercelRequest, res as unknown as VercelResponse);
    expect(mocks.isAdmin).not.toHaveBeenCalled(); expect(mocks.page).not.toHaveBeenCalled();
  });
  it('takes the audit actor from the verified token, never from the request body', async () => {
    const res = response(); const body = { action: 'update-profile', actor: 'forged-admin', uid: 'target', patch: { currentLevel: 'B1' } };
    await handler({ method: 'POST', body } as VercelRequest, res as unknown as VercelResponse);
    expect(mocks.update).toHaveBeenCalledWith('administrator', body);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('rejects malformed JSON with 400', async () => { const res = response(); await handler({ method: 'POST', body: '{bad' } as VercelRequest, res as unknown as VercelResponse); expect(res.status).toHaveBeenCalledWith(400); });
  it('rejects unknown actions and non-POST requests', async () => {
    const res = response(); await handler({ method: 'POST', body: { action: 'delete-everything' } } as VercelRequest, res as unknown as VercelResponse); expect(res.status).toHaveBeenCalledWith(400);
    const getRes = response(); await handler({ method: 'GET' } as VercelRequest, getRes as unknown as VercelResponse); expect(getRes.status).toHaveBeenCalledWith(405);
  });
});
