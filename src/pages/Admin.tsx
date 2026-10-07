import { PLATFORMS, userPlatform, userClient, platformStats } from '../admin/platforms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, AudioLines, Bot, ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, GraduationCap, LayoutDashboard, ListChecks, Loader2, Menu, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, TriangleAlert, TrendingUp, Users, X, Zap, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { isAdminUid } from '../admin-config';
import { apiError, apiFetch } from '../api/backend';
import SubscriptionAdminPanel from '../components/SubscriptionAdminPanel';
import { CEFR_ORDER } from '../types';
import { adminRequest } from '../admin/api';
import { activeDay, email, name, number, percent, shiftDay, summarize, usersCsv } from '../admin/metrics';
import type { AdminPage, AdminUser, BackendStatus, OpenRouterInfo } from '../admin/types';
import { ActivityChart, Bars, Empty, Panel, Stat } from '../admin/ui';
import Configuration from '../admin/Configuration';
import UserDrawer from '../admin/UserDrawer';
import { AiPanel, AuditPanel, ErrorsPanel, LearningPanel } from '../admin/Panels';
import { GrowthPanel, AppsPanel } from '../admin/InsightsPanel';
import AcquisitionPanel from '../admin/AcquisitionPanel';
import { commercialLabel } from '../admin/insights';
import './Admin.css';

const SECTIONS: { id: string; label: string; icon: LucideIcon; group: string; title: string; subtitle: string }[] = [
  { id: 'overview', label: 'Privire de ansamblu', icon: LayoutDashboard, group: 'GENERAL', title: 'Centrul de control', subtitle: 'Utilizatori, activitate, acces Pro și starea aplicației, într-un singur loc.' },
  { id: 'users', label: 'Utilizatori', icon: Users, group: 'GENERAL', title: 'Oamenii din spatele progresului', subtitle: 'Găsește un cont, înțelege parcursul și gestionează accesul.' },
  { id: 'learning', label: 'Activitate & progres', icon: GraduationCap, group: 'GENERAL', title: 'Fiecare conversație contează', subtitle: 'Vezi cum învață utilizatorii și unde au nevoie de ajutor.' },
  { id: 'growth', label: 'Creștere & revenire', icon: TrendingUp, group: 'GENERAL', title: 'Creștere & revenire', subtitle: 'Cohorte de utilizatori, frecvența învățării și conturi care nu au revenit.' },
  { id: 'apps', label: 'Aplicații & dispozitive', icon: Activity, group: 'ADMINISTRARE', title: 'iOS, Android & Web', subtitle: 'Platforme, versiuni, țări și acoperirea datelor despre aplicație.' },
  { id: 'subscriptions', label: 'Abonamente', icon: CreditCard, group: 'ADMINISTRARE', title: 'Abonamente & venituri', subtitle: 'Clienți, achiziții și acces Pro, sincronizate cu RevenueCat.' },
  { id: 'ai', label: 'AI & costuri', icon: Bot, group: 'ADMINISTRARE', title: 'Inteligență, cu vizibilitate', subtitle: 'Credite, consum și utilizarea modelelor care susțin aplicația.' },
  { id: 'errors', label: 'Erori & suport', icon: TriangleAlert, group: 'ADMINISTRARE', title: 'Problemele, la vedere', subtitle: 'Investighează erorile raportate și urmărește rezolvarea lor.' },
  { id: 'settings', label: 'Configurare', icon: Settings2, group: 'SISTEM', title: 'Control asupra aplicației', subtitle: 'Modele AI, voci și integrări pentru întreaga experiență EnglezaAI.' },
  { id: 'audit', label: 'Jurnal administrativ', icon: ListChecks, group: 'SISTEM', title: 'Un istoric al deciziilor', subtitle: 'Cine a schimbat ce, când și pentru ce cont.' },
];
const PAGE_SIZE = 10;

export default function Admin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const preview = import.meta.env.DEV && params.get('adminPreview') === '1';
  const allowed = preview || isAdminUid(user?.uid);
  const section = SECTIONS.find(s => s.id === params.get('section')) || SECTIONS[0];
  const days = [7, 30, 90].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const [page, setPage] = useState<AdminPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [credits, setCredits] = useState<OpenRouterInfo | null>(null);
  const [serviceErrors, setServiceErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [allLoading, setAllLoading] = useState(false);
  const stopLoading = useRef(false);
  const [filter, setFilter] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [level, setLevel] = useState('all');
  const [sort, setSort] = useState('recent');
  const [tablePage, setTablePage] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [configVisited, setConfigVisited] = useState(section.id === 'settings');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadId = useRef(0);
  const contentRef = useRef<HTMLElement>(null);
  const requestBusy = useRef(false);

  function go(id: string) { setParams(previous => { const next = new URLSearchParams(previous); next.set('section', id); return next; }); setMenuOpen(false); contentRef.current?.scrollTo({ top: 0 }); }
  async function loadData(cursor?: string, generation = loadId.current) {
    if (!allowed) return;
    requestBusy.current = true; setBusy(true); setError('');
    try {
      const result = import.meta.env.DEV && preview ? (await import('../admin/preview')).previewPage(days) : await adminRequest<AdminPage>('overview', { days, cursor });
      if (generation !== loadId.current) return;
      setPage(previous => cursor && previous ? { ...result, users: [...new Map([...previous.users, ...result.users].map(u => [u.uid, u])).values()] } : result);
      return result.nextCursor;
    } catch (e) { if (generation === loadId.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (generation === loadId.current) { requestBusy.current = false; setBusy(false); } }
  }
  async function loadAllData() {
    if (!page?.nextCursor || requestBusy.current || allLoading) return;
    const generation = loadId.current;
    stopLoading.current = false; setAllLoading(true);
    let cursor: string | null | undefined = page.nextCursor;
    try { while (cursor && generation === loadId.current && !stopLoading.current) cursor = await loadData(cursor, generation); }
    finally { setAllLoading(false); }
  }
  async function loadServices(generation = loadId.current) {
    if (!allowed) return;
    if (import.meta.env.DEV && preview) { const module = await import('../admin/preview'); if (generation === loadId.current) { setStatus(module.previewStatus); setCredits({ key: { usage: 37.42, limit: 100 }, credits: { total_credits: 150, total_usage: 37.42 } }); } return; }
    const results = await Promise.allSettled([
      apiFetch('status').then(async response => { if (!response.ok) throw await apiError(response, 'Configurare', true); return response.json() as Promise<BackendStatus>; }),
      adminRequest<OpenRouterInfo>('openrouter'),
    ]);
    if (generation !== loadId.current) return;
    setStatus(results[0].status === 'fulfilled' ? results[0].value : null);
    setCredits(results[1].status === 'fulfilled' ? results[1].value : null);
    setServiceErrors(results.flatMap((r, i) => r.status === 'rejected' ? [`${i ? 'Credite AI' : 'Integrări'}: ${r.reason?.message || 'Date indisponibile.'}`] : []));
  }
  useEffect(() => {
    const generation = ++loadId.current;
    setPage(null); setSelectedUid(null); setTablePage(0);
    if (allowed) { void loadData(undefined, generation); void loadServices(generation); }
    return () => { loadId.current++; };
  }, [allowed, days, preview, refreshVersion]);
  useEffect(() => { if (section.id === 'settings') setConfigVisited(true); }, [section.id]);
  useEffect(() => { setTablePage(0); }, [search, filter, level, sort, platform, plan]);
  useEffect(() => {
    if (!menuOpen) return;
    const main = document.querySelector<HTMLElement>('.admin-workspace-main');
    const sidebar = document.getElementById('admin-navigation');
    const buttons = sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
    if (main) main.inert = true;
    sidebar?.querySelector<HTMLElement>('.admin-mobile-close')?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
      if (e.key === 'Tab' && buttons?.length) {
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('keydown', close); if (main) main.inert = false; document.querySelector<HTMLElement>('.admin-menu-toggle')?.focus(); };
  }, [menuOpen]);

  const users = page?.users || [];
  const metrics = useMemo(() => summarize(users, days, page?.today || new Date().toISOString().slice(0, 10)), [page, days]);
  const selected = users.find(u => u.uid === selectedUid);
  const incomplete = Boolean(page?.nextCursor) || users.some(u => u.warnings.length);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ro-RO');
    const start = shiftDay(page?.today || new Date().toISOString().slice(0, 10), 1 - days);
    return users.filter(u => {
      const active = u.activity.some(a => a.date && a.date >= start && a.date <= (page?.today || '') && activeDay(a));
      return (!needle || `${email(u)} ${name(u)} ${u.uid}`.toLocaleLowerCase('ro-RO').includes(needle))
        && (plan === 'all' || (plan === 'pro' && u.commerce?.isPro === true) || (plan === 'free' && u.commerce?.isPro === false) || (plan === 'unknown' && u.commerce?.isPro == null))
        && (platform === 'all' || userPlatform(u) === platform)
        && (level === 'all' || u.profile.currentLevel === level)
        && (filter === 'all' || (filter === 'active' && active) || (filter === 'inactive' && !active) || (filter === 'unverified' && u.auth?.emailVerified === false) || (filter === 'suspended' && u.auth?.disabled) || (filter === 'onboarding' && !u.profile.onboarded));
    }).sort((a, b) => sort === 'xp' ? (b.profile.xp || 0) - (a.profile.xp || 0) : sort === 'sessions' ? (b.totals?.sessions || 0) - (a.totals?.sessions || 0) : sort === 'email' ? email(a).localeCompare(email(b)) : (b.profile.lastActiveDay || '').localeCompare(a.profile.lastActiveDay || ''));
  }, [page, days, search, filter, level, sort, platform, plan]);
  const currentTablePage = Math.min(tablePage, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const nonVerified = users.filter(u => u.auth?.emailVerified === false).length;
  const onboarded = users.filter(u => u.profile.onboarded).length;
  const tested = users.filter(u => u.profile.testDone).length;
  const unresolved = metrics.errors.filter(e => !e.resolved);
  const remaining = credits?.credits?.total_credits != null && credits.credits.total_usage != null ? credits.credits.total_credits - credits.credits.total_usage : null;
  function updateUser(next: AdminUser) { setPage(p => p ? { ...p, users: p.users.map(u => u.uid === next.uid ? next : u) } : p); }
  function exportUsers() {
    const url = URL.createObjectURL(new Blob([usersCsv(filtered)], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `englezaai-utilizatori-${page?.today || 'export'}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filterUsers(value: string) { setPlatform('all'); setPlan('all'); setFilter(value); setSearch(''); setLevel('all'); go('users'); }
  const recentUsers = [...users].sort((a, b) => (b.profile.lastActiveDay || '').localeCompare(a.profile.lastActiveDay || '')).slice(0, 5);
  const userTable = (rows: AdminUser[], compact = false) => <div className="admin-table-wrap"><table className="admin-users-table"><thead><tr><th>Utilizator</th><th>Aplicație</th><th>Acces Pro</th><th>Nivel</th>{!compact && <th>Stare cont</th>}<th>Sesiuni <small>total</small></th>{!compact && <th>Minute <small>total</small></th>}<th>Ultima activitate</th><th><span className="admin-sr-only">Acțiuni</span></th></tr></thead><tbody>{rows.map(u => <tr key={u.uid}><td><button className="admin-person" onClick={() => setSelectedUid(u.uid)}><span className="admin-avatar">{name(u).slice(0, 2).toUpperCase()}</span><span><strong>{name(u)}</strong><small>{email(u)}</small></span></button></td><td><span className="admin-client-cell"><strong>{PLATFORMS[userPlatform(u)]}</strong><small>{userClient(u).appVersion ? `v${userClient(u).appVersion}` : 'Versiune neînregistrată'}</small></span></td><td><span className={`admin-badge ${u.commerce?.isPro ? 'purple' : ''}`}>{commercialLabel(u)}</span></td><td><span className="admin-badge purple">{u.profile.currentLevel || '—'}</span></td>{!compact && <td><span className={`admin-badge ${u.auth?.disabled ? 'red' : !u.auth ? '' : u.auth.emailVerified ? 'green' : 'amber'}`}>{u.auth ? u.auth.disabled ? 'Suspendat' : u.auth.emailVerified ? 'Activ' : 'Neverificat' : 'Necunoscut'}</span></td>}<td>{u.totals ? number(u.totals.sessions) : '—'}</td>{!compact && <td>{u.totals ? number(Math.round(u.totals.speakingSec / 60)) : '—'}</td>}<td>{u.profile.lastActiveDay ? u.profile.lastActiveDay === page?.today ? <span className="admin-today"><i />Astăzi</span> : u.profile.lastActiveDay.split('-').reverse().join('.') : 'Niciodată'}</td><td><button className="admin-icon-button" aria-label={`Detalii pentru ${email(u)}`} onClick={() => setSelectedUid(u.uid)}><ChevronRight size={18} /></button></td></tr>)}</tbody></table></div>;

  if (!allowed) return <div className="admin-denied"><ShieldCheck size={42} /><h1>Acces rezervat administratorilor</h1><p>Acest cont nu are drepturi de administrare.</p><Link to="/">Înapoi în aplicație</Link></div>;
  return <div className="admin-shell">
    <a className="admin-skip-link" href="#admin-main" onClick={e => { e.preventDefault(); contentRef.current?.focus(); }}>Sari la conținut</a>
    {menuOpen && <button className="admin-menu-overlay" aria-label="Închide meniul" onClick={() => setMenuOpen(false)} />}
    <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`} id="admin-navigation"><Link className="admin-brand" to={preview ? '/admin?adminPreview=1' : '/admin'}><span><AudioLines size={23} /></span><strong>engleza<span>AI</span><small>SUPER ADMIN</small></strong></Link><button className="admin-mobile-close admin-icon-button" aria-label="Închide meniul" onClick={() => setMenuOpen(false)}><X size={20} /></button><div className="admin-workspace"><span className="admin-workspace-icon"><ShieldCheck size={18} /></span><div><strong>Super Admin</strong><small>EnglezaAI · administrator</small></div></div><nav aria-label="Administrare">{['GENERAL', 'ADMINISTRARE', 'SISTEM'].map(group => <div className="admin-nav-group" key={group}><p>{group}</p>{SECTIONS.filter(item => item.group === group).map(item => <button key={item.id} className={section.id === item.id ? 'active' : ''} aria-current={section.id === item.id ? 'page' : undefined} onClick={() => go(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'users' && page && <small>{page.totalUsers}</small>}{item.id === 'errors' && unresolved.length > 0 && <small className="alert">{unresolved.length}</small>}</button>)}</div>)}</nav><div className="admin-sidebar-bottom"><div className="admin-private"><ShieldCheck size={17} /><div><strong>Spațiu securizat</strong><span>Acces doar pentru administratori</span></div></div><Link to="/"><ArrowLeft size={16} />Înapoi în aplicație</Link><div className="admin-account"><span className="admin-avatar">{(user?.email || 'AD').slice(0, 2).toUpperCase()}</span><div><strong>Administrator</strong><small>{preview ? 'Previzualizare locală' : user?.email}</small></div><ShieldCheck size={16} /></div></div></aside>
    <div className="admin-workspace-main"><header className="admin-topbar"><div><button className="admin-menu-toggle admin-icon-button" aria-label="Deschide meniul" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button><span className="admin-breadcrumb">Workspace <ChevronRight size={13} /><strong>{section.label}</strong></span></div><div className="admin-topbar-right"><span className="admin-sync"><i className={busy ? 'busy' : ''} />{preview ? 'Date demonstrative' : busy ? 'Se sincronizează' : page ? `Actualizat la ${new Date(page.generatedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : 'În așteptarea datelor'}</span><button className="admin-icon-button" aria-label="Actualizează datele" disabled={busy || allLoading} onClick={() => { if (!requestBusy.current) setRefreshVersion(n => n + 1); }}><RefreshCw size={17} className={busy ? 'admin-spin' : ''} /></button><span className="admin-top-avatar">AD</span></div></header>
    <main id="admin-main" tabIndex={-1} ref={contentRef} className="admin-main">
      {preview && <div className="admin-notice preview"><Sparkles size={17} />Previzualizare locală · date demonstrative. Operațiunile de administrare sunt dezactivate.</div>}
      <div className="admin-page-heading"><div><span className="admin-eyebrow">ENGLEZAAI / SUPER ADMIN</span><h1>{section.title}</h1><p>{section.subtitle}</p></div><div className="admin-heading-actions"><label className="admin-date-filter"><Clock3 size={15} /><span className="admin-sr-only">Perioada statisticilor</span><select value={days} onChange={e => setParams(previous => { const next = new URLSearchParams(previous); next.set('days', e.target.value); return next; })}><option value="7">Ultimele 7 zile</option><option value="30">Ultimele 30 de zile</option><option value="90">Ultimele 90 de zile</option></select></label><button disabled={!filtered.length} onClick={exportUsers} title="Exportă utilizatorii încărcați, cu filtrele curente"><ArrowDownToLine size={16} /><span>Export utilizatori</span></button></div></div>
      {error && <div className="admin-notice error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button disabled={busy} onClick={() => void loadData()}>Reîncearcă</button></div>}
      {page && incomplete && <div className="admin-notice warning"><CircleHelp size={17} /><span><strong>Acoperire: {users.length} din {page.totalUsers} profiluri.</strong> Statisticile și căutarea folosesc conturile încărcate.{users.some(u => u.warnings.length) && <details><summary>Detalii despre datele parțiale</summary>{users.flatMap(u => u.warnings).map((w, i) => <p key={i}>{w}</p>)}</details>}</span>{page.nextCursor && <button disabled={busy} onClick={() => void loadData(page.nextCursor!)}>{busy ? 'Se încarcă…' : 'Încarcă următoarele 25'}</button>}</div>}
      {page?.nextCursor && <div className="admin-load-all"><span>{users.length} / {page.totalUsers} profiluri analizate</span>{allLoading ? <button onClick={() => { stopLoading.current = true; }}>Oprește după pagina curentă</button> : <button disabled={busy} onClick={() => void loadAllData()}><Users size={16} />Încarcă toate profilurile</button>}</div>}
      {busy && !page && <div className="admin-loading" role="status"><Loader2 size={19} className="admin-spin" />Se citesc profilurile și activitatea din aplicație…</div>}

      {section.id === 'overview' && <>
        <div className="admin-command-banner"><div><span className="admin-eyebrow">SITUAȚIA APLICAȚIEI</span><h2>Decizii bazate pe datele din conturi</h2><p>{page ? `${users.length} profiluri analizate din ${page.totalUsers} · ${users.filter(u => u.commerce?.isPro === true).length} cu acces Pro · ${unresolved.length} erori deschise` : 'Se sincronizează datele aplicației…'}</p></div><div><button onClick={() => go('subscriptions')}><CreditCard size={16} />Abonamente & venituri</button><button onClick={() => go('growth')}><TrendingUp size={16} />Analizează revenirea</button></div></div>
        <div className="admin-stats-grid"><Stat label="Utilizatori înregistrați" value={page ? number(page.totalUsers) : '—'} icon={Users} note={page ? `${metrics.newUsers} conturi noi în perioada aleasă${incomplete ? ' · date parțiale' : ''}` : 'Profiluri Firestore'} /><Stat label="Utilizatori activi" value={page ? number(metrics.active) : '—'} icon={Activity} tone="green" note={metrics.previousActive ? 'față de perioada precedentă' : 'cu activitate în perioada aleasă'} current={metrics.active} previous={metrics.previousActive} /><Stat label="Sesiuni de învățare" value={page ? number(metrics.sessions) : '—'} icon={AudioLines} tone="blue" note={metrics.previousSessions ? 'față de perioada precedentă' : 'în perioada aleasă'} current={metrics.sessions} previous={metrics.previousSessions} /><Stat label="Minute de conversație" value={page ? number(Math.round(metrics.speakingSec / 60)) : '—'} icon={Clock3} tone="orange" note={metrics.previousSpeakingSec ? 'față de perioada precedentă' : 'timp de vorbire măsurat'} current={metrics.speakingSec} previous={metrics.previousSpeakingSec} /></div>
        <div className="admin-dashboard-grid"><Panel title="Ritmul învățării" caption={`Activitate zilnică · ultimele ${days} zile`} action={<span className="admin-badge">Europe/Bucharest</span>}>{page ? <ActivityChart points={metrics.series} /> : <Empty title="Datele de activitate nu sunt încă disponibile" />}</Panel><Panel title="De la început, la progres" caption="Etape independente, din conturile încărcate" className="admin-funnel"><span className="admin-funnel-icon"><TrendingUp size={24} /></span><strong className="admin-big-number">{page ? percent(onboarded, users.length) : '—'}<small>%</small></strong><p>au finalizat onboardingul</p><Bars items={[{ label: 'Conturi încărcate', value: users.length }, { label: 'Onboarding finalizat', value: onboarded }, { label: 'Test de nivel finalizat', value: tested }, { label: 'Activi în perioadă', value: metrics.active }]} /><button className="admin-text-button" onClick={() => filterUsers('onboarding')}>Vezi conturile fără onboarding<ArrowRight size={15} /></button></Panel></div>
        <div className="admin-attention"><div><span><Zap size={19} /></span><div><h2>Merită atenția ta</h2><p>Lucrurile care au nevoie de o privire.</p></div></div><button onClick={() => go('errors')}><b>{page ? unresolved.length : '—'}</b> erori deschise<ArrowRight size={15} /></button><button onClick={() => filterUsers('unverified')}><b>{page ? nonVerified : '—'}</b> emailuri neverificate<ArrowRight size={15} /></button><button onClick={() => filterUsers('inactive')}><b>{page ? users.length - metrics.active : '—'}</b> fără activitate<ArrowRight size={15} /></button></div>
        <div className="admin-dashboard-grid"><Panel title="Utilizatori recenți" caption="Ordonați după ultima zi de activitate" action={<button className="admin-text-button" onClick={() => go('users')}>Vezi toți<ArrowRight size={14} /></button>}>{recentUsers.length ? userTable(recentUsers, true) : <Empty title={page ? 'Niciun utilizator înregistrat' : 'Utilizatorii nu sunt încă disponibili'} />}</Panel><Panel title="Nivelurile comunității" caption="Distribuția nivelului curent"><div className="admin-levels">{CEFR_ORDER.map((cefr, i) => { const count = users.filter(u => u.profile.currentLevel === cefr).length; return <div key={cefr}><span className={`admin-level-dot level-${i}`} /><strong>{cefr}</strong><span className="admin-track"><span style={{ width: `${percent(count, users.length)}%`, background: `var(--ad-level-${i})` }} /></span><b>{page ? count : '—'}</b><small>{page ? percent(count, users.length) : '—'}%</small></div>; })}</div><p className="admin-caption">{page ? users.filter(u => !u.profile.currentLevel).length : '—'} conturi fără nivel stabilit.</p><div className="admin-credit-mini"><Bot size={21} /><div><small>Credite OpenRouter rămase</small><strong>{remaining == null ? '—' : new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(remaining)}</strong></div><button className="admin-icon-button" aria-label="Vezi costurile AI" onClick={() => go('ai')}><ArrowRight size={18} /></button></div></Panel></div>
      </>}
      {(section.id === 'overview' || section.id === 'users') && <Panel title="Utilizatori pe platforme" caption="Ultima platformă observată · distribuție curentă, independentă de perioada selectată">{page ? <Bars items={platformStats(users).map(item => ({ ...item, suffix: ' (' + percent(item.value, users.length) + '%)' }))} /> : <p>Datele nu sunt încă disponibile.</p>}<p className="admin-caption">{users.length} conturi încărcate{page?.nextCursor ? ' · statistică parțială; încarcă restul conturilor pentru distribuția completă' : ''}. Fiecare cont este numărat o singură dată. Platforma provine din profil sau din ultima observație RevenueCat disponibilă. Web include accesul din browser pe telefon.</p></Panel>}
      {section.id === 'users' && <><div className="admin-small-stats">{[['Toate conturile', page?.totalUsers], ['Activi în perioadă', page ? metrics.active : undefined], ['Email neverificat', page ? nonVerified : undefined], ['Suspendate', page ? users.filter(u => u.auth?.disabled).length : undefined]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</div><Panel title="Toți utilizatorii" caption={`${filtered.length} rezultate în ${users.length} conturi încărcate`}><div className="admin-filters"><label className="admin-search"><Search size={18} /><span className="admin-sr-only">Caută utilizatori</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută nume, email sau UID…" /></label><label><span className="admin-sr-only">Filtru utilizatori</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Toate conturile</option><option value="active">Activi în perioadă</option><option value="inactive">Fără activitate în perioadă</option><option value="unverified">Email neverificat</option><option value="suspended">Suspendate</option><option value="onboarding">Fără onboarding</option></select></label><label><span className="admin-sr-only">Acces Pro</span><select value={plan} onChange={e => setPlan(e.target.value)}><option value="all">Toate planurile</option><option value="pro">Pro activ</option><option value="free">Fără Pro</option><option value="unknown">Plan indisponibil</option></select></label><label><span className="admin-sr-only">Platformă</span><select value={platform} onChange={e => setPlatform(e.target.value)}><option value="all">Toate platformele</option>{Object.entries(PLATFORMS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="admin-sr-only">Nivel CEFR</span><select value={level} onChange={e => setLevel(e.target.value)}><option value="all">Toate nivelurile</option>{CEFR_ORDER.map(c => <option key={c}>{c}</option>)}</select></label><label><span className="admin-sr-only">Ordonează utilizatorii</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Activitate recentă</option><option value="xp">Cele mai multe XP</option><option value="sessions">Cele mai multe sesiuni</option><option value="email">Email A–Z</option></select></label></div>{filtered.length ? userTable(filtered.slice(currentTablePage * PAGE_SIZE, (currentTablePage + 1) * PAGE_SIZE)) : <Empty title={search || filter !== 'all' || level !== 'all' || platform !== 'all' ? 'Niciun rezultat pentru filtrele alese' : page ? 'Nu există încă utilizatori' : 'Lista utilizatorilor nu este disponibilă'}>Încearcă alte criterii sau încarcă mai multe conturi.</Empty>}<div className="admin-pagination"><span>{filtered.length ? `${currentTablePage * PAGE_SIZE + 1}–${Math.min((currentTablePage + 1) * PAGE_SIZE, filtered.length)} din ${filtered.length} rezultate` : '0 rezultate'}</span><div><button aria-label="Pagina anterioară" disabled={currentTablePage === 0} onClick={() => setTablePage(currentTablePage - 1)}><ChevronLeft size={16} /></button><span>{currentTablePage + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}</span><button aria-label="Pagina următoare" disabled={(currentTablePage + 1) * PAGE_SIZE >= filtered.length} onClick={() => setTablePage(currentTablePage + 1)}><ChevronRight size={16} /></button></div></div></Panel></>}
      {section.id === 'growth' && <><AcquisitionPanel days={days} refreshVersion={refreshVersion} preview={preview} /><GrowthPanel users={users} days={days} today={page?.today || ''} ready={Boolean(page)} onUser={setSelectedUid} /></>}
      {section.id === 'apps' && <AppsPanel users={users} days={days} today={page?.today || ''} ready={Boolean(page)} onUser={setSelectedUid} />}
      {section.id === 'learning' && <LearningPanel users={users} metrics={metrics} ready={Boolean(page)} onUsers={() => go('users')} />}
      {section.id === 'subscriptions' && <div className="admin-subscriptions"><p className="admin-caption">Veniturile folosesc fereastra de 30 de zile a RevenueCat. Starea abonamentelor este cea curentă.</p><SubscriptionAdminPanel key={refreshVersion} preview={preview} registeredPage={page} onRegisteredUser={setSelectedUid} onRegisteredRefresh={() => { void loadData(); }} /></div>}
      {section.id === 'ai' && <AiPanel preview={preview} refreshVersion={refreshVersion} days={days} credits={credits} status={status} errors={serviceErrors} onRetry={() => void loadServices()} onSettings={() => go('settings')} />}
      {section.id === 'errors' && <ErrorsPanel errors={metrics.errors} preview={preview} ready={Boolean(page)} onUser={setSelectedUid} onResolved={(uid, id, resolved) => setPage(p => p ? { ...p, users: p.users.map(u => u.uid === uid ? { ...u, errors: u.errors.map(e => e.id === id ? { ...e, resolved } : e) } : u) } : p)} />}
      {configVisited && <div hidden={section.id !== 'settings'}><Configuration status={status} preview={preview} /></div>}
      {section.id === 'audit' && <AuditPanel users={users} preview={preview} refreshVersion={refreshVersion} />}
      <footer className="admin-footer"><span>EnglezaAI Super Admin</span><span><ShieldCheck size={13} />{preview ? 'Mediu de previzualizare' : `Date din aplicație${incomplete ? ' · acoperire parțială' : ''}`}</span></footer>
    </main></div>
    {selected && <UserDrawer key={selected.uid} user={selected} preview={preview} onClose={() => setSelectedUid(null)} onUpdate={updateUser} />}
  </div>;
}
