import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { adminRequest } from './api';
import { number } from './metrics';
import { telemetryByUser, telemetryTotals, type TelemetryBucket, type TelemetryPage } from './telemetry';
import { Bars, Empty, Panel } from './ui';
import JevPanel from './JevPanel';

export default function TelemetryPanel({ days, preview = false, refreshVersion = 0 }: { days: number; preview?: boolean; refreshVersion?: number }) {
  const [data, setData] = useState<TelemetryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [version, setVersion] = useState(0);
  const generation = useRef(0);
  async function load(cursor?: TelemetryPage['nextCursor'], request = generation.current) {
    setBusy(true); setError('');
    try {
      // The development preview never makes authenticated calls or fabricates a live history.
      const result = preview ? { buckets: [], nextCursor: null, from: '', to: '' } : await adminRequest<TelemetryPage>('ai-telemetry', { days, cursor });
      if (request === generation.current) setData(previous => cursor && previous ? { ...result, buckets: [...new Map([...previous.buckets, ...result.buckets].map(b => [b.id, b])).values()] } : result);
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (request === generation.current) setBusy(false); }
  }
  useEffect(() => { const request = ++generation.current; setData(null); setSelected(''); void load(null, request); return () => { generation.current++; }; }, [days, preview, version, refreshVersion]);
  const users = useMemo(() => telemetryByUser(data?.buckets || []), [data]);
  const filteredUsers = users.filter(u => `${u.email} ${u.uid}`.toLowerCase().includes(search.trim().toLowerCase()));
  const buckets = (data?.buckets || []).filter(b => !selected || b.uid === selected);
  const totals = telemetryTotals(buckets);
  const money = (cost: number, reported: number) => reported ? `${cost.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USD` : '—';
  const duration = (sum: number, requests: number) => requests ? `${(sum / requests / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 2 })} s` : '—';
  const grouped = (field: 'feature' | 'model') => {
    const groups = new Map<string, TelemetryBucket[]>();
    for (const bucket of buckets) groups.set(bucket[field], [...(groups.get(bucket[field]) || []), bucket]);
    return [...groups].map(([label, values]) => ({ label, ...telemetryTotals(values) })).sort((a, b) => b.totalTokens - a.totalTokens);
  };
  return <>
    <div className="admin-notice"><span><strong>Telemetrie centralizată per utilizator · OpenRouter.</strong> Cumulează apelurile de pe web și mobil, de la activarea colectării pe server. Include conversațiile, transcrierile și celelalte funcții care trec prin OpenRouter. TTS, Azure și LanguageTool nu sunt incluse. Nu sunt stocate conversații sau înregistrări audio.</span></div>
    <Panel title="Consum AI per utilizator" caption={`Ultimele ${days} zile · Europe/Bucharest · apeluri efectiv trimise către furnizor, inclusiv Jev`} action={<button disabled={busy} onClick={() => setVersion(v => v + 1)}><RefreshCw size={15} />Actualizează telemetria</button>}>
      {error && <div className="admin-notice error" role="alert">{error}</div>}
      {busy && <p role="status" className="admin-caption">Se încarcă telemetria de pe server…</p>}
      {data?.nextCursor && <div className="admin-notice warning"><span>Date parțiale: {data.buckets.length} grupuri zilnice încărcate. Totalurile și căutarea se referă numai la acestea.</span><button disabled={busy} onClick={() => void load(data.nextCursor)}>Încarcă următoarele 500</button></div>}
      <label className="admin-search"><Search size={16} /><span className="admin-sr-only">Caută în telemetrie</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută email sau UID…" /></label>
      {filteredUsers.length > 0 ? <div className="admin-table-wrap"><table><thead><tr><th>Utilizator</th><th>Apeluri</th><th>Erori</th><th>Tokeni</th><th>Cost raportat</th><th>Cost cunoscut</th><th>Durată medie</th></tr></thead><tbody>{filteredUsers.map(u => <tr key={u.uid}><td><button className="admin-text-button" aria-pressed={selected === u.uid} onClick={() => setSelected(selected === u.uid ? '' : u.uid)}>{u.email}</button></td><td>{number(u.requests)}</td><td>{number(u.errors)}</td><td>{u.tokensReported ? number(u.totalTokens) : '—'}</td><td>{money(u.costUsd, u.costReported)}</td><td>{u.costReported}/{u.requests} apeluri</td><td>{duration(u.durationMs, u.requests)}</td></tr>)}</tbody></table></div> : !busy && <Empty title={error ? 'Telemetria nu este disponibilă' : search ? 'Niciun utilizator găsit' : 'Nu există încă telemetrie centralizată'}>{preview ? 'Previzualizarea nu generează apeluri AI. Datele reale vor apărea în panoul autentificat.' : 'Datele apar după deploy-ul backendului și primele apeluri AI. Istoricul local vechi nu este importat.'}</Empty>}
    </Panel>
    <JevPanel data={data} buckets={buckets} preview={preview} />
    {data && users.length > 0 && <>
      <Panel title={selected ? `Detalii: ${users.find(u => u.uid === selected)?.email || selected}` : 'Total utilizatori încărcați'} action={selected && <button onClick={() => setSelected('')}>Vezi totalul</button>}>
        <div className="admin-collection-grid">{[['Apeluri', number(totals.requests)], ['Erori furnizor / răspuns', number(totals.errors)], ['Tokeni input', totals.tokensReported ? number(totals.promptTokens) : '—'], ['Tokeni output', totals.tokensReported ? number(totals.completionTokens) : '—'], ['Tokeni din cache raportați', number(totals.cachedTokens)], ['Cost raportat', money(totals.costUsd, totals.costReported)], ['Durată medie apel', duration(totals.durationMs, totals.requests)], ['Apeluri fără cost raportat', number(totals.requests - totals.costReported)]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <p className="admin-caption">Tokeni raportați pentru {totals.tokensReported}/{totals.requests} apeluri; cost pentru {totals.costReported}/{totals.requests}. Costurile lipsă nu sunt estimate. Reîncercările și fallback-urile sunt apeluri separate. Durata include cererea către furnizor și citirea răspunsului, fără salvarea telemetriei. Erorile de autentificare, validare și cotă, anterioare apelului furnizorului, nu intră în aceste statistici.</p>
      </Panel>
      <div className="admin-equal-grid"><Panel title="Tokeni pe funcționalitate"><Bars items={grouped('feature').map(g => ({ label: `${g.label} · ${g.requests} apeluri`, value: g.totalTokens }))} /></Panel><Panel title="Modele & costuri">{grouped('model').map(g => <div className="admin-history-row" key={g.label}><div><strong>{g.label}</strong><small>{number(g.requests)} apeluri · {number(g.totalTokens)} tokeni · {g.errors} erori</small></div><b>{money(g.costUsd, g.costReported)}</b></div>)}</Panel></div>
    </>}
  </>;
}
