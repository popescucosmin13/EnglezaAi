import { AggregateField, FieldPath, getFirestore } from 'firebase-admin/firestore';
import type { AdminPage, AdminUser, AdminUserDetail, AuditEntry } from '../../src/admin/types';
import type { DailyActivity, Profile } from '../../src/types';
import { calendarDay, shiftDay } from '../../src/admin/metrics.js';
import { getAdminAuth, hasFirebaseServiceAccount, isAdminUid } from './auth.js';
import { AdminInputError, configPatch, profilePatch, validDays, validId } from './admin-validation.js';
import { normalizeAdminActivity, normalizeAdminProfile } from './admin-normalize.js';
import { getRevenueCatProfiles } from './revenuecat-admin.js';

function database() {
  if (!hasFirebaseServiceAccount()) throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY nu este configurat pentru administrare.');
  getAdminAuth();
  return getFirestore();
}

export async function runAudited<T>(actor: string, action: string, target: string, changes: Record<string, unknown>, operation: () => Promise<T>): Promise<T> {
  const audit = database().collection('adminAudit').doc();
  await audit.set({ actor, action, target, changes, at: new Date().toISOString(), status: 'pending' });
  try {
    const result = await operation();
    // A successful provider mutation must not be reported as failed if its audit finalization fails.
    await audit.update({ status: 'completed' }).catch(error => console.error('Admin audit finalization failed', error));
    return result;
  } catch (error) {
    await audit.update({ status: 'failed' }).catch(() => {});
    throw error;
  }
}

export async function getAdminPage(body: Record<string, unknown>): Promise<AdminPage> {
  const days = validDays(body.days ?? 30);
  const today = calendarDay(new Date());
  const start = shiftDay(today, 1 - days * 2);
  const fs = database();
  let query = fs.collection('users').orderBy(FieldPath.documentId()).limit(26);
  if (body.cursor) query = query.startAfter(validId(body.cursor, 'Cursor'));
  const [page, count] = await Promise.all([query.get(), fs.collection('users').count().get()]);
  const docs = page.docs.slice(0, 25);
  const commercePromise = getRevenueCatProfiles(docs.map(d => d.id));
  const authResult = docs.length ? await getAdminAuth().getUsers(docs.map(d => ({ uid: d.id }))) : { users: [] };
  const authById = new Map(authResult.users.map(u => [u.uid, u]));
  const users: AdminUser[] = [];
  // Bounded concurrency and cursors keep a large account from creating unbounded fan-out.
  for (let offset = 0; offset < docs.length; offset += 5) {
    const batch = await Promise.all(docs.slice(offset, offset + 5).map(async doc => {
      const data = normalizeAdminProfile(doc.data());
      const auth = authById.get(doc.id);
      const row: AdminUser = {
        uid: doc.id,
        profile: data,
        auth: auth ? { email: auth.email || '', displayName: auth.displayName || '', disabled: auth.disabled, emailVerified: auth.emailVerified, createdAt: auth.metadata.creationTime || '', lastSignInAt: auth.metadata.lastSignInTime || '', providers: auth.providerData.map(p => p.providerId) } : null,
        totals: null, activity: [], errors: [], warnings: [],
      };
      const results = await Promise.allSettled([
        Promise.all([
          doc.ref.collection('sessions').aggregate({ count: AggregateField.count(), speakingSec: AggregateField.sum('userSpeakingSec') }).get(),
          doc.ref.collection('mistakes').count().get(),
          doc.ref.collection('vocab').count().get(),
        ]).then(([sessions, mistakes, vocab]) => { row.totals = { sessions: sessions.data().count, speakingSec: sessions.data().speakingSec || 0, mistakes: mistakes.data().count, vocab: vocab.data().count }; }),
        doc.ref.collection('activity').where('date', '>=', start).where('date', '<=', today).limit(days * 2 + 1).get().then(snap => {
          row.activity = snap.docs.map(d => normalizeAdminActivity(d.data()));
          if (snap.size > days * 2) row.warnings.push('Activitate duplicată: fereastra poate fi incompletă.');
        }),
        // Include the UTC day before the local cutoff, then filter exactly in the client.
        doc.ref.collection('errors').where('at', '>=', `${shiftDay(today, -days)}T00:00:00.000Z`).orderBy('at', 'desc').limit(21).get().then(async snap => {
          if (snap.size > 20) row.warnings.push('Erori: sunt afișate doar cele mai recente 20 de evenimente pentru acest cont.');
          const errors = snap.docs.slice(0, 20);
          const triage = errors.length ? await fs.getAll(...errors.map(d => fs.collection('adminUsers').doc(doc.id).collection('errorTriage').doc(d.id))) : [];
          row.errors = errors.map((d, i) => {
            const e = d.data();
            return { id: d.id, uid: doc.id, email: auth?.email || data.email || doc.id, at: typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) ? e.at : '', message: String(e.message || 'Eroare fără mesaj').slice(0, 1000), source: String(e.source || ''), page: String(e.page || ''), version: String(e.version || ''), resolved: triage[i]?.data()?.resolved === true };
          });
        }),
      ]);
      results.forEach((result, i) => { if (result.status === 'rejected') row.warnings.push(`${['Totaluri', 'Activitate', 'Erori'][i]} indisponibile pentru ${row.auth?.email || row.uid}.`); });
      return row;
    }));
    users.push(...batch);
  }
  const commerce = await commercePromise;
  for (const user of users) user.commerce = commerce.get(user.uid);
  return { users, totalUsers: count.data().count, nextCursor: page.size > 25 ? docs[docs.length - 1].id : null, days, today, generatedAt: new Date().toISOString() };
}

export async function getAdminUserDetail(uidValue: unknown): Promise<AdminUserDetail> {
  const ref = database().collection('users').doc(validId(uidValue));
  const names = ['lessons', 'tests', 'pron', 'reports', 'plans', 'situations', 'quizzes'];
  const [sessions, mistakes, vocab, counts] = await Promise.all([
    ref.collection('sessions').orderBy('startedAt', 'desc').limit(20).get(),
    ref.collection('mistakes').orderBy('occurrenceCount', 'desc').limit(20).get(),
    ref.collection('vocab').limit(30).get(),
    Promise.all(names.map(async name => ({ name, count: (await ref.collection(name).count().get()).data().count }))),
  ]);
  return {
    sessions: sessions.docs.map(d => { const s = d.data(); return { id: d.id, type: s.type, startedAt: s.startedAt, userSpeakingSec: s.userSpeakingSec || 0, wordCount: s.wordCount || 0, errorCount: s.errorCount || 0, reportStatus: s.reportStatus || 'ready' }; }),
    mistakes: mistakes.docs.map(d => { const m = d.data(); return { id: d.id, category: m.category, original: m.original || '', corrected: m.corrected || '', status: m.status, occurrenceCount: m.occurrenceCount || 0 }; }),
    vocab: vocab.docs.map(d => { const v = d.data(); return { id: d.id, text: v.expression || v.word || v.text || '', translation: v.meaningRo || v.translationRo || v.translation || '', status: v.status || '' }; }),
    collections: counts,
  };
}

export async function updateAdminProfile(actor: string, body: Record<string, unknown>) {
  const uid = validId(body.uid);
  const patch = profilePatch(body.patch);
  const fs = database();
  const ref = fs.collection('users').doc(uid);
  await fs.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists) throw new AdminInputError('Profilul nu mai există.');
    transaction.update(ref, patch);
    transaction.set(fs.collection('adminAudit').doc(), { actor, target: uid, action: 'update-profile', at: new Date().toISOString(), status: 'completed', changes: { before: Object.fromEntries(Object.keys(patch).map(key => [key, current.get(key) ?? null])), after: patch } });
  });
  return { ok: true };
}

export async function setAdminAccountStatus(actor: string, body: Record<string, unknown>) {
  const uid = validId(body.uid);
  if (typeof body.disabled !== 'boolean') throw new AdminInputError('Stare de cont invalidă.');
  if (uid === actor || isAdminUid(uid)) throw new AdminInputError('Conturile administratorilor nu pot fi suspendate din panou.');
  const disabled = body.disabled;
  return runAudited(actor, disabled ? 'suspend-account' : 'activate-account', uid, { disabled }, async () => {
    await getAdminAuth().updateUser(uid, { disabled });
    // checkRevoked in requireUser also rejects tokens of disabled users.
    if (disabled) await getAdminAuth().revokeRefreshTokens(uid);
    return { ok: true };
  });
}

export async function setAdminErrorStatus(actor: string, body: Record<string, unknown>) {
  const uid = validId(body.uid), errorId = validId(body.errorId, 'ID eroare');
  if (typeof body.resolved !== 'boolean') throw new AdminInputError('Stare de eroare invalidă.');
  const fs = database();
  const batch = fs.batch();
  batch.set(fs.collection('adminUsers').doc(uid).collection('errorTriage').doc(errorId), { resolved: body.resolved, at: new Date().toISOString(), actor });
  batch.set(fs.collection('adminAudit').doc(), { actor, target: uid, action: body.resolved ? 'resolve-error' : 'reopen-error', changes: { errorId }, at: new Date().toISOString(), status: 'completed' });
  await batch.commit();
  return { ok: true };
}

export async function saveAdminConfig(actor: string, body: Record<string, unknown>) {
  const patch = configPatch(body.settings);
  const fs = database();
  await fs.runTransaction(async transaction => {
    const ref = fs.collection('config').doc('app');
    const old = await transaction.get(ref);
    transaction.set(ref, patch, { merge: true });
    transaction.set(fs.collection('adminAudit').doc(), { actor, target: 'config/app', action: 'save-config', at: new Date().toISOString(), status: 'completed', changes: { before: Object.fromEntries(Object.keys(patch).map(key => [key, old.get(key) ?? null])), after: patch } });
  });
  return { ok: true };
}

export async function getAdminAudit(): Promise<{ entries: AuditEntry[] }> {
  const snap = await database().collection('adminAudit').orderBy('at', 'desc').limit(100).get();
  return { entries: snap.docs.map(d => ({ ...d.data(), id: d.id } as AuditEntry)) };
}
