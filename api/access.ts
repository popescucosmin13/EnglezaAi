import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAccessSnapshot } from './_lib/access.js';
import { requireUser, safeError } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodă neacceptată.' });
  }
  const uid = await requireUser(req, res);
  if (!uid) return;

  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(await getAccessSnapshot(uid));
  } catch (error) {
    return safeError(res, 'Acces', error);
  }
}
