import { Activity, CalendarDays, Repeat2, UserMinus, Smartphone, ShieldCheck } from 'lucide-react';
import { clientDistribution, growthInsights } from './insights';
import { userClient, userPlatform } from './platforms';
import { activeDay, email, number, percent } from './metrics';
import type { AdminUser } from './types';
import { Bars, Empty, Panel, Stat } from './ui';

export function GrowthPanel({ users, days, today, ready, onUser }: { users: AdminUser[]; days: number; today: string; ready: boolean; onUser: (id: string) => void }) {
  if (!ready) return <Empty title="Statisticile se încarcă" />;
  const stats = growthInsights(users, days, today);
  const retention = (entry: { eligible: number; returned: number }) => entry.eligible ? `${percent(entry.returned, entry.eligible)}% · ${entry.returned}/${entry.eligible}` : 'În așteptare';
  const periodStart = stats.cohorts.length ? stats.cohorts[stats.cohorts.length - 1].from : today;
  const engaged = [...users].map(user => ({ user, days: new Set(user.activity.filter(a => a.date && a.date >= periodStart && a.date <= today && activeDay(a)).map(a => a.date)).size })).filter(u => u.days > 0).sort((a, b) => b.days - a.days).slice(0, 8);
  return <>
    <div className="admin-stats-grid">
      <Stat label="Activi astăzi / DAU" value={number(stats.daily)} note="Ziua curentă este în curs" icon={Activity} tone="green" />
      <Stat label="Activi în 7 zile / WAU" value={number(stats.weekly)} note="Conturi distincte cu activitate" icon={CalendarDays} tone="blue" />
      <Stat label="Au revenit" value={stats.prior ? `${percent(stats.returning, stats.prior)}%` : '—'} note={`${stats.returning} din ${stats.prior} activi în perioada precedentă`} icon={Repeat2} />
      <Stat label="Nu au revenit" value={number(stats.lost)} note="Activi anterior, fără activitate acum" icon={UserMinus} tone="orange" />
    </div>
    <div className="admin-dashboard-grid">
      <Panel title="Revenire după înregistrare" caption="Cohorte săptămânale · activitate exact în ziua 1 și ziua 7"><div className="admin-table-wrap"><table><thead><tr><th>Înregistrare</th><th>Conturi</th><th>Ziua 1</th><th>Ziua 7</th></tr></thead><tbody>{stats.cohorts.map(c => <tr key={c.from}><td>{c.from.slice(5)} → {c.to.slice(5)}</td><td>{c.count}</td><td>{retention(c.d1)}</td><td>{retention(c.d7)}</td></tr>)}</tbody></table></div><p className="admin-caption">Procentul include numai conturile pentru care ziua măsurată s-a încheiat. Fără conturi eligibile, nu afișăm 0%. Datele lipsă din activitatea colectată pot reduce rata măsurată.</p></Panel>
      <Panel title="Frecvența utilizării" caption="Din profilurile încărcate"><div className="admin-detail-stats"><div><strong>{stats.monthly === null ? '—' : number(stats.monthly)}</strong><small>Activi în 30 de zile / MAU</small></div><div><strong>{stats.monthly ? `${percent(stats.daily, stats.monthly)}%` : '—'}</strong><small>DAU / MAU</small></div></div><p className="admin-caption">{stats.monthly === null ? 'Alege 30 sau 90 de zile pentru MAU.' : 'MAU și DAU folosesc ferestre fixe, inclusiv ziua curentă.'}</p><Bars items={[{ label: 'Activi în perioada aleasă', value: stats.current }, { label: 'Activi în ambele perioade', value: stats.returning }, { label: 'Fără revenire în perioada curentă', value: stats.lost }]} /></Panel>
    </div>
    <Panel title="Conturi cu activitate constantă" caption={`Zile distincte cu activitate · ultimele ${days} zile`}>{engaged.length ? <div className="admin-engaged-grid">{engaged.map(({ user, days: active }) => <button className="admin-engaged" key={user.uid} onClick={() => onUser(user.uid)}><span><strong>{email(user)}</strong><small>{user.profile.currentLevel || 'Nivel nestabilit'} · {user.profile.streak || 0} zile streak</small></span><b>{active}<small> zile active</small></b></button>)}</div> : <Empty title="Nicio activitate măsurată în interval" />}</Panel>
  </>;
}

export function AppsPanel({ users, days, today, ready, onUser }: { users: AdminUser[]; days: number; today: string; ready: boolean; onUser: (id: string) => void }) {
  if (!ready) return <Empty title="Datele aplicațiilor se încarcă" />;
  const stats = growthInsights(users, days, today);
  const unknown = users.filter(u => userPlatform(u) === 'unknown');
  const recovered = users.filter(u => userClient(u).source === 'revenuecat').length;
  return <>
    <div className="admin-stats-grid">{stats.platformRows.map(row => <Stat key={row.platform} label={row.platform === 'unknown' ? 'Platformă neînregistrată' : row.label} value={number(row.count)} icon={row.platform === 'unknown' ? ShieldCheck : Smartphone} note={`${row.active} activi în interval · ${row.pro} cu acces Pro`} tone={row.platform === 'ios' ? 'blue' : row.platform === 'android' ? 'green' : 'purple'} />)}</div>
    <div className="admin-notice"><ShieldCheck size={18} /><span>{recovered} conturi identificate din observațiile RevenueCat. Platforma reprezintă ultima aplicație observată; accesul în browser pe iPhone este Web. Pro include și accesul promoțional. {users.filter(u => u.commerce?.isPro == null).length} planuri nu au putut fi confirmate.</span></div>
    <div className="admin-dashboard-grid"><Panel title="Versiunile folosite" caption="Ultima versiune observată pentru fiecare cont"><Bars items={clientDistribution(users, 'version')} /></Panel><Panel title="Țările utilizatorilor" caption="Ultima țară raportată de RevenueCat"><Bars items={clientDistribution(users, 'country')} /></Panel></div>
    <Panel title="Calitatea datelor despre aplicație" caption="Datele vechi pot fi completate din RevenueCat fără reinstalare">{unknown.length ? <><p className="admin-caption">Pentru {unknown.length} conturi nu există încă o platformă validă nici în profil, nici în observațiile RevenueCat. Nu putem atribui în mod sigur aceste conturi la iOS sau Android.</p><div className="admin-table-wrap"><table><thead><tr><th>Cont</th><th>RevenueCat</th><th>Acțiune</th></tr></thead><tbody>{unknown.map(u => <tr key={u.uid}><td>{email(u)}</td><td>{u.commerce?.status === 'unavailable' || !u.commerce ? 'Date indisponibile' : u.commerce.status === 'unlinked' ? 'Client inexistent pentru acest UID' : 'Client găsit, platformă lipsă'}</td><td><button onClick={() => onUser(u.uid)}>Vezi contul</button></td></tr>)}</tbody></table></div></> : <div className="admin-notice success"><ShieldCheck size={18} />Toate conturile încărcate au o platformă identificată.</div>}</Panel>
  </>;
}
