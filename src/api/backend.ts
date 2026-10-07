import { auth } from '../firebase';
import { API_BASE } from './api-base';

export type ServerAccessPlan = 'free' | 'pro' | 'admin';

export interface ServerQuotaUsage {
  route: 'openrouter' | 'tts' | 'azure' | 'grammar';
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface ServerAccessInfo {
  plan: ServerAccessPlan;
  isPro: boolean;
  enforcementEnabled: boolean;
  resetAt: string;
  usage: ServerQuotaUsage[];
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

/**
 * Fetch către backend-ul propriu. Tokenul Firebase dovedește că cererea vine de la utilizatorul autentificat.
 * Fără un `signal` propriu al apelantului, cererea primește un plafon implicit de 60s —
 * niciun serviciu agățat (STT, TTS, LanguageTool) nu are voie să blocheze UI-ul minute în șir.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesiunea a expirat. Autentifică-te din nou.');

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let signal = init.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  if (!signal) {
    const controller = new AbortController();
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, 60_000);
    signal = controller.signal;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/${path.replace(/^\//, '')}`, { ...init, headers, signal });
  } catch {
    if (timedOut) throw new Error('Răspunsul durează mai mult decât de obicei. Încearcă din nou.');
    throw new Error('Nu ne-am putut conecta. Verifică internetul și încearcă din nou.');
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401) throw new Error('Sesiunea nu mai este validă. Autentifică-te din nou.');
  return response;
}

export async function apiError(response: Response, service: string, revealTechnical = false): Promise<Error> {
  let message = '';
  let code: string | undefined;
  try {
    const data = await response.json();
    message = typeof data?.error === 'string' ? data.error : '';
    code = typeof data?.code === 'string' ? data.code : undefined;
  } catch {
    message = (await response.text().catch(() => '')).slice(0, 300);
  }
  if (revealTechnical) {
    return new BackendApiError(message || `${service} a răspuns cu eroarea ${response.status}.`, response.status, code);
  }

  let friendlyMessage = 'Nu am putut finaliza acțiunea. Încearcă din nou.';
  if (response.status === 403 || code === 'PRO_FEATURE_REQUIRED') {
    friendlyMessage = 'Această funcție este disponibilă cu planul Pro.';
  } else if (response.status === 429 || code === 'DAILY_QUOTA_EXCEEDED') {
    friendlyMessage = 'Ai ajuns la limita de utilizare pentru astăzi. Poți continua mâine.';
  } else if (response.status >= 500) {
    friendlyMessage = 'Funcția este temporar indisponibilă. Încearcă din nou puțin mai târziu.';
  }
  return new BackendApiError(friendlyMessage, response.status, code);
}

/** Starea autoritativă a planului și consumului, inclusiv accesul Pro acordat manual din Admin. */
export async function getServerAccessInfo(): Promise<ServerAccessInfo> {
  const response = await apiFetch('access');
  if (!response.ok) throw await apiError(response, 'Acces');
  return response.json() as Promise<ServerAccessInfo>;
}
