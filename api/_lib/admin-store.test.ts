import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ set: vi.fn(), updateAudit: vi.fn(), updateUser: vi.fn(), revoke: vi.fn(), database: vi.fn() }));
vi.mock('./auth.js', () => ({ hasFirebaseServiceAccount: () => true, isAdminUid: (uid: string) => uid === 'administrator', getAdminAuth: () => ({ updateUser: mocks.updateUser, revokeRefreshTokens: mocks.revoke }) }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: mocks.database, AggregateField: {}, FieldPath: {} }));
import { runAudited, setAdminAccountStatus } from './admin-store';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.database.mockReturnValue({ collection: () => ({ doc: () => ({ set: mocks.set, update: mocks.updateAudit }) }) });
  mocks.set.mockResolvedValue(undefined); mocks.updateAudit.mockResolvedValue(undefined); mocks.updateUser.mockResolvedValue(undefined); mocks.revoke.mockResolvedValue(undefined);
});
describe('sensitive account actions', () => {
  it('prevents suspension of self and other administrators before touching storage or Auth', async () => {
    await expect(setAdminAccountStatus('self', { uid: 'self', disabled: true })).rejects.toThrow();
    await expect(setAdminAccountStatus('self', { uid: 'administrator', disabled: true })).rejects.toThrow();
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('records an intent before suspending and revokes refresh tokens afterwards', async () => {
    const sequence: string[] = [];
    mocks.set.mockImplementation(async () => { sequence.push('audit'); });
    mocks.updateUser.mockImplementation(async () => { sequence.push('disable'); });
    mocks.revoke.mockImplementation(async () => { sequence.push('revoke'); });
    await setAdminAccountStatus('administrator', { uid: 'user', disabled: true });
    expect(sequence).toEqual(['audit', 'disable', 'revoke']);
    expect(mocks.updateUser).toHaveBeenCalledWith('user', { disabled: true });
    expect(mocks.updateAudit).toHaveBeenCalledWith({ status: 'completed' });
  });
  it('does not execute a sensitive operation if its audit intent cannot be stored', async () => {
    mocks.set.mockRejectedValue(new Error('Storage unavailable'));
    await expect(setAdminAccountStatus('administrator', { uid: 'user', disabled: true })).rejects.toThrow('Storage unavailable');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it('records failed provider operations and never claims success', async () => {
    await expect(runAudited('administrator', 'grant-pro', 'user', {}, async () => { throw new Error('Provider failed'); })).rejects.toThrow('Provider failed');
    expect(mocks.updateAudit).toHaveBeenCalledWith({ status: 'failed' });
  });
});
