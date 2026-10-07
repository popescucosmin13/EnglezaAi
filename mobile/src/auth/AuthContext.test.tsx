import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
const mocks = vi.hoisted(() => ({
  create: vi.fn(), track: vi.fn(), fetch: vi.fn(), setDoc: vi.fn(),
  user: { uid: 'new-user', email: 'test@example.com', getIdToken: vi.fn().mockResolvedValue('test-token') },
}));
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.create, onAuthStateChanged: vi.fn(() => vi.fn()),
  signInWithEmailAndPassword: vi.fn(), deleteUser: vi.fn(), EmailAuthProvider: { credential: vi.fn() },
  getIdToken: vi.fn(), reauthenticateWithCredential: vi.fn(), reload: vi.fn(), signOut: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => 'profile'), serverTimestamp: vi.fn(() => 'timestamp'), setDoc: mocks.setDoc }));
vi.mock('../firebase', () => ({ auth: { currentUser: mocks.user }, db: {} }));
vi.mock('../db/db', () => ({ wipeAll: vi.fn() }));
vi.mock('./client-observation', () => ({ clientObservation: () => ({}) }));
vi.mock('../acquisition/client', () => ({ trackAcquisition: mocks.track, forgetAcquisition: vi.fn() }));
import { AuthProvider, useAuth } from './AuthContext';
let value: ReturnType<typeof useAuth>;
function Capture() { value = useAuth(); return null; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.create.mockResolvedValue({ user: mocks.user }); mocks.setDoc.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.fetch); renderToString(<AuthProvider><Capture /></AuthProvider>);
});
describe('new-account confirmation delivery', () => {
  it('keeps a created account usable for verification retry when email delivery fails', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Email unavailable' }) });
    await expect(value.signUp('test@example.com', 'validpassword', { termsVersion: 'v1', privacyVersion: 'v1' })).resolves.toBeUndefined();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.track.mock.calls).toEqual([['sign_up'], ['signup_error', 'email_delivery']]);
  });
  it('records successful account creation only after Firebase succeeds', async () => {
    mocks.create.mockRejectedValue({ code: 'auth/email-already-in-use' });
    await expect(value.signUp('test@example.com', 'validpassword', { termsVersion: 'v1', privacyVersion: 'v1' })).rejects.toMatchObject({ code: 'auth/email-already-in-use' });
    expect(mocks.track).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
