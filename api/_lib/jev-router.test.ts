import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canShadowRoute, interpretJevAnswer, shadowJevRoute } from './jev-router';

const success = {
  model: 'typesafe/jev-1.13-20260917',
  answers: { route: { type: 'choice', choice: 'utility', probabilities: { utility: 0.94, premium: 0.04, uncertain: 0.02 }, confidence: 0.92 } },
  usage: { input_tokens: 300, output_tokens: 20, cost: 0.0000126 },
};

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('JEV_ROUTER_MODE', 'shadow');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Jev router through OpenRouter', () => {
  it('uses the Decisions API with a compact learner state and the existing key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(success), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await shadowJevRoute('turn_analysis', [
      { role: 'system', content: 'private conversation history' },
      { role: 'user', content: 'Yesterday I go to school.' },
      { role: 'assistant', content: '{invalid json}' },
      { role: 'user', content: 'Repair the JSON format.' },
    ], { level: 'A2', focus: 'past_simple' });
    expect(result).toMatchObject({ route: 'utility', model: success.model, inputTokens: 300, outputTokens: 20, costUsd: 0.0000126 });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe('typesafe/jev-1.13');
    expect(body.state).toMatchObject({ learnerAnswer: 'Yesterday I go to school.', level: 'A2', focus: 'past_simple' });
    expect(body.questions.route.type).toBe('choice');
    expect(JSON.stringify(body)).not.toContain('private conversation history');
    expect(JSON.stringify(body)).not.toContain('Repair the JSON format.');
  });

  it('treats low confidence as uncertain and rejects malformed decisions', () => {
    expect(interpretJevAnswer({ ...success, answers: { route: { ...success.answers.route, confidence: 0.6 } } }).route).toBe('uncertain');
    expect(() => interpretJevAnswer({ ...success, answers: { route: { ...success.answers.route, choice: 'unknown' } } })).toThrow();
  });

  it('never calls Jev for unrelated features, missing key, or excessive learner text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(canShadowRoute('conversation_turn_roleplay')).toBe(false);
    expect(await shadowJevRoute('conversation_turn_roleplay', [{ role: 'user', content: 'Hi' }])).toBeNull();
    expect(await shadowJevRoute('turn_analysis', [{ role: 'user', content: 'x'.repeat(2001) }])).toBeNull();
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(await shadowJevRoute('turn_analysis', [{ role: 'user', content: 'Hi' }])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
