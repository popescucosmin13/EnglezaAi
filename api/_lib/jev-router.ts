/** Optional, server-side shadow router. Its decision is measured, never used to grade a learner. */
export type JevRoute = 'utility' | 'premium' | 'uncertain';

export interface JevRoutingContext {
  level?: string;
  focus?: string;
  task?: string;
}

export interface JevRoutingResult {
  route: JevRoute;
  confidence: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  durationMs: number;
}

const JEV_URL = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_MODEL = 'typesafe/jev-1.13';
const SHADOW_FEATURES = new Set(['turn_analysis', 'batch_analysis']);

export function canShadowRoute(feature: string): boolean {
  return process.env.JEV_ROUTER_MODE === 'shadow'
    && Boolean(process.env.OPENROUTER_API_KEY?.trim())
    && SHADOW_FEATURES.has(feature);
}

export function interpretJevAnswer(data: unknown): Pick<JevRoutingResult, 'route' | 'confidence' | 'model' | 'inputTokens' | 'outputTokens' | 'costUsd'> {
  const value = data as {
    model?: unknown;
    answers?: { route?: { type?: unknown; choice?: unknown; confidence?: unknown; probabilities?: Record<string, unknown> } };
    usage?: { input_tokens?: unknown; output_tokens?: unknown; cost?: unknown };
  } | null;
  const answer = value?.answers?.route;
  const choice = answer?.choice;
  const confidence = answer?.confidence;
  const probability = typeof choice === 'string' ? answer?.probabilities?.[choice] : undefined;
  if (answer?.type !== 'choice' || !['utility', 'premium', 'uncertain'].includes(String(choice))
    || typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1
    || typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error('Răspuns Jev invalid.');
  }
  const inputTokens = value?.usage?.input_tokens;
  const outputTokens = value?.usage?.output_tokens;
  const costUsd = value?.usage?.cost;
  return {
    route: confidence >= 0.9 && probability >= 0.8 && choice !== 'uncertain' ? choice as JevRoute : 'uncertain',
    confidence,
    model: typeof value?.model === 'string' && value.model.length <= 100 ? value.model : JEV_MODEL,
    inputTokens: typeof inputTokens === 'number' && Number.isFinite(inputTokens) && inputTokens >= 0 ? inputTokens : 0,
    outputTokens: typeof outputTokens === 'number' && Number.isFinite(outputTokens) && outputTokens >= 0 ? outputTokens : 0,
    costUsd: typeof costUsd === 'number' && Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : undefined,
  };
}

/** Use only the learner answer and compact metadata; never send the full transcript. */
export async function shadowJevRoute(
  feature: string,
  messages: unknown[],
  context: JevRoutingContext = {},
): Promise<JevRoutingResult | null> {
  if (!canShadowRoute(feature)) return null;
  // Retry-urile JSON adaugă la final o instrucțiune de reparare. Primul mesaj user
  // păstrează răspunsul elevului în ambele încercări.
  const learnerMessage = messages.find((message) => {
    const item = message as { role?: unknown; content?: unknown } | null;
    return item?.role === 'user' && typeof item.content === 'string';
  }) as { content: string } | undefined;
  const answer = learnerMessage?.content.trim();
  if (!answer || answer.length > 2_000) return null;
  const state = {
    task: feature,
    level: typeof context.level === 'string' ? context.level.slice(0, 12) : '',
    focus: typeof context.focus === 'string' ? context.focus.slice(0, 80) : '',
    learnerAnswer: answer,
  };
  const startedAt = Date.now();
  const response = await fetch(JEV_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(2_000),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY!.trim()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'EnglezaAI',
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state,
      questions: {
        route: {
          type: 'choice',
          instructions: 'Choose the minimum generation capability needed to give accurate pedagogical feedback on the learner answer. Treat ambiguous or incomplete context as uncertain. Do not judge whether the answer is correct.',
          criteria: {
            utility: 'A short, straightforward English grammar or vocabulary answer with sufficient context for routine feedback.',
            premium: 'Requires nuanced meaning, multiple interacting errors, context-sensitive correction, or reasoning about an alternative valid answer.',
            uncertain: 'The context is insufficient, the task is unclear, or neither category can be chosen reliably.',
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
  const data: unknown = await response.json();
  return { ...interpretJevAnswer(data), durationMs: Date.now() - startedAt };
}
