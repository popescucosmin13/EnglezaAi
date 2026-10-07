import { useEffect, useState } from 'react';
import { Check, Clock3, Mail, Save, ShieldBan, ShieldCheck, UserRound } from 'lucide-react';
import { isAdminUid } from '../admin-config';
import { CATEGORY_LABELS_RO, CEFR_ORDER, SESSION_TYPE_LABELS_RO, STATUS_LABELS_RO } from '../types';
import { adminRequest } from './api';
import { email, name, number } from './metrics';
import type { AdminUser, AdminUserDetail } from './types';
import { PLATFORMS, userClient, userPlatform } from './platforms';
import { commercialLabel } from './insights';
import { Dialog, Empty } from './ui';

const collectionLabels: Record<string, string> = { lessons: 'Lecții salvate', tests: 'Teste de nivel', pron: 'Exerciții de pronunție', reports: 'Rapoarte', plans: 'Planuri zilnice', situations: 'Situații salvate', quizzes: 'Quizuri' };

export default function UserDrawer({ user, preview, onClose, onUpdate }: { user: AdminUser; preview: boolean; onClose: () => void; onUpdate: (next: AdminUser) => void }) {
  const client = userClient(user);
  const [tab, setTab] = useState('profile');
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [form, setForm] = useState({ currentLevel: user.profile.currentLevel || 'A1', targetLevel: user.profile.targetLevel || 'B2', dailyGoalMinutes: user.profile.dailyGoalMinutes || 15, mainObjective: user.profile.mainObjective || '', correctionMode: user.profile.correctionMode || 'final' });
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    const request = import.meta.env.DEV && preview ? import('./preview').then(module => module.previewDetail()) : adminRequest<AdminUserDetail>('user-detail', { uid: user.uid });
    request.then(result => { if (alive) setDetail(result); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user.uid, preview, reload]);

  const patch = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== user.profile[key as keyof typeof form]));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (preview || saving || !Object.keys(patch).length) return;
    setSaving(true); setError(''); setMessage('');
    try { await adminRequest('update-profile', { uid: user.uid, patch }); onUpdate({ ...user, profile: { ...user.profile, ...form } }); setMessage('Profilul a fost actualizat.'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }
  async function changeStatus() {
    if (preview || saving || !user.auth) return;
    setSaving(true); setError(''); setMessage('');
    try { await adminRequest('account-status', { uid: user.uid, disabled: !user.auth.disabled }); onUpdate({ ...user, auth: { ...user.auth, disabled: !user.auth.disabled } }); setMessage(user.auth.disabled ? 'Contul a fost reactivat.' : 'Autentificarea și accesul API au fost suspendate.'); setConfirmStatus(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setConfirmStatus(false); }
    finally { setSaving(false); }
  }
  return <Dialog title="Detalii utilizator" wide onClose={() => { if (!saving) onClose(); }}>
    <div className="admin-user-hero"><span className="admin-avatar large">{name(user).slice(0, 2).toUpperCase()}</span><div><h3>{name(user)}</h3><span>{email(user)}</span><div className="admin-inline-badges"><span className="admin-badge purple">{user.profile.currentLevel || 'Fără nivel'}</span><span className={`admin-badge ${user.auth?.disabled ? 'red' : 'green'}`}>{user.auth ? user.auth.disabled ? 'Suspendat' : 'Cont activ' : 'Fără date Auth'}</span></div></div></div>
    <div className="admin-detail-meta"><span><Mail size={14} />{user.auth ? user.auth.emailVerified ? 'Email verificat' : 'Email neverificat' : 'Verificare indisponibilă'}</span><span><Clock3 size={14} />Înscris: {user.auth?.createdAt ? new Date(user.auth.createdAt).toLocaleDateString('ro-RO') : '—'}</span></div>
    <p className="admin-uid">UID: {user.uid}</p>
    <div className="admin-detail-stats">{[['Sesiuni', user.totals?.sessions], ['Minute vorbite', user.totals ? Math.round(user.totals.speakingSec / 60) : undefined], ['XP', user.profile.xp], ['Streak', user.profile.streak]].map(([label, value]) => <div key={label}><strong>{typeof value === 'number' ? number(value) : '—'}</strong><small>{label}</small></div>)}</div>
    <div className="admin-tabs" role="tablist" aria-label="Detalii utilizator">{[['profile', 'Profil'], ['sessions', 'Sesiuni recente'], ['learning', 'Învățare'], ['client', 'Aplicație & acces']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {error && <div role="alert" className="admin-notice error">{error}<button onClick={() => setReload(n => n + 1)}>Reîncearcă încărcarea</button></div>}
    {message && <div role="status" className="admin-notice success"><Check size={16} />{message}</div>}
    {tab === 'profile' && <><form onSubmit={save}><fieldset disabled={saving}><h3><UserRound size={17} /> Profil de învățare</h3><div className="admin-form-grid"><label>Nivel curent<select value={form.currentLevel} onChange={e => setForm({ ...form, currentLevel: e.target.value as typeof form.currentLevel })}>{CEFR_ORDER.map(level => <option key={level}>{level}</option>)}</select></label><label>Nivel țintă<select value={form.targetLevel} onChange={e => setForm({ ...form, targetLevel: e.target.value as typeof form.targetLevel })}>{CEFR_ORDER.map(level => <option key={level}>{level}</option>)}</select></label><label>Obiectiv zilnic (minute)<input type="number" min="5" max="120" step="1" required value={form.dailyGoalMinutes} onChange={e => setForm({ ...form, dailyGoalMinutes: Number(e.target.value) })} /></label><label>Mod de corectare<select value={form.correctionMode} onChange={e => setForm({ ...form, correctionMode: e.target.value as typeof form.correctionMode })}><option value="discreet">Discret</option><option value="immediate">Imediat</option><option value="final">La final</option></select></label><label className="full">Obiectiv principal<textarea required maxLength={500} rows={3} value={form.mainObjective} onChange={e => setForm({ ...form, mainObjective: e.target.value })} /></label></div><button className="admin-primary" disabled={preview || !Object.keys(patch).length}><Save size={16} />{saving ? 'Se salvează…' : 'Salvează profilul'}</button></fieldset></form><div className="admin-account-box"><h3><ShieldCheck size={17} /> Acces la cont</h3><p>Onboarding {user.profile.onboarded ? 'finalizat' : 'nefinalizat'} · test de nivel {user.profile.testDone ? 'finalizat' : 'nefinalizat'}.</p><p>Suspendarea blochează autentificarea și cererile API. Abonamentul din magazin continuă până când este anulat separat.</p><button className={user.auth?.disabled ? 'admin-primary' : 'admin-danger-button'} disabled={preview || !user.auth || isAdminUid(user.uid) || saving} onClick={() => setConfirmStatus(true)}><ShieldBan size={16} />{user.auth?.disabled ? 'Reactivează contul' : 'Suspendă contul'}</button></div></>}
    {tab === 'client' && <><h3>Ultima aplicație observată</h3><dl className="admin-facts">{[
      ['Platformă', PLATFORMS[userPlatform(user)]], ['Versiune', client.appVersion || 'Neînregistrată'], ['Build', client.build || 'Neînregistrat'], ['Sistem de operare', client.osVersion || 'Neînregistrat'], ['Țară RevenueCat', client.country || 'Neînregistrată'], ['Observată la', client.lastSeenAt ? new Date(client.lastSeenAt).toLocaleString('ro-RO') : 'Dată neînregistrată'], ['Sursa platformei', client.source === 'revenuecat' ? 'RevenueCat SDK' : client.source === 'profile' ? 'Profil aplicație' : 'Nu există observații'], ['Ultima autentificare', user.auth?.lastSignInAt ? new Date(user.auth.lastSignInAt).toLocaleString('ro-RO') : '—'], ['Furnizori autentificare', user.auth?.providers.join(', ') || '—']
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h3>Acces comercial</h3><div className="admin-account-box"><span className={`admin-badge ${user.commerce?.isPro ? 'purple' : ''}`}>{commercialLabel(user)}</span><p>{user.commerce?.isPro ? user.commerce.expiresAt ? `Acces până la ${new Date(user.commerce.expiresAt).toLocaleString('ro-RO')}.` : 'Acces activ, fără dată de expirare raportată.' : user.commerce?.status === 'unavailable' ? 'Datele RevenueCat nu au putut fi citite. Verifică integrarea sau reîncarcă.' : user.commerce?.status === 'unlinked' ? 'Nu există un client RevenueCat cu acest UID.' : 'Nu există un entitlement Pro activ confirmat.'}</p><p className="admin-caption">Pro poate proveni dintr-un abonament, o achiziție sau acces promoțional. Istoricul de plăți și mediul de test sunt în Abonamente.</p></div></>}
    {tab !== 'profile' && tab !== 'client' && loading && <div className="admin-loading"><span className="spinner" />Se încarcă istoricul…</div>}
    {tab === 'sessions' && detail && (detail.sessions.length ? <><p className="admin-caption">Cele mai recente {detail.sessions.length} sesiuni.</p>{detail.sessions.map(s => <div className="admin-history-row" key={s.id}><span className="admin-history-icon"><Clock3 size={18} /></span><div><strong>{SESSION_TYPE_LABELS_RO[s.type] || s.type}</strong><small>{new Date(s.startedAt).toLocaleString('ro-RO')} · {number(s.wordCount)} cuvinte</small><small>{s.errorCount} greșeli · raport {s.reportStatus === 'ready' ? 'disponibil' : s.reportStatus === 'failed' ? 'eșuat' : 'în lucru'}</small></div><b>{Math.round(s.userSpeakingSec / 60)} min</b></div>)}</> : <Empty title="Nicio sesiune înregistrată" />)}
    {tab === 'learning' && detail && <><h3>Conținut și progres</h3><div className="admin-collection-grid">{detail.collections.map(c => <div key={c.name}><strong>{number(c.count)}</strong><span>{collectionLabels[c.name] || c.name}</span></div>)}</div><h3>Greșeli frecvente · top 20</h3>{detail.mistakes.length ? detail.mistakes.map(m => <div className="admin-mistake" key={m.id}><span className="admin-badge purple">{CATEGORY_LABELS_RO[m.category] || m.category}</span><p><del>{m.original}</del><strong>{m.corrected}</strong></p><small>{m.occurrenceCount} apariții · {STATUS_LABELS_RO[m.status] || m.status}</small></div>) : <Empty title="Nicio greșeală înregistrată" />}<h3>Vocabular · primele 30 de expresii</h3>{detail.vocab.length ? detail.vocab.map(v => <div className="admin-history-row" key={v.id}><div><strong>{v.text}</strong><small>{v.translation}</small></div><span className="admin-badge">{v.status || 'salvat'}</span></div>) : <Empty title="Nicio expresie salvată" />}</>}
    {confirmStatus && <Dialog title={user.auth?.disabled ? 'Reactivezi acest cont?' : 'Suspenzi acest cont?'} onClose={() => { if (!saving) setConfirmStatus(false); }}><p>{email(user)}</p><p>{user.auth?.disabled ? 'Utilizatorul se va putea autentifica din nou.' : 'Utilizatorul pierde accesul la autentificare și API. Datele și progresul se păstrează.'}</p><div className="admin-actions"><button disabled={saving} onClick={() => setConfirmStatus(false)}>Renunță</button><button className={user.auth?.disabled ? 'admin-primary' : 'admin-danger-button'} disabled={saving} onClick={() => void changeStatus()}>{saving ? 'Se actualizează…' : 'Confirmă'}</button></div></Dialog>}
  </Dialog>;
}
