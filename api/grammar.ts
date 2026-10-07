import type { VercelRequest, VercelResponse } from '@vercel/node';
import { postOnly, safeError } from './_lib/auth.js';
import { requireAiAccess } from './_lib/access.js';
import { allowRequestAsync } from './_lib/rate-limit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!postOnly(req, res)) return;
  const access = await requireAiAccess(req, res, 'grammar');
  if (!access || !(await allowRequestAsync(res, access.uid, 'grammar', 60))) return;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const language = typeof req.body?.language === 'string' ? req.body.language : 'en-US';
  if (!text || text.length > 20_000) return res.status(400).json({ error: 'Textul trebuie să aibă între 1 și 20.000 de caractere.' });

  const url = process.env.GRAMMAR_SERVICE_URL || 'https://grammar.example.invalid/v2/check';
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ language, text }).toString(),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error('Grammar upstream error', upstream.status, data);
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: upstream.status === 429 ? 'Limita serviciului de gramatică a fost atinsă.' : 'Serviciul de gramatică a răspuns cu eroare.' });
    }
    return res.status(200).json(data);
  } catch (error) {
    return safeError(res, 'Serviciul de gramatică', error);
  }
}
