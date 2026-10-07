// Shim de platformă (web): același API sincron ca mobile/src/storage.ts, peste localStorage.
// Există ca fișierele de logică partajate (db, ai-usage, pron) să fie IDENTICE între web și nativ.

export async function initStorage(): Promise<void> {
  // pe web localStorage e deja sincron — nimic de preîncărcat
}

export function isStorageReady(): boolean {
  return true;
}

export const storage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stocare indisponibilă (private mode) — best effort */
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
