// Error tracking minimalist: erorile neprinse (window.onerror, promise rejections, React
// ErrorBoundary) sunt salvate în Firestore (users/{uid}/errors/{id}) ca să poată fi revăzute
// ulterior din Admin sau din consolă. Fără serviciu extern, fără date personale în payload
// (doar mesajul erorii + pagina + versiunea aplicației).

import { collection, doc, setDoc } from 'firebase/firestore';
import { db as fs } from '../firebase';
import { getCurrentUid } from '../auth/uid';

declare const __APP_VERSION__: string | undefined;

const FLUSH_INTERVAL_MS = 15_000;
const MAX_QUEUE = 20;
const MAX_STORED_PER_FLUSH = 10;

interface ClientError {
  id: string;
  at: string; // ISO
  message: string;
  stack?: string;
  source: 'window.onerror' | 'unhandledrejection' | 'react-boundary' | 'manual';
  page: string;
  version: string;
  userAgent: string;
}

const queue: ClientError[] = [];
let installed = false;
let flushing = false;

function version(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  } catch {
    return 'dev';
  }
}

function enqueue(err: Omit<ClientError, 'id' | 'at' | 'page' | 'version' | 'userAgent'>): void {
  const entry: ClientError = {
    ...err,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    page: window.location.hash || window.location.pathname,
    version: version(),
    userAgent: navigator.userAgent.slice(0, 200),
    message: String(err.message).slice(0, 1000),
    stack: err.stack?.slice(0, 2000),
  };
  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.shift(); // pierdem cea mai veche — nu blocăm aplicația pentru logging
}

/** Scrie erorile din coadă în Firestore (best-effort; eșecurile se reîncearcă la următorul flush). */
export async function flushErrors(): Promise<void> {
  if (flushing || queue.length === 0) return;
  const uid = getCurrentUid();
  if (!uid) return; // fără utilizator autentificat nu avem unde scrie
  flushing = true;
  const batch = queue.splice(0, MAX_STORED_PER_FLUSH);
  try {
    await Promise.all(
      batch.map((e) => setDoc(doc(collection(fs, 'users', uid, 'errors'), e.id), e))
    );
  } catch {
    // offline / reguli încă nepublicate — punem erorile înapoi în coadă pentru următorul flush
    queue.unshift(...batch);
  } finally {
    flushing = false;
  }
}

/** Raportare manuală pentru erori prinse și tratate, dar demne de atenție. */
export function reportError(error: unknown, source: ClientError['source'] = 'manual'): void {
  const err = error instanceof Error ? error : new Error(String(error));
  enqueue({ message: err.message, stack: err.stack, source });
}

/** Instalează handler-ele globale o singură dată (apelat din main.tsx). */
export function initErrorTracking(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    enqueue({
      message: event.message || 'Eroare necunoscută',
      stack: event.error instanceof Error ? event.error.stack : undefined,
      source: 'window.onerror',
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    enqueue({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandledrejection',
    });
  });

  window.setInterval(() => void flushErrors(), FLUSH_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushErrors();
  });
}
