import { useEffect, useMemo, useRef, useState } from 'react';
import { apiError, apiFetch } from '../api/backend';
import { Icon } from './Icon';
import { RevenueMetrics, StoreApps, storeName, type RevenueMetric, type StoreApp } from '../admin/RevenueMetrics';
import { PLATFORMS, normalizePlatform } from '../admin/platforms';
import { csvCell } from '../admin/metrics';
import type { AdminPage } from '../admin/types';

interface RevenueCatCustomer {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  appVersion: string;
  country: string;
  platform: string;
  platformVersion: string;
  isPro: boolean;
  planKnown?: boolean;
  activeEntitlements: Array<{ id: string; lookupKey: string; displayName: string; expiresAt: number | null }>;
}

interface RevenueCatDashboard {
  configured: boolean;
  customers: RevenueCatCustomer[];
  paginationPending: boolean;
  nextCursor?: string | null;
  generatedAt?: string;
  overview?: RevenueMetric[];
  apps?: StoreApp[];
  revenue30d: { value: number; currency: string } | null;
  warnings: string[];
}

interface RevenueCatCustomerDetail {
  id: string;
  historyPartial?: boolean;
  subscriptions: Array<{
    id: string;
    productName: string;
    status: string;
    givesAccess: boolean;
    pendingPayment: boolean;
    autoRenewalStatus: string;
    currentPeriodEndsAt: number | null;
    environment: string;
    store: string;
    revenueUsd: number | null;
  }>;
  purchases: Array<{
    id: string;
    productName: string;
    status: string;
    purchasedAt: number | null;
    environment: string;
    store: string;
    revenueUsd: number | null;
  }>;
}

function date(value: number | null): string {
  return value ? new Date(value).toLocaleDateString('ro-RO') : '—';
}

function money(value: number | null, currency = 'USD'): string {
  if (value === null || !Number.isFinite(value)) return 'Indisponibil';
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency }).format(value);
}

async function adminAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await apiFetch('admin', { method: 'POST', body: JSON.stringify({ action, ...payload }) });
  if (!response.ok) throw await apiError(response, 'RevenueCat Admin', true);
  return response.json();
}

export default function SubscriptionAdminPanel({ preview = false, registeredPage, onRegisteredUser, onRegisteredRefresh }: {
  preview?: boolean;
  registeredPage: AdminPage | null;
  onRegisteredUser: (uid: string) => void;
  onRegisteredRefresh: () => void;
}) {
  const [dashboard, setDashboard] = useState<RevenueCatDashboard | null>(null);
  const [detail, setDetail] = useState<RevenueCatCustomerDetail | null>(null);
  const [expanded, setExpanded] = useState('');
  const [filter, setFilter] = useState<'accounts' | 'pro' | 'free' | 'anonymous'>('accounts');
  const [platform, setPlatform] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const detailRequest = useRef(0);

  async function loadDashboard(cursor?: string) {
    if (preview) {
      setDashboard({ configured: true, paginationPending: false, overview: [{ id: 'mrr', name: 'MRR', description: '', value: 219, unit: 'EUR', period: 'P0D', updatedAt: Date.now() }, { id: 'active_subscriptions', name: 'Active subscriptions', description: '', value: 24, unit: '#', period: 'P0D', updatedAt: Date.now() }, { id: 'active_trials', name: 'Active trials', description: '', value: 4, unit: '#', period: 'P0D', updatedAt: Date.now() }], apps: [{ id: 'demo-ios', name: 'EnglezaAI iOS', type: 'app_store', identifier: 'com.example.englezaai' }, { id: 'demo-android', name: 'EnglezaAI Android', type: 'play_store', identifier: 'com.example.englezaai' }], revenue30d: { value: 349.9, currency: 'USD' }, warnings: [], customers: [{ id: 'demo-user-1', email: 'andrei.popa@example.com', isAnonymous: false, firstSeenAt: Date.now() - 30 * 86400000, lastSeenAt: Date.now(), appVersion: '1.1.0', country: 'RO', platform: 'ios', platformVersion: '18.6', isPro: true, activeEntitlements: [{ id: 'demo-pro', lookupKey: 'englezaai_pro', displayName: 'EnglezaAI Pro', expiresAt: Date.now() + 30 * 86400000 }] }] });
      setLoading(false); return;
    }
    setLoading(true);
    setError('');
    try {
      const next = await adminAction<RevenueCatDashboard>('revenuecat-dashboard', { paged: true, cursor });
      setDashboard(previous => cursor && previous ? { ...next, customers: [...new Map([...previous.customers, ...next.customers].map(c => [c.id, c])).values()] } : next);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    return () => { detailRequest.current++; };
  }, []);

  async function openCustomer(customerId: string) {
    const requestId = ++detailRequest.current;
    if (expanded === customerId) {
      setExpanded('');
      setDetail(null);
      return;
    }
    setExpanded(customerId);
    setDetail(null);
    setDetailLoading(true);
    setError('');
    try {
      const result = preview ? { id: customerId, subscriptions: [{ id: 'demo-subscription', productName: 'EnglezaAI Pro lunar', status: 'active', givesAccess: true, pendingPayment: false, autoRenewalStatus: 'will_renew', currentPeriodEndsAt: Date.now() + 20 * 86400000, environment: 'sandbox', store: 'app_store', revenueUsd: 0 }], purchases: [] } : await adminAction<RevenueCatCustomerDetail>('revenuecat-customer', { customerId });
      if (requestId === detailRequest.current) setDetail(result);
    } catch (nextError: any) {
      if (requestId === detailRequest.current) setError(String(nextError?.message ?? nextError));
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  async function grant(customerId: string, days: number) {
    if (preview || actionBusy) return;
    if (!window.confirm(`Acorzi EnglezaAI Pro promoțional pentru ${days} de zile utilizatorului ${customerId}?`)) return;
    setActionBusy(customerId);
    setMessage('');
    setError('');
    try {
      await adminAction('grant-pro', { customerId, expiresAt: Date.now() + days * 86_400_000 });
      setMessage(`Acces Pro acordat pentru ${days} de zile.`);
      await loadDashboard();
      onRegisteredRefresh();
      setExpanded('');
      setDetail(null);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setActionBusy('');
    }
  }

  async function revoke(customerId: string) {
    if (preview || actionBusy) return;
    if (!window.confirm(`Setezi contul ${customerId} înapoi pe Free? Se revocă numai accesul Pro acordat manual; un abonament activ din App Store sau Google Play rămâne Pro.`)) return;
    setActionBusy(customerId);
    setMessage('');
    setError('');
    try {
      await adminAction('revoke-pro', { customerId });
      setMessage('Accesul Pro manual a fost revocat; contul este Free dacă nu are un abonament activ.');
      await loadDashboard();
      onRegisteredRefresh();
      setExpanded('');
      setDetail(null);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setActionBusy('');
    }
  }

  const customers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (dashboard?.customers ?? [])
      .filter((customer) => {
        if (filter === 'anonymous') return customer.isAnonymous;
        if (filter === 'accounts') return !customer.isAnonymous;
        if (filter === 'pro') return customer.isPro;
        if (filter === 'free') return !customer.isPro && customer.planKnown !== false;
        return true;
      })
      .filter(customer => platform === 'all' || (normalizePlatform(customer.platform) || 'unknown') === platform)
      .filter((customer) => !needle || `${customer.id} ${customer.email || ''} ${customer.appVersion} ${customer.country}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  }, [dashboard?.customers, filter, search, platform]);

  const identifiedCustomers = dashboard?.customers.filter((customer) => !customer.isAnonymous) ?? [];
  const anonymousCount = dashboard?.customers.filter((customer) => customer.isAnonymous).length ?? 0;
  const proCount = dashboard?.customers.filter((customer) => customer.isPro).length ?? 0;
  const knownPlans = dashboard?.customers.filter(customer => customer.planKnown !== false).length ?? 0;
  const conversion = knownPlans ? Math.round((proCount / knownPlans) * 100) : null;
  const registeredUsers = registeredPage?.users ?? [];
  const linkedRegistered = registeredUsers.filter(user => user.commerce?.status === 'linked').length;
  const unlinkedRegistered = registeredUsers.filter(user => user.commerce?.status === 'unlinked').length;
  const unavailableRegistered = registeredUsers.length - linkedRegistered - unlinkedRegistered;

  function exportCustomers() {
    const rows = [['UID', 'Email', 'Platformă', 'Versiune', 'Sistem', 'Țară', 'Pro', 'Prima accesare', 'Ultima accesare'], ...customers.map(c => [c.id, c.email, c.platform, c.appVersion, c.platformVersion, c.country, c.planKnown === false ? '' : c.isPro ? 'Da' : 'Nu', date(c.firstSeenAt), date(c.lastSeenAt)])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'englezaai-abonamente.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section>
      <div className="card">
        <h2>Conturi înregistrate în aplicație</h2>
        <div className="stat-grid">
          <div className="stat-tile"><div className="value">{registeredPage?.totalUsers ?? '—'}</div><div className="label">profiluri Firebase</div></div>
          <div className="stat-tile"><div className="value">{registeredPage ? linkedRegistered : '—'}</div><div className="label">asociate cu RevenueCat, din {registeredUsers.length} verificate</div></div>
          <div className="stat-tile"><div className="value">{registeredPage ? unlinkedRegistered : '—'}</div><div className="label">fără client RevenueCat, din cele verificate</div></div>
          <div className="stat-tile"><div className="value">{registeredPage ? unavailableRegistered : '—'}</div><div className="label">asociere neconfirmată, din cele verificate</div></div>
        </div>
        <p className="admin-caption">Aceasta este evidența profilurilor Firestore; conturile Firebase Auth fără profil nu apar aici. RevenueCat numără clienți și ID-uri create de SDK, inclusiv înainte de autentificare; un ID care începe cu $RCAnonymousID: poate rămâne asociat unui cont autentificat.</p>
        {registeredPage?.nextCursor && <p className="admin-caption">Sunt verificate {registeredUsers.length} din {registeredPage.totalUsers} profiluri. Încarcă restul profilurilor din bara de sus pentru situația completă.</p>}
        {registeredUsers.length > 0 && <details>
          <summary>Vezi cele {registeredUsers.length} conturi încărcate</summary>
          <div className="admin-table-wrap"><table><thead><tr><th>Cont</th><th>Legătură RevenueCat</th><th>Acces Pro</th><th>Acțiune</th></tr></thead><tbody>{registeredUsers.map(user => <tr key={user.uid}>
            <td>{user.auth?.email || user.profile.email || user.uid}</td>
            <td>{user.commerce?.status === 'linked' ? 'Asociat' : user.commerce?.status === 'unlinked' ? 'Fără client' : 'Neconfirmat'}</td>
            <td>{user.commerce?.isPro === true ? 'Pro activ' : user.commerce?.isPro === false ? 'Fără Pro' : 'Neconfirmat'}</td>
            <td><button onClick={() => onRegisteredUser(user.uid)}>Vezi contul</button></td>
          </tr>)}</tbody></table></div>
        </details>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2>Abonamente RevenueCat</h2>
        <a className="btn" href="https://app.revenuecat.com" target="_blank" rel="noreferrer"><Icon name="arrowUpRight" />RevenueCat</a>
      </div>
      {dashboard && <RevenueMetrics metrics={dashboard.overview || []} />}
      {dashboard && <StoreApps apps={dashboard.apps || []} />}
      <div className="card">
        <div className="stat-grid">
          <div className="stat-tile"><div className="value">{dashboard ? identifiedCustomers.length : '—'}</div><div className="label">ID-uri RevenueCat neanonime încărcate</div></div>
          <div className="stat-tile"><div className="value">{dashboard ? proCount : '—'}</div><div className="label">clienți RevenueCat cu Pro activ</div></div>
          <div className="stat-tile"><div className="value">{dashboard && conversion !== null ? `${conversion}%` : '—'}</div><div className="label">Pro din {knownPlans} clienți RC cu plan confirmat</div></div>
          <div className="stat-tile"><div className="value">{dashboard?.revenue30d ? money(dashboard.revenue30d.value, dashboard.revenue30d.currency) : '—'}</div><div className="label">venit brut 30 zile</div></div>
        </div>
        {loading && <p className="tiny"><span className="spinner" /> Se sincronizează cu RevenueCat…</p>}
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="info-banner"><Icon name="checkCircle" />{message}</div>}
        {dashboard?.paginationPending && <div className="info-banner">Lista RevenueCat este parțială. Numărătorile și ponderea Pro se referă numai la clienții încărcați, nu la toate conturile înregistrate.</div>}
        {dashboard?.warnings?.length ? <div className="info-banner"><details><summary>Unele date RevenueCat nu au putut fi sincronizate ({dashboard.warnings.length})</summary>{dashboard.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</details></div> : null}
        <div className="btn-row">
          <button className={filter === 'accounts' ? 'btn-primary' : ''} onClick={() => setFilter('accounts')}>ID-uri neanonime RC</button>
          <button className={filter === 'pro' ? 'btn-primary' : ''} onClick={() => setFilter('pro')}>Pro</button>
          <button className={filter === 'free' ? 'btn-primary' : ''} onClick={() => setFilter('free')}>Fără Pro</button>
          <button className={filter === 'anonymous' ? 'btn-primary' : ''} onClick={() => setFilter('anonymous')}>ID-uri anonime RC ({anonymousCount})</button>
          <button onClick={() => void loadDashboard()} disabled={loading}><Icon name="rotate" />Reîncarcă</button>
        </div>
        <label className="field">
          <span>Caută după email, UID, versiune sau țară</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email, UID, 1.1.2 sau RO…" />
        </label><div className="admin-filters"><label>Platformă<select value={platform} onChange={e => setPlatform(e.target.value)}><option value="all">Toate platformele</option>{Object.entries(PLATFORMS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button disabled={!customers.length} onClick={exportCustomers}>Exportă rezultatele CSV</button>{dashboard?.nextCursor && <button disabled={loading} onClick={() => void loadDashboard(dashboard.nextCursor!)}>Încarcă următorii 25 de clienți</button>}</div><p className="admin-caption">{customers.length} rezultate din {dashboard?.customers.length || 0} clienți încărcați. Pro include și accesul promoțional. Venitul brut și indicatorii globali nu se filtrează cu lista.</p>
      </div>

      {customers.map((customer) => (
        <div className="card" key={customer.id}>
          <button
            className="btn-ghost"
            style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 10 }}
            onClick={() => void openCustomer(customer.id)}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>
                {customer.email || (customer.isAnonymous ? 'ID anonim RevenueCat' : customer.id)}
              </strong>
              <span className="tiny">{PLATFORMS[normalizePlatform(customer.platform) || 'unknown']} {customer.platformVersion && `· OS ${customer.platformVersion}`} {customer.appVersion ? `· v${customer.appVersion}` : ''} {customer.country ? `· ${customer.country}` : ''}</span>
            </span>
            <span className="badge">{customer.planKnown === false ? 'PLAN NECONFIRMAT' : customer.isPro ? 'PRO ACTIV' : 'FĂRĂ PRO'}</span>
            <Icon name={expanded === customer.id ? 'chevronUp' : 'chevronDown'} />
          </button>
          <p className="tiny" style={{ overflowWrap: 'anywhere' }}>UID: {customer.id} · prima accesare {date(customer.firstSeenAt)} · ultima {date(customer.lastSeenAt)}</p>
          {customer.activeEntitlements.map((entitlement) => <p className="tiny" key={entitlement.id}>{entitlement.displayName} · expiră {date(entitlement.expiresAt)}</p>)}

          {expanded === customer.id && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
              {detailLoading && <p className="tiny"><span className="spinner" /> Se încarcă istoricul comercial…</p>}
              {detail && (
                <>
                  {detail.historyPartial && <p className="info-banner">Istoricul este parțial: sunt încărcate cel mult 300 de înregistrări din fiecare categorie.</p>}
                  <h3>Abonamente</h3>
                  {detail.subscriptions.length ? detail.subscriptions.map((subscription) => (
                    <div className="routine-item" key={subscription.id} style={{ alignItems: 'flex-start' }}>
                      <span style={{ flex: 1 }}>
                        <strong>{subscription.productName}</strong>
                        <span className="tiny" style={{ display: 'block' }}>{subscription.environment === 'sandbox' ? 'TEST / SANDBOX' : subscription.environment === 'production' ? 'PRODUCȚIE' : subscription.environment || 'Mediu necunoscut'} · {storeName(subscription.store)} · reînnoire {subscription.autoRenewalStatus}</span>
                        <span className="tiny" style={{ display: 'block' }}>Acces {subscription.givesAccess ? 'activ' : 'inactiv'} · până la {date(subscription.currentPeriodEndsAt)} · venit {money(subscription.revenueUsd)}</span>
                      </span>
                      <span className="badge">{subscription.pendingPayment ? 'PLATĂ ÎN AȘTEPTARE' : subscription.status}</span>
                    </div>
                  )) : <p className="tiny">Niciun abonament.</p>}

                  <h3>Achiziții unice</h3>
                  {detail.purchases.length ? detail.purchases.map((purchase) => (
                    <div className="routine-item" key={purchase.id}>
                      <span style={{ flex: 1 }}><strong>{purchase.productName}</strong><span className="tiny" style={{ display: 'block' }}>{date(purchase.purchasedAt)} · {purchase.environment === 'sandbox' ? 'TEST / SANDBOX' : purchase.environment || 'Mediu necunoscut'} · {storeName(purchase.store)} · {money(purchase.revenueUsd)}</span></span>
                      <span className="badge">{purchase.status}</span>
                    </div>
                  )) : <p className="tiny">Nicio achiziție Lifetime.</p>}

                  <h3>Plan setat manual</h3>
                  <div className="btn-row">
                    <button onClick={() => void grant(customer.id, 30)} disabled={preview || Boolean(actionBusy)}>Setează Pro · 30 zile</button>
                    <button onClick={() => void grant(customer.id, 365)} disabled={preview || Boolean(actionBusy)}>Setează Pro · 1 an</button>
                    <button onClick={() => void grant(customer.id, 3650)} disabled={preview || Boolean(actionBusy)}>Setează Pro · 10 ani</button>
                    <button className="btn-danger" onClick={() => void revoke(customer.id)} disabled={preview || Boolean(actionBusy)}>Revocă Pro manual</button>
                  </div>
                  <p className="tiny">Accesul promoțional de 10 ani are o dată de expirare și poate fi revocat oricând. Setarea Free elimină numai entitlement-ul acordat manual; abonamentele plătite se gestionează în App Store, Google Play sau RevenueCat.</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {!loading && dashboard && customers.length === 0 ? <div className="info-banner">Nu există clienți pentru filtrul selectat.</div> : null}
    </section>
  );
}
