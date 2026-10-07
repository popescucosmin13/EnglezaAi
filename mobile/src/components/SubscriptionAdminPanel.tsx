import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { apiError, apiFetch } from '../api/backend';
import { Icon } from './Icon';
import { Banner, Button, ButtonRow, Card, Field, H2, H3, KvRow, Pill, StatGrid, StatTile, Tiny, confirm } from '../ui';
import { usePalette } from '../theme';

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
  proLookupKey: string;
  customers: RevenueCatCustomer[];
  paginationPending: boolean;
  overview: Array<{ id: string; name: string; value: number; unit: string; period: string }>;
  revenue30d: { value: number; currency: string } | null;
  warnings: string[];
}

interface RevenueCatCustomerDetail {
  id: string;
  subscriptions: Array<{
    id: string;
    productId: string;
    productName: string;
    status: string;
    givesAccess: boolean;
    pendingPayment: boolean;
    autoRenewalStatus: string;
    currentPeriodEndsAt: number | null;
    environment: string;
    store: string;
    country: string;
    revenueUsd: number | null;
  }>;
  purchases: Array<{
    id: string;
    productId: string;
    productName: string;
    status: string;
    purchasedAt: number | null;
    environment: string;
    store: string;
    country: string;
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

export default function SubscriptionAdminPanel() {
  const p = usePalette();
  const [dashboard, setDashboard] = useState<RevenueCatDashboard | null>(null);
  const [detail, setDetail] = useState<RevenueCatCustomerDetail | null>(null);
  const [expanded, setExpanded] = useState('');
  const [filter, setFilter] = useState<'accounts' | 'pro' | 'free' | 'anonymous'>('accounts');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadDashboard() {
    setLoading(true);
    setError('');
    try {
      setDashboard(await adminAction<RevenueCatDashboard>('revenuecat-dashboard'));
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  async function openCustomer(customerId: string) {
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
      setDetail(await adminAction<RevenueCatCustomerDetail>('revenuecat-customer', { customerId }));
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setDetailLoading(false);
    }
  }

  async function grant(customerId: string, days: number) {
    if (!(await confirm(`Acorzi EnglezaAI Pro promoțional pentru ${days} de zile utilizatorului ${customerId}?`))) return;
    setActionBusy(customerId);
    setMessage('');
    setError('');
    try {
      await adminAction('grant-pro', { customerId, expiresAt: Date.now() + days * 86_400_000 });
      setMessage(`Acces Pro acordat pentru ${days} de zile.`);
      await loadDashboard();
      setExpanded('');
      setDetail(null);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setActionBusy('');
    }
  }

  async function revoke(customerId: string) {
    if (!(await confirm(`Setezi contul ${customerId} înapoi pe Free? Se revocă numai accesul Pro acordat manual; un abonament activ din App Store sau Google Play rămâne Pro.`))) return;
    setActionBusy(customerId);
    setMessage('');
    setError('');
    try {
      await adminAction('revoke-pro', { customerId });
      setMessage('Accesul Pro manual a fost revocat; contul este Free dacă nu are un abonament activ.');
      await loadDashboard();
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
        if (customer.isAnonymous) return false;
        if (filter === 'pro') return customer.isPro;
        if (filter === 'free') return !customer.isPro && customer.planKnown !== false;
        return true;
      })
      .filter((customer) => !needle || customer.id.toLowerCase().includes(needle) || customer.email?.toLowerCase().includes(needle));
  }, [dashboard?.customers, filter, search]);

  const identifiedCustomers = dashboard?.customers.filter((customer) => !customer.isAnonymous) ?? [];
  const anonymousCount = dashboard?.customers.filter((customer) => customer.isAnonymous).length ?? 0;
  const proCount = identifiedCustomers.filter((customer) => customer.isPro).length;
  const knownPlans = identifiedCustomers.filter(customer => customer.planKnown !== false).length;
  const conversion = knownPlans ? Math.round((proCount / knownPlans) * 100) : null;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <H2 style={{ flex: 1 }}>Abonamente RevenueCat</H2>
        <Button title="RevenueCat" small icon="arrowUpRight" onPress={() => void Linking.openURL('https://app.revenuecat.com')} />
      </View>
      <Card>
        <StatGrid>
          <StatTile value={dashboard ? identifiedCustomers.length : '—'} label="conturi identificate" />
          <StatTile value={proCount} label="Pro activ" />
          <StatTile value={conversion === null ? '—' : `${conversion}%`} label="Pro din planuri confirmate" />
          <StatTile value={dashboard?.revenue30d ? money(dashboard.revenue30d.value, dashboard.revenue30d.currency) : '—'} label="venit brut 30 zile" />
        </StatGrid>
        {loading ? <Tiny style={{ marginTop: 10 }}>Se sincronizează cu RevenueCat…</Tiny> : null}
        {error ? <Banner kind="error">{error}</Banner> : null}
        {message ? <Banner kind="success">{message}</Banner> : null}
        {dashboard?.warnings?.length ? <Banner kind="warn">Metricile financiare necesită permisiunea `charts_metrics:overview:read` pe cheia RevenueCat v2.</Banner> : null}
        {dashboard?.paginationPending ? <Banner kind="warn">Sunt afișați primii 100 de clienți RevenueCat. Pentru volume mai mari trebuie adăugată paginarea.</Banner> : null}
        <ButtonRow style={{ marginBottom: 0 }}>
          <Button title="Conturi" small variant={filter === 'accounts' ? 'primary' : 'ghost'} onPress={() => setFilter('accounts')} />
          <Button title="Pro" small variant={filter === 'pro' ? 'primary' : 'ghost'} onPress={() => setFilter('pro')} />
          <Button title="Fără Pro" small variant={filter === 'free' ? 'primary' : 'ghost'} onPress={() => setFilter('free')} />
          <Button title={`Anonimi (${anonymousCount})`} small variant={filter === 'anonymous' ? 'primary' : 'ghost'} onPress={() => setFilter('anonymous')} />
          <Button title="Reîncarcă" small icon="rotate" disabled={loading} onPress={() => void loadDashboard()} />
        </ButtonRow>
        <Field label="Caută după email sau UID" value={search} onChange={setSearch} autoCapitalize="none" />
      </Card>

      {customers.map((customer) => (
        <Card key={customer.id} style={{ marginTop: 10 }}>
          <Pressable onPress={() => void openCustomer(customer.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: p.ink, fontWeight: '800' }}>
                {customer.email || (customer.isAnonymous ? 'Client anonim RevenueCat' : customer.id)}
              </Text>
              <Tiny>{customer.platform || 'platformă necunoscută'} {customer.appVersion ? `· v${customer.appVersion}` : ''} {customer.country ? `· ${customer.country}` : ''}</Tiny>
            </View>
            <Pill kind={customer.isPro ? 'badge' : 'badgeSoft'}>{customer.planKnown === false ? 'PLAN NECONFIRMAT' : customer.isPro ? 'PRO ACTIV' : 'FĂRĂ PRO'}</Pill>
            <Icon name={expanded === customer.id ? 'chevronUp' : 'chevronDown'} size={18} color={p.muted} />
          </Pressable>
          <Tiny style={{ marginTop: 7 }}>UID: {customer.id}</Tiny>
          <Tiny>Prima accesare: {date(customer.firstSeenAt)} · ultima: {date(customer.lastSeenAt)}</Tiny>
          {customer.activeEntitlements.map((entitlement) => (
            <Tiny key={entitlement.id}>{entitlement.displayName} · expiră: {date(entitlement.expiresAt)}</Tiny>
          ))}

          {expanded === customer.id ? (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 10 }}>
              {detailLoading ? <Tiny>Se încarcă istoricul comercial…</Tiny> : null}
              {detail ? (
                <>
                  <H3>Abonamente</H3>
                  {detail.subscriptions.length ? detail.subscriptions.map((subscription) => (
                    <View key={subscription.id} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: p.border }}>
                      <KvRow k={subscription.productName} v={subscription.status} />
                      <Tiny>{subscription.environment || '—'} · {subscription.store || '—'} · reînnoire: {subscription.autoRenewalStatus}</Tiny>
                      <Tiny>Acces: {subscription.givesAccess ? 'da' : 'nu'} · perioadă până la {date(subscription.currentPeriodEndsAt)} · venit {money(subscription.revenueUsd)}</Tiny>
                      {subscription.pendingPayment ? <Banner kind="warn">Plată în așteptare / billing issue.</Banner> : null}
                    </View>
                  )) : <Tiny>Niciun abonament.</Tiny>}

                  <H3>Achiziții unice</H3>
                  {detail.purchases.length ? detail.purchases.map((purchase) => (
                    <View key={purchase.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: p.border }}>
                      <KvRow k={purchase.productName} v={purchase.status} />
                      <Tiny>{date(purchase.purchasedAt)} · {purchase.environment || '—'} · venit {money(purchase.revenueUsd)}</Tiny>
                    </View>
                  )) : <Tiny>Nicio achiziție Lifetime.</Tiny>}

                  <H3>Plan setat manual</H3>
                  <ButtonRow style={{ marginBottom: 0 }}>
                    <Button title="Pro · 30 zile" small busy={actionBusy === customer.id} onPress={() => void grant(customer.id, 30)} />
                    <Button title="Pro · 1 an" small busy={actionBusy === customer.id} onPress={() => void grant(customer.id, 365)} />
                    <Button title="Pro · permanent" small busy={actionBusy === customer.id} onPress={() => void grant(customer.id, 3650)} />
                    <Button title="Setează Free" small variant="danger" busy={actionBusy === customer.id} onPress={() => void revoke(customer.id)} />
                  </ButtonRow>
                  <Tiny>„Permanent” acordă 10 ani și poate fi revocat oricând. Setarea Free elimină numai entitlement-ul acordat manual; abonamentele plătite se gestionează în App Store, Google Play sau RevenueCat.</Tiny>
                </>
              ) : null}
            </View>
          ) : null}
        </Card>
      ))}
      {!loading && dashboard && customers.length === 0 ? <Banner kind="info">Nu există clienți pentru filtrul selectat.</Banner> : null}
    </>
  );
}
