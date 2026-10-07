import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const FALLBACK_ADMIN_UIDS = ['demo-admin-uid'];
const FALLBACK_EMAIL_VERIFICATION_BYPASS_UIDS = ['demo-review-uid'];

export function isAdminUid(uid: string): boolean {
  const configured = (process.env.ADMIN_FIREBASE_UID || '').split(',').map((value) => value.trim()).filter(Boolean);
  return (configured.length ? configured : FALLBACK_ADMIN_UIDS).includes(uid);
}

export function hasEmailVerificationBypass(uid: string): boolean {
  const configured = (process.env.EMAIL_VERIFICATION_BYPASS_UIDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return (configured.length ? configured : FALLBACK_EMAIL_VERIFICATION_BYPASS_UIDS).includes(uid);
}

export function hasFirebaseServiceAccount(): boolean {
  return Boolean(
    (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID)
    && process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY
  );
}

export function getAdminAuth() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID nu este configurat în Vercel.');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
    initializeApp({
      projectId,
      ...(clientEmail && privateKey
        ? { credential: cert({ projectId, clientEmail, privateKey }) }
        : {}),
    });
  }
  return getAuth();
}

export async function requireUser(req: VercelRequest, res: VercelResponse): Promise<string | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Autentificare necesară.' });
    return null;
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    const allowedUid = process.env.ALLOWED_FIREBASE_UID?.trim();
    if (allowedUid && decoded.uid !== allowedUid) {
      res.status(403).json({ error: 'Acest cont nu are acces la API.' });
      return null;
    }
    if (decoded.email_verified !== true && !hasEmailVerificationBypass(decoded.uid)) {
      res.status(403).json({ error: 'Confirmă adresa de email înainte de a folosi aplicația.' });
      return null;
    }
    return decoded.uid;
  } catch (error) {
    console.error('Firebase token verification failed', error);
    res.status(401).json({ error: 'Token Firebase invalid sau expirat.' });
    return null;
  }
}

export function postOnly(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'POST') return true;
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: 'Metodă neacceptată.' });
  return false;
}

export function safeError(res: VercelResponse, service: string, error: unknown) {
  console.error(`${service} failed`, error);
  const message = error instanceof Error ? error.message : String(error);
  const isConfig = /nu este configurat|lipsește/i.test(message);
  res.status(isConfig ? 503 : 502).json({ error: isConfig ? message : `${service} nu este disponibil momentan.` });
}
