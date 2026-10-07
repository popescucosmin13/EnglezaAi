import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
const mocks = vi.hoisted(() => ({ record: vi.fn(), access: vi.fn(), allowed: vi.fn(), fetch: vi.fn() }));
vi.mock('./_lib/auth.js', () => ({ postOnly: () => true, safeError: (res: VercelResponse) => res.status(502).json({ error: 'Unavailable' }) }));
vi.mock('./_lib/access.js', () => ({ requireAiAccess: mocks.access }));
vi.mock('./_lib/rate-limit.js', () => ({ allowRequestAsync: () => true }));
vi.mock('./_lib/model-policy.js', () => ({ isAllowedOpenRouterModel: mocks.allowed }));
vi.mock('./_lib/telemetry.js', () => ({ recordTelemetry: mocks.record }));
import handler from './openrouter';
function response() { const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; }
const req = () => ({ body: { uid: 'forged-user', feature: 'chat', model: 'allowed-model', messages: [{ role: 'user', content: 'private prompt' }] } } as VercelRequest);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('OPENROUTER_API_KEY', 'test'); vi.stubEnv('JEV_ROUTER_MODE', 'off'); vi.stubGlobal('fetch', mocks.fetch); mocks.record.mockResolvedValue(undefined); mocks.access.mockResolvedValue({ uid: 'verified-user', plan: 'pro' }); mocks.allowed.mockResolvedValue(true); vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('OpenRouter telemetry integration', () => {
  it('records usage under the verified UID before the response is sent', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ model: 'actual-model', choices: [{ message: { content: 'OK' } }], usage: { cost: .01, total_tokens: 20 } }), { status: 200 }));
    const res = response(); const sequence: string[] = [];
    mocks.record.mockImplementation(async () => { await Promise.resolve(); sequence.push('persisted'); }); res.json.mockImplementation(() => sequence.push('response'));
    await handler(req(), res as unknown as VercelResponse);
    expect(sequence).toEqual(['persisted', 'response']);
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ uid: 'verified-user', model: 'actual-model', feature: 'chat', failed: false, usage: { cost: .01, total_tokens: 20 } }));
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain('private prompt');
  });
  it.each(['http', 'embedded', 'empty', 'network'])('counts a %s failure once', async kind => {
    if (kind === 'network') mocks.fetch.mockRejectedValue(new Error('Network'));
    else mocks.fetch.mockResolvedValue(new Response(JSON.stringify(kind === 'empty' ? { choices: [] } : { error: { message: 'Failed' } }), { status: kind === 'http' ? 429 : 200 }));
    const res = response(); await handler(req(), res as unknown as VercelResponse);
    expect(mocks.record).toHaveBeenCalledTimes(1); expect(mocks.record.mock.calls[0][0]).toMatchObject({ uid: 'verified-user', failed: true });
  });
  it('does not record rejected requests that never call the provider', async () => {
    vi.stubEnv('JEV_ROUTER_MODE', 'shadow');
    mocks.allowed.mockResolvedValue(false);
    const request = req(); request.body.feature = 'turn_analysis';
    await handler(request, response() as unknown as VercelResponse);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled();
  });

  it('measures an opted-in Jev decision without changing the learner response', async () => {
    vi.stubEnv('JEV_ROUTER_MODE', 'shadow');
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/decisions')
      ? new Response(JSON.stringify({ model: 'typesafe/jev-1.13-20260917', answers: { route: { type: 'choice', choice: 'utility', probabilities: { utility: 0.97 }, confidence: 0.97 } }, usage: { input_tokens: 310, output_tokens: 18, cost: 0.000013 } }), { status: 200 })
      : new Response(JSON.stringify({ model: 'allowed-model', choices: [{ message: { content: 'Original answer' } }], usage: { cost: .01 } }), { status: 200 }));
    const request = req(); request.body.feature = 'turn_analysis';
    const res = response();
    await handler(request, res as unknown as VercelResponse);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ content: 'Original answer' }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ uid: 'verified-user', feature: 'jev_shadow_turn_analysis_utility', model: 'typesafe/jev-1.13-20260917', usage: expect.objectContaining({ cost: 0.000013, prompt_tokens: 310 }) }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ uid: 'verified-user', feature: 'turn_analysis', model: 'allowed-model' }));
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain('private prompt');
  });

  it('keeps the original answer when the optional Jev call fails', async () => {
    vi.stubEnv('JEV_ROUTER_MODE', 'shadow');
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/decisions')
      ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'Original answer' } }] }), { status: 200 }));
    const request = req(); request.body.feature = 'turn_analysis';
    const res = response();
    await handler(request, res as unknown as VercelResponse);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ content: 'Original answer' }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ feature: 'jev_shadow_turn_analysis_error', failed: true }));
  });
});
