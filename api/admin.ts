// Endpoint doar pentru admin: starea creditelor și a cheii OpenRouter (cheia nu părăsește serverul).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAdminUid, postOnly, requireUser, safeError } from './_lib/auth.js';
import { AdminInputError } from './_lib/admin-validation.js';
import { getAdminAudit, getAdminPage, getAdminUserDetail, runAudited, saveAdminConfig, setAdminAccountStatus, setAdminErrorStatus, updateAdminProfile } from './_lib/admin-store.js';
import { clearAccessPlanCache } from './_lib/access.js';
import { readTelemetry } from './_lib/telemetry.js';
import { readAcquisition } from './_lib/acquisition.js';
import { allowRequestAsync } from './_lib/rate-limit.js';
import {
  getRevenueCatCustomer,
  getRevenueCatDashboard,
  grantRevenueCatPro,
  revokeRevenueCatPro,
} from './_lib/revenuecat-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!postOnly(req, res)) return;
  const uid = await requireUser(req, res);
  if (!uid || !(await allowRequestAsync(res, uid, 'admin', 30))) return;
  if (!isAdminUid(uid)) return res.status(403).json({ error: 'Doar administratorul are acces.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const action = typeof body?.action === 'string' ? body.action : 'openrouter';
    if (action === 'ai-telemetry') return res.status(200).json(await readTelemetry(body));
    if (action === 'acquisition') return res.status(200).json(await readAcquisition(body));

    if (action === 'overview') return res.status(200).json(await getAdminPage(body));
    if (action === 'user-detail') return res.status(200).json(await getAdminUserDetail(body.uid));
    if (action === 'update-profile') return res.status(200).json(await updateAdminProfile(uid, body));
    if (action === 'account-status') return res.status(200).json(await setAdminAccountStatus(uid, body));
    if (action === 'error-status') return res.status(200).json(await setAdminErrorStatus(uid, body));
    if (action === 'save-config') return res.status(200).json(await saveAdminConfig(uid, body));
    if (action === 'audit-log') return res.status(200).json(await getAdminAudit());

    if (action === 'revenuecat-dashboard') {
      return res.status(200).json(await getRevenueCatDashboard(body));
    }
    if (action === 'revenuecat-customer') {
      const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
      if (!customerId) return res.status(400).json({ error: 'customerId este obligatoriu.' });
      return res.status(200).json(await getRevenueCatCustomer(customerId));
    }
    if (action === 'grant-pro') {
      const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
      const expiresAt = Number(body?.expiresAt);
      if (!customerId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        return res.status(400).json({ error: 'customerId și o dată de expirare viitoare sunt obligatorii.' });
      }
      const result = await runAudited(uid, action, customerId, { expiresAt }, () => grantRevenueCatPro(customerId, expiresAt));
      await clearAccessPlanCache(customerId);
      return res.status(200).json(result);
    }
    if (action === 'revoke-pro') {
      const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
      if (!customerId) return res.status(400).json({ error: 'customerId este obligatoriu.' });
      const result = await runAudited(uid, action, customerId, {}, () => revokeRevenueCatPro(customerId));
      await clearAccessPlanCache(customerId);
      return res.status(200).json(result);
    }
    if (action !== 'openrouter') return res.status(400).json({ error: 'Acțiune admin necunoscută.' });

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return res.status(503).json({ error: 'OPENROUTER_API_KEY nu este configurat în Vercel.' });
    const headers = { Authorization: `Bearer ${key}` };
    const [keyRes, creditsRes] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/auth/key', { headers }),
      fetch('https://openrouter.ai/api/v1/credits', { headers }),
    ]);
    const keyData: any = await keyRes.json().catch(() => null);
    const creditsData: any = await creditsRes.json().catch(() => null);
    return res.status(200).json({
      key: keyRes.ok ? keyData?.data ?? null : null,
      credits: creditsRes.ok ? creditsData?.data ?? null : null,
    });
  } catch (error) {
    if (error instanceof AdminInputError || error instanceof SyntaxError) return res.status(400).json({ error: error instanceof AdminInputError ? error.message : 'Cerere JSON invalidă.' });
    // Endpoint-ul este deja protejat de UID-ul de admin. Pentru erorile RevenueCat
    // afișăm cauza exactă (permisiune, entitlement sau customer), altfel UI-ul nu
    // poate distinge un 403 upstream de o indisponibilitate temporară.
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('RevenueCat Admin API:') || message.startsWith('Entitlement-ul RevenueCat')) {
      return res.status(502).json({ error: message });
    }
    return safeError(res, 'Admin', error);
  }
}
