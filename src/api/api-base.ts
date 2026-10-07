// Shim de platformă (web): frontend-ul și functions-urile stau pe același origin Vercel,
// deci URL-urile /api/... rămân relative. Perechea nativă: mobile/src/api/api-base.ts.

export const API_BASE = '';
