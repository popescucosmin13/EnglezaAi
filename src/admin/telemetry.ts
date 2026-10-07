export interface TelemetryBucket {
  id: string; uid: string; email: string; date: string; feature: string; model: string;
  requests: number; errors: number; promptTokens: number; completionTokens: number;
  totalTokens: number; cachedTokens: number; costUsd: number; costReported: number;
  tokensReported: number; durationMs: number;
}
export interface TelemetryPage {
  buckets: TelemetryBucket[];
  nextCursor: { date: string; id: string } | null;
  from: string; to: string;
  router?: { mode: 'off' | 'shadow'; keyConfigured: boolean; model: string };
}
export type JevRouteLabel = 'utility' | 'premium' | 'uncertain' | 'error';
export type JevTask = 'turn_analysis' | 'batch_analysis';
export interface JevRouteSummary extends ReturnType<typeof telemetryTotals> {
  task: JevTask;
  route: JevRouteLabel;
}
export function summarizeJev(buckets: TelemetryBucket[]) {
  const decisions: JevRouteSummary[] = [];
  const byKey = new Map<string, TelemetryBucket[]>();
  for (const bucket of buckets) {
    const match = /^jev_shadow_(turn_analysis|batch_analysis)_(utility|premium|uncertain|error)$/.exec(bucket.feature);
    if (!match) continue;
    const key = `${match[1]}:${match[2]}`;
    byKey.set(key, [...(byKey.get(key) || []), bucket]);
  }
  for (const [key, rows] of byKey) {
    const [task, route] = key.split(':') as [JevTask, JevRouteLabel];
    decisions.push({ task, route, ...telemetryTotals(rows) });
  }
  const jevRows = buckets.filter(b => /^jev_shadow_(turn_analysis|batch_analysis)_(utility|premium|uncertain|error)$/.test(b.feature));
  const analysisRows = buckets.filter(b => b.feature === 'turn_analysis' || b.feature === 'batch_analysis');
  return {
    attempts: telemetryTotals(jevRows),
    analysisCalls: telemetryTotals(analysisRows),
    decisions: decisions.sort((a, b) => a.task.localeCompare(b.task) || a.route.localeCompare(b.route)),
  };
}
export function telemetryTotals(buckets: TelemetryBucket[]) {
  return buckets.reduce((total, b) => ({
    requests: total.requests + b.requests, errors: total.errors + b.errors,
    promptTokens: total.promptTokens + b.promptTokens, completionTokens: total.completionTokens + b.completionTokens,
    totalTokens: total.totalTokens + b.totalTokens, cachedTokens: total.cachedTokens + b.cachedTokens,
    costUsd: total.costUsd + b.costUsd, costReported: total.costReported + b.costReported,
    tokensReported: total.tokensReported + b.tokensReported, durationMs: total.durationMs + b.durationMs,
  }), { requests: 0, errors: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, costUsd: 0, costReported: 0, tokensReported: 0, durationMs: 0 });
}
export function telemetryByUser(buckets: TelemetryBucket[]) {
  const groups = new Map<string, TelemetryBucket[]>();
  for (const bucket of buckets) { const group = groups.get(bucket.uid) || []; group.push(bucket); groups.set(bucket.uid, group); }
  return [...groups].map(([uid, rows]) => ({ uid, email: rows.find(r => r.email)?.email || uid, ...telemetryTotals(rows) })).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);
}
