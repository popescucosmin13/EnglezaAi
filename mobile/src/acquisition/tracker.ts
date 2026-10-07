import { AUTHENTICATED_ACQUISITION_EVENTS, acquisitionEventKey, type AcquisitionEvent, type AcquisitionEventName, type AcquisitionError } from './model';

export interface AcquisitionState {
  id: string; seen: string[]; pending: AcquisitionEvent[]; ownerUid?: string;
}
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const ACQUISITION_STORAGE_KEY = 'englezaai.acquisition.v1';
const randomId = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')).join('');

/** Transport is injected so retries and account transitions can be verified independently. */
export function createAcquisitionTracker(storage: Storage, send: (state: AcquisitionState, events: AcquisitionEvent[]) => Promise<boolean>) {
  let sending = false;
  function read(): AcquisitionState | null {
    try {
      const value = JSON.parse(storage.getItem(ACQUISITION_STORAGE_KEY) || 'null');
      return value && /^[a-f0-9]{32}$/.test(value.id) && Array.isArray(value.seen) && Array.isArray(value.pending) ? value : null;
    } catch { return null; }
  }
  function write(state: AcquisitionState) { storage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(state)); }
  function track(name: AcquisitionEventName, code?: AcquisitionError, uid?: string) {
    const state = read();
    if (!state) return;
    const protectedEvent = (AUTHENTICATED_ACQUISITION_EVENTS as readonly string[]).includes(name);
    if (protectedEvent) {
      if (!uid || (state.ownerUid && state.ownerUid !== uid)) return;
      if (name !== 'sign_up' && state.ownerUid !== uid) return;
      state.ownerUid = uid;
    }
    const event: AcquisitionEvent = { name, ...(code ? { code } : {}) };
    const key = acquisitionEventKey(event);
    if (state.seen.includes(key)) return;
    state.seen.push(key); state.pending.push(event); write(state);
  }
  function begin() {
    if (!read()) write({ id: randomId(), seen: [], pending: [] });
    track('first_open');
  }
  async function flush() {
    if (sending) return;
    const state = read();
    if (!state?.pending.length) return;
    sending = true;
    const events = state.pending.slice(0, 24);
    try {
      if (await send(state, events)) {
        const current = read();
        if (current?.id === state.id) {
          const sent = new Set(events.map(acquisitionEventKey));
          current.pending = current.pending.filter(event => !sent.has(acquisitionEventKey(event)));
          write(current);
        }
      }
    } catch { /* Keep the queue; measurement must never block signup or learning. */ }
    finally { sending = false; }
  }
  return { begin, track, flush, read };
}
