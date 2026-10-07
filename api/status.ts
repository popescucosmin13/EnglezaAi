import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from './_lib/auth.js';

function displayUrl(raw: string | undefined, fallback: string): string {
  try {
    const url = new URL(raw || fallback);
    return `${url.hostname}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return 'configurație invalidă';
  }
}

/** Expune doar starea configurației, niciodată valorile cheilor. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metodă neacceptată.' });
  }
  if (!(await requireUser(req, res))) return;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    services: {
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      googleAi: Boolean(process.env.GOOGLE_AI_API_KEY),
      azure: Boolean(process.env.AZURE_SPEECH_KEY),
      grammar: Boolean(process.env.GRAMMAR_SERVICE_URL),
      compatibleTts: Boolean(process.env.TTS_API_KEY),
      revenueCat: Boolean(process.env.REVENUECAT_PROJECT_ID && process.env.REVENUECAT_V2_SECRET_KEY),
      mailjet: Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY && process.env.MAILJET_FROM_EMAIL),
      firebaseEmailLinks: Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
    },
    server: {
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'neconfigurat',
      azureRegion: process.env.AZURE_SPEECH_REGION || 'eastus',
      grammarEndpoint: displayUrl(process.env.GRAMMAR_SERVICE_URL, 'https://grammar.example.invalid/v2/check'),
      uidRestricted: Boolean(process.env.ALLOWED_FIREBASE_UID),
      subscriptionEnforcement: process.env.SUBSCRIPTION_ENFORCEMENT_ENABLED === 'true',
      appUrl: displayUrl(process.env.APP_URL, 'http://localhost:3000'),
    },
  });
}
