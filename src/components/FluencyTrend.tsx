// Dashboard de fluență (Speaking Lab §9): curba MLR pe 30 de zile — singura metrică ce nu minte.
// Pură randare din sesiunile salvate, zero tokeni. Curba MLR crește doar dacă vorbești mai fluent.

import type { Session, FluencyMetrics } from '../types';
import { FLUENCY_LABELS_RO } from '../logic/fluency';

interface Point {
  date: string;
  mlr: number;
  pauses: number;
}

function labSessionsWithFluency(sessions: Session[]): { date: string; fluency: FluencyMetrics }[] {
  const cutoff = Date.now() - 30 * 86_400_000;
  return sessions
    .filter((s) => s.fluency && new Date(s.startedAt).getTime() >= cutoff)
    .map((s) => ({ date: s.startedAt.slice(0, 10), fluency: s.fluency! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Sparkline SVG minimal pentru o serie de valori (fără librării — CSP-safe, theming prin currentColor). */
function Spark({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length < 2) return <div className="tiny muted">Prea puține sesiuni pentru o curbă — revino după câteva.</div>;
  const w = 260;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ color: 'var(--accent, #4f8cff)' }} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function FluencyTrend({ sessions, latest }: { sessions: Session[]; latest?: FluencyMetrics }) {
  const series = labSessionsWithFluency(sessions);
  const points: Point[] = series.map((s) => ({ date: s.date, mlr: s.fluency.mlr, pauses: s.fluency.pausesOver1_5s }));
  const current = latest ?? series[series.length - 1]?.fluency;

  if (!current) {
    return <p className="muted">Fă prima sesiune de Speaking Lab ca să vezi curba ta de fluență.</p>;
  }

  const tiles: { key: keyof typeof FLUENCY_LABELS_RO; value: string }[] = [
    { key: 'mlr', value: `${current.mlr}` },
    { key: 'ttfwMs', value: `${(current.ttfwMs / 1000).toFixed(1)}` },
    { key: 'pausesOver1_5s', value: `${current.pausesOver1_5s}` },
    { key: 'codeSwitches', value: `${current.codeSwitches}` },
    { key: 'fillerRate', value: `${current.fillerRate}` },
    { key: 'wordsPerMinute', value: `${current.wordsPerMinute}` },
  ];

  return (
    <div>
      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.key} className="stat-tile" title={FLUENCY_LABELS_RO[t.key].help}>
            <div className="value">{t.value}<span className="tiny" style={{ marginLeft: 2 }}>{FLUENCY_LABELS_RO[t.key].unit}</span></div>
            <div className="label">{FLUENCY_LABELS_RO[t.key].label}</div>
          </div>
        ))}
      </div>
      {points.length >= 2 && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong className="tiny">Lungimea medie a frazei (MLR) — ultimele 30 de zile</strong>
          <Spark values={points.map((p) => p.mlr)} />
          <p className="tiny muted">Crește doar dacă vorbești mai fluent, nu dacă ai mai multe carduri „învățate".</p>
        </div>
      )}
    </div>
  );
}
