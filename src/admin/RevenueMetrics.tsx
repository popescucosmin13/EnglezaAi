import { CreditCard, TrendingUp, Users, FlaskConical } from 'lucide-react';
import { number } from './metrics';
import { Panel, Stat } from './ui';

export interface RevenueMetric { id: string; name: string; description: string; value: number | null; unit: string; period: string; updatedAt: number | null }
export interface StoreApp { id: string; name: string; type: string; identifier: string }
const labels: Record<string, string> = { mrr: 'Venit lunar recurent / MRR', active_subscriptions: 'Abonamente active', active_trials: 'Perioade de probă active', revenue: 'Venituri', new_customers: 'Clienți noi RevenueCat', active_users: 'Clienți activi RevenueCat' };
export function storeName(store: string) { return ({ app_store: 'App Store · iOS', play_store: 'Google Play · Android', stripe: 'Stripe · Web', rc_billing: 'Web Billing', promotional: 'Promoțional', test_store: 'RevenueCat Test Store', mac_app_store: 'Mac App Store' } as Record<string, string>)[store] || store || 'Magazin neînregistrat'; }
function metricValue(metric: RevenueMetric) {
  if (metric.value === null) return '—';
  const currency = metric.unit === '$' || metric.unit === '€' ? 'EUR' : /^[A-Z]{3}$/.test(metric.unit) ? metric.unit : null;
  if (currency) { try { return new Intl.NumberFormat('ro-RO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(metric.value); } catch { /* Display provider's unit below. */ } }
  return `${number(metric.value)}${metric.unit === '%' ? '%' : ''}`;
}
export function RevenueMetrics({ metrics }: { metrics: RevenueMetric[] }) {
  return <Panel title="Indicatori comerciali globali" caption="Raportați de RevenueCat pentru întregul proiect; independenți de lista de clienți încărcată">{metrics.length ? <div className="admin-stats-grid admin-revenue-metrics">{metrics.map(metric => <Stat key={metric.id} label={labels[metric.id] || metric.name} value={metricValue(metric)} icon={metric.id.includes('trial') ? FlaskConical : metric.id.includes('mrr') || metric.id.includes('revenue') ? TrendingUp : metric.id.includes('subscription') ? CreditCard : Users} note={`${metric.period === 'P0D' ? 'Situație curentă' : /^P\d+D$/.test(metric.period) ? `Ultimele ${metric.period.slice(1, -1)} zile` : metric.period || 'Perioadă furnizată de RevenueCat'}${metric.updatedAt ? ` · ${new Date(metric.updatedAt).toLocaleString('ro-RO')}` : ''}`} />)}</div> : <p className="admin-caption">Indicatorii financiari nu sunt disponibili. Verifică mesajele de sincronizare și permisiunea charts_metrics:overview:read a cheii RevenueCat.</p>}</Panel>;
}
export function StoreApps({ apps }: { apps: StoreApp[] }) {
  if (!apps.length) return null;
  return <Panel title="Aplicații conectate la RevenueCat" caption="Catalogul real al proiectului"><div className="admin-store-apps">{apps.map(app => <article key={app.id}><span className="admin-badge purple">{storeName(app.type)}</span><h3>{app.name || 'Nume neconfigurat'}</h3><code>{app.identifier || app.id}</code><small>ID aplicație: {app.id}</small></article>)}</div></Panel>;
}
