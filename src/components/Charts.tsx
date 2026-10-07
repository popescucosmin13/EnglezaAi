// Grafice SVG minimale, single-series pe culoarea primară: linie (trend) și bare orizontale (categorii).
// Marks subțiri, grid recesiv, capete rotunjite, tooltip nativ per mark (<title>).

const AMBER = '#5b5bd6';

export function LineChart({
  points,
  height = 160,
  yLabel,
}: {
  points: { label: string; value: number }[];
  height?: number;
  yLabel: string;
}) {
  if (points.length === 0) return <p className="tiny">Fără date încă.</p>;
  const w = Math.max(320, points.length * 46);
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const gridYs = [0, 0.5, 1].map((f) => padT + innerH - f * innerH);

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" width={w} height={height} role="img" aria-label={yLabel}>
        {gridYs.map((gy, i) => (
          <line key={i} className="grid" x1={padL} x2={w - padR} y1={gy} y2={gy} />
        ))}
        {[0, 0.5, 1].map((f, i) => (
          <text key={i} x={2} y={padT + innerH - f * innerH + 3}>
            {Math.round(f * max * 10) / 10}
          </text>
        ))}
        <path d={path} fill="none" stroke={AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={4} fill={AMBER} stroke="var(--bg)" strokeWidth={2}>
              <title>{`${p.label}: ${p.value}`}</title>
            </circle>
            <text x={x(i)} y={height - 8} textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({ items }: { items: { label: string; value: number }[] }) {
  const filtered = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (filtered.length === 0) return <p className="tiny">Fără date încă.</p>;
  const max = Math.max(...filtered.map((i) => i.value));
  const rowH = 26;
  const labelW = 150;
  const w = 340;
  const h = filtered.length * rowH + 6;

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" width={w} height={h} role="img" aria-label="Greșeli pe categorie">
        {filtered.map((it, i) => {
          const bw = Math.max(4, (it.value / max) * (w - labelW - 40));
          const yPos = i * rowH + 4;
          return (
            <g key={it.label}>
              <text x={labelW - 6} y={yPos + 13} textAnchor="end">
                {it.label}
              </text>
              <rect x={labelW} y={yPos} width={bw} height={16} rx={4} fill={AMBER} opacity={0.85}>
                <title>{`${it.label}: ${it.value}`}</title>
              </rect>
              <text x={labelW + bw + 6} y={yPos + 13}>
                {it.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
