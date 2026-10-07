// EventEmitter minimal — înlocuiește window.dispatchEvent/addEventListener de pe web.

type Handler = (payload?: unknown) => void;

const listeners = new Map<string, Set<Handler>>();

export function emit(event: string, payload?: unknown): void {
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.warn(`Handler pentru „${event}" a aruncat:`, e);
    }
  });
}

/** Întoarce funcția de dezabonare (comod în useEffect). */
export function on(event: string, fn: Handler): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}
