// Shim de platformă (nativ): backend-ul Vercel e pe alt origin decât aplicația,
// deci URL-ul absolut vine din env. Perechea web: src/api/api-base.ts.

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
