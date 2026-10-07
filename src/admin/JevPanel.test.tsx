import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JevPanel from './JevPanel';
import type { TelemetryBucket, TelemetryPage } from './telemetry';

const bucket = (feature: string, requests: number, costUsd: number, errors = 0): TelemetryBucket => ({
  id: feature, uid: 'user-1', email: 'learner@example.com', date: '2026-09-24', feature, model: 'test-model',
  requests, errors, promptTokens: 200, completionTokens: 20, totalTokens: 220, cachedTokens: 0,
  costUsd, costReported: requests, tokensReported: requests, durationMs: requests * 100,
});

describe('Jev admin panel', () => {
  it('shows the real server mode and separates router costs from analysis costs', () => {
    const data: TelemetryPage = {
      buckets: [bucket('turn_analysis', 2, 0.02), bucket('jev_shadow_turn_analysis_utility', 1, 0.00001), bucket('jev_shadow_turn_analysis_premium', 1, 0.00001)],
      nextCursor: null, from: '2026-09-01', to: '2026-09-24',
      router: { mode: 'shadow', keyConfigured: true, model: 'typesafe/jev-1.13' },
    };
    const html = renderToStaticMarkup(<JevPanel data={data} buckets={data.buckets} preview={false} />);
    expect(html).toContain('Shadow activ');
    expect(html).toContain('Recomandări utilitar');
    expect(html).toContain('Recomandări premium');
    expect(html).toContain('Cost Jev raportat');
    expect(html).toContain('Costul analizei existente');
    expect(html).toContain('100%');
    expect(html).toContain('Analiză replică');
  });
  it('shows a distinct empty state when shadow mode is off', () => {
    const data: TelemetryPage = { buckets: [], nextCursor: null, from: '', to: '', router: { mode: 'off', keyConfigured: true, model: 'typesafe/jev-1.13' } };
    const html = renderToStaticMarkup(<JevPanel data={data} buckets={[]} preview={false} />);
    expect(html).toContain('Oprit');
    expect(html).toContain('JEV_ROUTER_MODE=shadow');
  });
});
