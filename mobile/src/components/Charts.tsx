// Grafice SVG minimale, single-series pe culoarea primară — portat pe react-native-svg.
// Aceleași calcule ca pe web; tooltip-urile <title> dispar (nu există hover pe nativ).

import { ScrollView } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Tiny } from '../ui';
import { usePalette } from '../theme';

export function LineChart({
  points,
  height = 160,
  yLabel,
}: {
  points: { label: string; value: number }[];
  height?: number;
  yLabel: string;
}) {
  const p = usePalette();
  if (points.length === 0) return <Tiny>Fără date încă.</Tiny>;
  const w = Math.max(320, points.length * 46);
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...points.map((pt) => pt.value), 1);
  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt.value).toFixed(1)}`).join(' ');
  const gridYs = [0, 0.5, 1].map((f) => padT + innerH - f * innerH);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={w} height={height} accessibilityLabel={yLabel}>
        {gridYs.map((gy, i) => (
          <Line key={i} x1={padL} x2={w - padR} y1={gy} y2={gy} stroke={p.border} strokeWidth={1} />
        ))}
        {[0, 0.5, 1].map((f, i) => (
          <SvgText key={i} x={2} y={padT + innerH - f * innerH + 3} fill={p.muted} fontSize={10} fontWeight="600">
            {String(Math.round(f * max * 10) / 10)}
          </SvgText>
        ))}
        <Path d={path} fill="none" stroke={p.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((pt, i) => (
          <G key={i}>
            <Circle cx={x(i)} cy={y(pt.value)} r={4} fill={p.primary} stroke={p.bg} strokeWidth={2} />
            <SvgText x={x(i)} y={height - 8} textAnchor="middle" fill={p.muted} fontSize={10} fontWeight="600">
              {pt.label}
            </SvgText>
          </G>
        ))}
      </Svg>
    </ScrollView>
  );
}

export function BarChart({ items }: { items: { label: string; value: number }[] }) {
  const p = usePalette();
  const filtered = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (filtered.length === 0) return <Tiny>Fără date încă.</Tiny>;
  const max = Math.max(...filtered.map((i) => i.value));
  const rowH = 26;
  const labelW = 150;
  const w = 340;
  const h = filtered.length * rowH + 6;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <Svg width={w} height={h} accessibilityLabel="Greșeli pe categorie">
        {filtered.map((it, i) => {
          const bw = Math.max(4, (it.value / max) * (w - labelW - 40));
          const yPos = i * rowH + 4;
          return (
            <G key={it.label}>
              <SvgText x={labelW - 6} y={yPos + 13} textAnchor="end" fill={p.muted} fontSize={10} fontWeight="600">
                {it.label}
              </SvgText>
              <Rect x={labelW} y={yPos} width={bw} height={16} rx={4} fill={p.primary} opacity={0.85} />
              <SvgText x={labelW + bw + 6} y={yPos + 13} fill={p.muted} fontSize={10} fontWeight="600">
                {String(it.value)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </ScrollView>
  );
}
