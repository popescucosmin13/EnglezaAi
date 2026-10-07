import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Inbox, X, type LucideIcon } from 'lucide-react';
import { number, percent } from './metrics';

export function Empty({ title = 'Nu există încă date', children }: { title?: string; children?: ReactNode }) {
  return <div className="admin-empty"><Inbox size={30} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Panel({ title, caption, action, children, className = '' }: { title: string; caption?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`}><header className="admin-panel-heading"><div><h2>{title}</h2>{caption && <p>{caption}</p>}</div>{action}</header>{children}</section>;
}
export function Stat({ label, value, icon: Icon, note, previous, current, tone = 'purple' }: { label: string; value: ReactNode; icon: LucideIcon; note: string; previous?: number; current?: number; tone?: string }) {
  const delta = previous && current !== undefined ? Math.round((current - previous) / previous * 100) : null;
  return <article className="admin-stat"><div className="admin-stat-top"><span>{label}</span><span className={`admin-stat-icon ${tone}`}><Icon size={19} /></span></div><strong>{value}</strong><div className="admin-stat-bottom">{delta !== null && <span className={`admin-delta ${delta >= 0 ? 'positive' : 'negative'}`}>{delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta)}%</span>}<small>{note}</small></div></article>;
}
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`admin-dialog ${wide ? 'admin-drawer' : ''}`} aria-labelledby={id} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="admin-dialog-content"><header><div><span className="admin-eyebrow">ENGLEZAAI ADMIN</span><h2 id={id}>{title}</h2></div><button className="admin-icon-button" onClick={onClose} aria-label="Închide"><X size={21} /></button></header>{children}</div></dialog>;
}
export function Bars({ items }: { items: { label: string; value: number; suffix?: string }[] }) {
  const max = Math.max(1, ...items.map(item => item.value));
  return <div className="admin-bars">{items.map((item, i) => <div key={item.label}><div><span>{item.label}</span><strong>{number(item.value)}{item.suffix}</strong></div><div className="admin-track"><span style={{ width: `${percent(item.value, max)}%`, opacity: 1 - Math.min(i * .09, .4) }} /></div></div>)}</div>;
}
export function ActivityChart({ points }: { points: { date: string; active: number; sessions: number; speakingSec: number }[] }) {
  const [metric, setMetric] = useState<'sessions' | 'active'>('sessions');
  const id = useId().replaceAll(':', '');
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...points.map(p => p[metric]));
  const coords = points.map((p, i) => [42 + i / Math.max(1, points.length - 1) * 686, 185 - p[metric] / max * 155]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const label = metric === 'sessions' ? 'Sesiuni' : 'Utilizatori activi';
  return <><div className="admin-chart-controls"><div className="admin-segments"><button aria-pressed={metric === 'sessions'} onClick={() => { setMetric('sessions'); setHover(null); }}>Sesiuni</button><button aria-pressed={metric === 'active'} onClick={() => { setMetric('active'); setHover(null); }}>Utilizatori activi</button></div><span className="admin-legend"><i />{hover !== null ? `${points[hover].date.slice(5).split('-').reverse().join('.')} · ${points[hover][metric]} ${label.toLowerCase()}` : label}</span></div><div className="admin-chart"><svg viewBox="0 0 752 222" role="img" aria-label={`${label} pe zile. Tabelul cu valorile exacte este disponibil mai jos.`} onMouseLeave={() => setHover(null)}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b67e8" stopOpacity=".22" /><stop offset="100%" stopColor="#8b67e8" stopOpacity=".01" /></linearGradient></defs>{[0, 1, 2, 3, 4].map(i => <g key={i}><line x1="42" x2="730" y1={185 - i * 38.75} y2={185 - i * 38.75} stroke="var(--ad-border)" strokeDasharray="3 5" /><text x="29" y={190 - i * 38.75} textAnchor="end">{Math.round(max * i / 4)}</text></g>)}{coords.length > 0 && <><path d={`${line} L728,185 L42,185 Z`} fill={`url(#${id})`} /><path d={line} fill="none" stroke="var(--ad-accent)" strokeWidth="2.7" strokeLinejoin="round" />{coords.map(([x, y], i) => <g key={i}><rect x={x - 343 / Math.max(1, points.length - 1)} y="20" width={686 / Math.max(1, points.length - 1)} height="169" fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} /><circle cx={x} cy={y} r={hover === i ? 5 : 0} fill="var(--ad-accent)" stroke="white" strokeWidth="2"><title>{points[i].date}: {points[i][metric]} {label.toLowerCase()}</title></circle>{(i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0) && <text x={x} y="212" textAnchor="middle">{points[i].date.slice(5).split('-').reverse().join('.')}</text>}</g>)}</>}</svg></div><details className="admin-chart-data"><summary>Vezi datele graficului</summary><div className="admin-table-wrap"><table><thead><tr><th>Data</th><th>Utilizatori activi</th><th>Sesiuni</th><th>Minute vorbite</th></tr></thead><tbody>{points.map(point => <tr key={point.date}><td>{point.date}</td><td>{point.active}</td><td>{point.sessions}</td><td>{Math.round(point.speakingSec / 60)}</td></tr>)}</tbody></table></div></details></>;
}
