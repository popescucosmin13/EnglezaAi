import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminAuth, postOnly } from './_lib/auth.js';
import { allowRequestAsync } from './_lib/rate-limit.js';
import { forgetAcquisition, parseAcquisitionBatch, recordAcquisition } from './_lib/acquisition.js';
import { AUTHENTICATED_ACQUISITION_EVENTS } from '../src/acquisition/model.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!postOnly(req, res)) return;
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 128);
  const rateKey = createHash('sha256').update(ip).digest('hex');
  if (!(await allowRequestAsync(res, rateKey, 'acquisition-ip', 120))
    || !(await allowRequestAsync(res, 'all', 'acquisition-global', 3000))) return;
  let value: unknown;
  try {
    if (Number(req.headers['content-length'] || 0) > 8192 || JSON.stringify(req.body ?? '').length > 8192) return res.status(413).json({ error: 'Cerere prea mare.' });
    value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch { return res.status(400).json({ error: 'Cerere invalidă.' }); }
  if ((value as { action?: unknown } | null)?.action === 'forget') {
    const body = value as { journeyId?: unknown };
    if ((body.journeyId !== undefined && (typeof body.journeyId !== 'string' || !/^[a-f0-9]{32}$/.test(body.journeyId))) || Object.keys(body).some(key => !['action', 'journeyId'].includes(key))) return res.status(400).json({ error: 'Parcurs invalid.' });
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Autentificare necesară.' });
    let uid: string;
    try { uid = (await getAdminAuth().verifyIdToken(token, true)).uid; }
    catch { return res.status(401).json({ error: 'Token invalid.' }); }
    try { await forgetAcquisition(body.journeyId as string | undefined, uid); return res.status(200).json({ ok: true }); }
    catch { return res.status(503).json({ error: 'Ștergerea parcursului este temporar indisponibilă.' }); }
  }
  const batch = parseAcquisitionBatch(value);
  if (!batch) return res.status(400).json({ error: 'Evenimente invalide.' });
  if (!(await allowRequestAsync(res, batch.journeyId, 'acquisition-journey', 20))) return;
  const protectedEvents = batch.events.filter(event => (AUTHENTICATED_ACQUISITION_EVENTS as readonly string[]).includes(event.name));
  let uid: string | null = null;
  if (protectedEvents.length) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Autentificare necesară.' });
    try {
      const decoded = await getAdminAuth().verifyIdToken(token, true);
      if (protectedEvents.some(event => ['email_verified', 'lesson_started'].includes(event.name)) && decoded.email_verified !== true) return res.status(403).json({ error: 'Email neverificat.' });
      uid = decoded.uid;
    } catch { return res.status(401).json({ error: 'Token invalid.' }); }
  }
  try { await recordAcquisition(batch, uid); return res.status(200).json({ ok: true }); }
  catch { return res.status(503).json({ error: 'Măsurarea este temporar indisponibilă.' }); }
}
