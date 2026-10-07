import { describe, expect, it, vi } from 'vitest';
import { createAcquisitionTracker } from './tracker';

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe('acquisition queue', () => {
  it('keeps one installation and one milestone across restarts and failed requests', async () => {
    const storage = memoryStorage(), send = vi.fn().mockResolvedValue(false);
    const first = createAcquisitionTracker(storage, send);
    first.begin(); first.begin(); first.track('objective_selected'); first.track('objective_selected');
    const id = first.read()!.id;
    await first.flush();
    const restarted = createAcquisitionTracker(storage, send);
    restarted.begin();
    expect(restarted.read()!.id).toBe(id);
    expect(restarted.read()!.pending.map(event => event.name)).toEqual(['first_open', 'objective_selected']);
    send.mockResolvedValue(true); await restarted.flush();
    expect(restarted.read()!.pending).toEqual([]);
    restarted.track('objective_selected'); expect(restarted.read()!.pending).toEqual([]);
  });
  it('does not lose events added while another batch is being sent', async () => {
    let finish!: (ok: boolean) => void;
    const send = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const tracker = createAcquisitionTracker(memoryStorage(), send);
    tracker.begin(); const flushing = tracker.flush();
    tracker.track('level_selected'); await tracker.flush();
    expect(send).toHaveBeenCalledTimes(1);
    finish(true); await flushing;
    expect(tracker.read()!.pending).toEqual([{ name: 'level_selected' }]);
  });
  it('does not attribute an existing or different account to a new signup', () => {
    const tracker = createAcquisitionTracker(memoryStorage(), vi.fn());
    tracker.track('lesson_started', undefined, 'existing'); expect(tracker.read()).toBeNull();
    tracker.begin(); tracker.track('email_verified', undefined, 'existing');
    expect(tracker.read()!.seen).not.toContain('email_verified');
    tracker.track('sign_up', undefined, 'new'); tracker.track('email_verified', undefined, 'new');
    tracker.track('lesson_started', undefined, 'other');
    expect(tracker.read()!.seen).toEqual(['first_open', 'sign_up', 'email_verified']);
    expect(tracker.read()!.ownerUid).toBe('new');
  });
  it('counts an error cause once even after repeated failed attempts', () => {
    const tracker = createAcquisitionTracker(memoryStorage(), vi.fn());
    tracker.begin(); tracker.track('signup_error', 'network'); tracker.track('signup_error', 'network'); tracker.track('signup_error', 'email_in_use');
    expect(tracker.read()!.pending.filter(event => event.name === 'signup_error')).toHaveLength(2);
  });
});
