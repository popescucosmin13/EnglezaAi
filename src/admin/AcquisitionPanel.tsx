import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminRequest } from './api';
import { Empty, Panel } from './ui';
import { number, percent } from './metrics';
import { ACQUISITION_FLOW, type AcquisitionEventName, type AcquisitionReport } from '../acquisition/model';

const STEPS: [AcquisitionEventName, string][] = [
  ['first_open', 'Prima deschidere înregistrată'], ['objective_selected', 'Obiectiv ales'],
  ['level_selected', 'Nivel ales'], ['signup_view', 'Formular de înscriere văzut'],
  ['signup_attempt', 'Înscriere trimisă'], ['sign_up', 'Cont creat'],
  ['email_verified', 'Email confirmat'], ['lesson_started', 'Prima lecție începută'],
];
const ERRORS: Record<string, string> = {
  invalid_email: 'Email invalid', weak_password: 'Parolă prea scurtă', password_mismatch: 'Parole diferite',
  terms_required: 'Termeni nebifați', privacy_required: 'Politică nebifată', email_in_use: 'Email deja folosit',
  network: 'Conexiune indisponibilă', too_many_requests: 'Prea multe încercări', email_delivery: 'Trimiterea confirmării a eșuat', unknown: 'Altă eroare de înscriere',
};
export default function AcquisitionPanel({ days, refreshVersion, preview = false }: { days: number; refreshVersion: number; preview?: boolean }) {
  const [report, setReport] = useState<AcquisitionReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setReport(null);
    const request = preview ? Promise.resolve<AcquisitionReport>({ from: '', to: '', flow: ACQUISITION_FLOW, buckets: [] }) : adminRequest<AcquisitionReport>('acquisition', { days });
    request.then(value => { if (active) setReport(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Date indisponibile.'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [days, refreshVersion, preview, reload]);
  const { counts, errors } = useMemo(() => {
    const counts: Partial<Record<AcquisitionEventName, number>> = {}, errors: Record<string, number> = {};
    for (const bucket of report?.buckets || []) {
      if (platform !== 'all' && bucket.platform !== platform) continue;
      for (const [name, value] of Object.entries(bucket.counts)) counts[name as AcquisitionEventName] = (counts[name as AcquisitionEventName] || 0) + value;
      for (const [name, value] of Object.entries(bucket.errors)) errors[name] = (errors[name] || 0) + value;
    }
    return { counts, errors };
  }, [report, platform]);
  const openings = counts.first_open || 0;
  return <Panel title="De la prima deschidere la prima lecție" action={<button disabled={busy} onClick={() => setReload(value => value + 1)}><RefreshCw size={15} /> Actualizează</button>}>
    <p className="muted">Cohorte după ziua în care este înregistrată prima deschidere. Înscrierile și lecțiile făcute ulterior rămân în aceeași cohortă. Fiecare parcurs este numărat o singură dată la fiecare pas.</p>
    <label className="admin-date-filter">Platformă <select value={platform} onChange={event => setPlatform(event.target.value)}><option value="all">Toate</option><option value="android">Android</option><option value="ios">iOS</option><option value="web">Web</option></select></label>
    {error ? <div role="alert" className="admin-notice warning">{error}</div> : busy ? <p role="status">Se încarcă parcursul utilizatorilor…</p> : !openings ? <Empty title="Încă nu există deschideri măsurate">Datele vor apărea după publicarea și folosirea noii versiuni mobile.</Empty> : <>
      <div className="admin-table-wrap"><table><thead><tr><th>Pas</th><th>Parcursuri distincte</th><th>Din deschideri</th></tr></thead><tbody>{STEPS.map(([event, label]) => <tr key={event}><td>{label}</td><td>{number(counts[event] || 0)}</td><td>{percent(counts[event] || 0, openings)}%</td></tr>)}</tbody></table></div>
      <p className="muted">Exercițiu demonstrativ terminat: <strong>{number(counts.demo_complete || 0)}</strong> · Continuare fără exercițiu: <strong>{number(counts.demo_skip || 0)}</strong> · Cu erori la înscriere sau confirmare: <strong>{number(counts.signup_error || 0)}</strong>.</p>
      {Object.values(errors).some(value => value > 0) ? <details><summary>Vezi cauzele erorilor</summary><div className="admin-table-wrap"><table><thead><tr><th>Cauză</th><th>Parcursuri afectate</th></tr></thead><tbody>{Object.entries(errors).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([code, count]) => <tr key={code}><td>{ERRORS[code] || code}</td><td>{number(count)}</td></tr>)}</tbody></table></div></details> : null}
    </>}
    <p className="muted">Măsurarea începe cu această versiune. Deschiderile înregistrate pot include trafic organic și reinstalări; raportul nu atribuie utilizatorii reclamelor Google Ads și nu reprezintă numărul instalărilor din Play Store. Evenimentele offline pot apărea cu întârziere.</p>
  </Panel>;
}
