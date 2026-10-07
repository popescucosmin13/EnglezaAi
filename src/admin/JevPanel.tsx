import { summarizeJev, type JevRouteLabel, type JevTask, type TelemetryBucket, type TelemetryPage } from './telemetry';
import { number } from './metrics';
import { Empty, Panel } from './ui';

const TASK_LABELS: Record<JevTask, string> = { turn_analysis: 'Analiză replică', batch_analysis: 'Analiză batch' };
const ROUTE_LABELS: Record<JevRouteLabel, string> = { utility: 'Utilitar', premium: 'Premium', uncertain: 'Neconcludent', error: 'Eroare Jev' };
const money = (cost: number, reported: number) => reported
  ? `${cost.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} USD`
  : '—';
const duration = (sum: number, count: number) => count
  ? `${(sum / count / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} s`
  : '—';

export default function JevPanel({ data, buckets, preview }: { data: TelemetryPage | null; buckets: TelemetryBucket[]; preview: boolean }) {
  const { attempts, analysisCalls, decisions } = summarizeJev(buckets);
  const routeCount = (route: JevRouteLabel) => decisions.filter(row => row.route === route).reduce((sum, row) => sum + row.requests, 0);
  const status = preview ? 'Previzualizare' : !data?.router ? 'Necunoscut' : data.router.mode === 'shadow'
    ? data.router.keyConfigured ? 'Shadow activ' : 'Cheie OpenRouter lipsă'
    : 'Oprit';
  const statusTone = status === 'Shadow activ' ? 'green' : 'amber';
  const covered = analysisCalls.requests ? `${Math.round(attempts.requests / analysisCalls.requests * 100)}%` : '—';
  return <Panel title="Jev · decizii de rutare" caption="Clasificare prin OpenRouter pentru analiza replicilor și analiza batch" action={<span className={`admin-badge ${statusTone}`}>{status}</span>}>
    <p className="admin-caption">Model: {data?.router?.model || 'typesafe/jev-1.13'} · modul shadow măsoară recomandările, iar răspunsurile elevilor folosesc în continuare modelele existente. Valorile de mai jos respectă utilizatorul selectat și perioada aleasă.</p>
    {attempts.requests ? <>
      <div className="admin-small-stats">
        <div><span>Decizii Jev valide</span><strong>{number(attempts.requests - attempts.errors)}</strong></div>
        <div><span>Recomandări utilitar</span><strong>{number(routeCount('utility'))}</strong></div>
        <div><span>Recomandări premium</span><strong>{number(routeCount('premium'))}</strong></div>
        <div><span>Neconcludente / erori</span><strong>{number(routeCount('uncertain') + routeCount('error'))}</strong></div>
      </div>
      <div className="admin-collection-grid admin-jev-grid">
        <div><strong>{money(attempts.costUsd, attempts.costReported)}</strong><span>Cost Jev raportat · {attempts.costReported}/{attempts.requests} apeluri cu cost cunoscut</span></div>
        <div><strong>{duration(attempts.durationMs, attempts.requests)}</strong><span>Durată medie Jev · inclusiv apeluri eșuate</span></div>
        <div><strong>{covered}</strong><span>Apeluri Jev față de {number(analysisCalls.requests)} apeluri de analiză existente</span></div>
        <div><strong>{money(analysisCalls.costUsd, analysisCalls.costReported)}</strong><span>Costul analizei existente · {number(analysisCalls.requests)} apeluri</span></div>
      </div>
      <div className="admin-table-wrap"><table><thead><tr><th>Sarcină</th><th>Recomandare</th><th>Apeluri</th><th>Cost cunoscut</th><th>Durată medie</th></tr></thead><tbody>{decisions.map(row => <tr key={`${row.task}:${row.route}`}><td>{TASK_LABELS[row.task]}</td><td>{ROUTE_LABELS[row.route]}</td><td>{number(row.requests)}</td><td>{money(row.costUsd, row.costReported)}</td><td>{duration(row.durationMs, row.requests)}</td></tr>)}</tbody></table></div>
      <p className="admin-caption">Acoperirea poate fi sub 100% pentru răspunsuri prea lungi sau date încărcate parțial. Recomandările Jev nu reprezintă economii realizate și nu dovedesc singure calitatea corectărilor. Pentru activarea rutării sunt necesare exemple evaluate manual.</p>
    </> : <Empty title="Încă nu există decizii Jev în perioada aleasă">{preview ? 'Previzualizarea nu trimite cereri Jev.' : status === 'Shadow activ' ? 'Deciziile vor apărea după primele analize eligibile.' : 'Activează JEV_ROUTER_MODE=shadow pe server pentru a măsura recomandările.'}</Empty>}
  </Panel>;
}
