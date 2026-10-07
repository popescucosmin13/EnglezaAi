import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, hasFirebaseServiceAccount } from './_lib/auth.js';
import { allowRequestAsync } from './_lib/rate-limit.js';
import { authEmailTemplate, brandedActionUrl, type AuthEmailKind } from './_lib/auth-email-template.js';
import { hasMailjetConfig, sendMailjetMessage } from './_lib/mailjet.js';

const GENERIC_RESET_RESPONSE = { ok: true, message: 'Dacă există un cont pentru această adresă, emailul a fost trimis.' };

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

function opaqueKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function bearerToken(req: VercelRequest): string {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : '';
}

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function send(kind: AuthEmailKind, email: string): Promise<void> {
  const auth = getAdminAuth();
  const firebaseLink = kind === 'verify-email'
    ? await auth.generateEmailVerificationLink(email)
    : await auth.generatePasswordResetLink(email);
  const actionUrl = brandedActionUrl(firebaseLink, appUrl());
  const template = authEmailTemplate(kind, actionUrl);
  await sendMailjetMessage({
    to: email,
    ...template,
    customId: kind === 'verify-email' ? 'englezaai-email-verification' : 'englezaai-password-reset',
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodă neacceptată.' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const action = req.body?.action as AuthEmailKind | undefined;
  if (action !== 'verify-email' && action !== 'password-reset') {
    return res.status(400).json({ error: 'Tip de email invalid.' });
  }
  if (!hasFirebaseServiceAccount() || !hasMailjetConfig()) {
    return res.status(503).json({ error: 'Serviciul de email nu este configurat complet.' });
  }

  if (action === 'verify-email') {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'Autentificare necesară.' });
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      const email = normalizeEmail(decoded.email);
      if (!email) return res.status(400).json({ error: 'Contul nu are o adresă de email validă.' });
      if (!(await allowRequestAsync(res, decoded.uid, 'auth-email-verification', 3))) return;
      if (decoded.email_verified === true) return res.status(200).json({ ok: true, alreadyVerified: true });
      await send(action, email);
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Trimiterea verificării de email a eșuat:', error);
      return res.status(502).json({ error: 'Emailul nu a putut fi trimis momentan. Încearcă din nou.' });
    }
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Adresă de email invalidă.' });
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  const rateKey = opaqueKey(`${forwarded || 'unknown'}:${email}`);
  if (!(await allowRequestAsync(res, rateKey, 'auth-email-password-reset', 3))) return;

  // Răspunsul rămâne identic indiferent dacă adresa există, pentru a nu permite
  // enumerarea conturilor. Erorile reale rămân vizibile în logurile Vercel/Mailjet.
  try {
    await send(action, email);
  } catch (error) {
    console.error('Trimiterea resetării de parolă a eșuat:', error);
  }
  return res.status(200).json(GENERIC_RESET_RESPONSE);
}
