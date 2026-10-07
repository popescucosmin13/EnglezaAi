import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(), ready: false,
  effect: null as null | (() => void | (() => void)),
  listener: null as null | (() => void), replace: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('react', () => ({ useEffect: (effect: () => void | (() => void)) => { mocks.effect = effect; } }));
vi.mock('expo-router', () => ({
  router: { replace: mocks.replace },
  useNavigationContainerRef: () => ({
    isReady: () => mocks.ready,
    addListener: (_event: string, listener: () => void) => { mocks.listener = listener; return mocks.unsubscribe; },
  }),
}));
vi.mock('../storage', () => ({ storage: {
  getItem: (key: string) => mocks.values.get(key) || null,
  setItem: (key: string, value: string) => mocks.values.set(key, value),
  removeItem: (key: string) => mocks.values.delete(key),
} }));
vi.mock('../db/db', () => ({ defaultProfile: vi.fn() }));
import FirstLessonNavigation from './FirstLessonNavigation';
import { hasFirstLessonPending, markFirstLessonPending } from './draft';

beforeEach(() => { vi.clearAllMocks(); mocks.values.clear(); mocks.ready = false; mocks.effect = null; mocks.listener = null; });

describe('new-account first lesson navigation', () => {
  it('waits for the native navigator, then opens the Free session once and unsubscribes', () => {
    markFirstLessonPending('new-user');
    FirstLessonNavigation({ uid: 'new-user' });
    const cleanup = mocks.effect!();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(hasFirstLessonPending('new-user')).toBe(true);
    mocks.ready = true; mocks.listener!(); mocks.listener!();
    expect(mocks.replace.mock.calls).toEqual([['/session']]);
    expect(hasFirstLessonPending('new-user')).toBe(false);
    cleanup!(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it('leaves existing and other accounts on their chosen screen', () => {
    markFirstLessonPending('different-user'); mocks.ready = true;
    FirstLessonNavigation({ uid: 'existing-user' }); mocks.effect!();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(hasFirstLessonPending('different-user')).toBe(true);
  });
});
