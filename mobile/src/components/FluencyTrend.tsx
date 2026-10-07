import { View } from 'react-native';
import type { Session, FluencyMetrics } from '../types';
import { FLUENCY_LABELS_RO } from '../logic/fluency';
import { LineChart } from './Charts';
import { Card, Muted, StatGrid, StatTile, Tiny } from '../ui';

function recentLabSessions(sessions: Session[]): { date: string; fluency: FluencyMetrics }[] {
  const cutoff = Date.now() - 30 * 86_400_000;
  return sessions.filter((session) => session.fluency && new Date(session.startedAt).getTime() >= cutoff)
    .map((session) => ({ date: session.startedAt.slice(0, 10), fluency: session.fluency! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function FluencyTrend({ sessions, latest }: { sessions: Session[]; latest?: FluencyMetrics }) {
  const series = recentLabSessions(sessions);
  const current = latest ?? series.at(-1)?.fluency;
  if (!current) return <Muted>Fă prima sesiune de Speaking Lab ca să vezi curba ta de fluență.</Muted>;
  const tiles: { key: keyof typeof FLUENCY_LABELS_RO; value: string }[] = [
    { key: 'mlr', value: String(current.mlr) },
    { key: 'ttfwMs', value: (current.ttfwMs / 1000).toFixed(1) },
    { key: 'pausesOver1_5s', value: String(current.pausesOver1_5s) },
    { key: 'codeSwitches', value: String(current.codeSwitches) },
    { key: 'fillerRate', value: String(current.fillerRate) },
    { key: 'wordsPerMinute', value: String(current.wordsPerMinute) },
  ];
  return <View>
    <StatGrid>{tiles.map((tile) => <StatTile key={tile.key} value={`${tile.value}${FLUENCY_LABELS_RO[tile.key].unit ? ` ${FLUENCY_LABELS_RO[tile.key].unit}` : ''}`} label={FLUENCY_LABELS_RO[tile.key].label} />)}</StatGrid>
    {series.length >= 2 ? <Card><Tiny>LUNGIMEA MEDIE A FRAZEI — ULTIMELE 30 DE ZILE</Tiny><LineChart points={series.map((item) => ({ label: item.date.slice(5), value: item.fluency.mlr }))} height={130} yLabel="Lungimea medie a frazei" /><Muted>Crește doar dacă vorbești mai fluent, nu dacă ai mai multe carduri învățate.</Muted></Card> : null}
  </View>;
}
