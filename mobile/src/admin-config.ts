// Administratorii aplicației — doar aceste conturi văd Admin Center.
// UID-ul tău apare în Setări → Cont. Ține lista sincronă cu firestore.rules (funcția isAdmin)
// și cu variabila ADMIN_FIREBASE_UID din Vercel (endpoint-ul /api/admin).

export const ADMIN_UIDS = ['demo-admin-uid'];

export function isAdminUid(uid: string | null | undefined): boolean {
  return !!uid && ADMIN_UIDS.includes(uid);
}
