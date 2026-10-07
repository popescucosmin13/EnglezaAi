// Înlocuitor sincron pentru localStorage: cache în memorie peste AsyncStorage.
// Toate cheile aplicației se preîncarcă la bootstrap (initStorage, apelat în _layout
// înaintea primei randări), apoi citirile sunt sincrone și scrierile write-through.

import AsyncStorage from '@react-native-async-storage/async-storage';

const cache = new Map<string, string>();
let ready = false;

/** Prefixele folosite de aplicație (aceleași chei ca pe web). */
const PREFIXES = ['englezaai.', 'en2'];

export async function initStorage(): Promise<void> {
  if (ready) return;
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => PREFIXES.some((p) => k.startsWith(p)));
  if (keys.length > 0) {
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [k, v] of pairs) if (v != null) cache.set(k, v);
  }
  ready = true;
}

export function isStorageReady(): boolean {
  return ready;
}

export const storage = {
  getItem(key: string): string | null {
    return cache.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    cache.set(key, value);
    AsyncStorage.setItem(key, value).catch((e) => console.warn('AsyncStorage.setItem a eșuat:', e));
  },
  removeItem(key: string): void {
    cache.delete(key);
    AsyncStorage.removeItem(key).catch((e) => console.warn('AsyncStorage.removeItem a eșuat:', e));
  },
};
