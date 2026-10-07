import type { VercelRequest, VercelResponse } from '@vercel/node';
import { postOnly, safeError } from './_lib/auth.js';
import { requireAiAccess } from './_lib/access.js';
import { allowRequestAsync } from './_lib/rate-limit.js';
import { isAllowedOpenRouterModel } from './_lib/model-policy.js';
import { recordTelemetry } from './_lib/telemetry.js';
import { canShadowRoute, shadowJevRoute } from './_lib/jev-router.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_BODY_CHARS = 7_000_000;

/**
 * Prompt caching Anthropic: marcăm prefixele stabile (mesajele system) drept breakpoint-uri, ca la
 * tura următoare să se reia din cache (~90% reducere pe tokenii repetați). Anthropic permite max 4.
 *
 * Ultimul mesaj îl marcăm DOAR în conversații multi-tură (există deja o replică assistant): acolo
 * prefixul până la el e recitit tura următoare, deci cache-write-ul se amortizează. La apelurile
 * one-shot (system + user: fișe, microlecții, analiză, explicații de cuvinte) ultimul mesaj e unic
 * și nu se recitește niciodată în fereastra de 5 min — a-l marca ar fi doar un cache-write plătit
 * (+25%) fără nicio citire. Prefixul system rămâne marcat: șabloanele identice reapărute rapid
 * (multe traduceri/explicații la rând) tot pot da hit.
 */
function withCacheControl(model: string, messages: any[]): any[] {
  if (!model.startsWith('anthropic/')) return messages;
  const multiTurn = messages.some((m) => m?.role === 'assistant');
  return messages.map((m, i) => {
    const mark = m?.role === 'system' || (multiTurn && i === messages.length - 1);
    if (!mark || typeof m?.content !== 'string') return m;
    return { ...m, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!postOnly(req, res)) return;
  const { model, messages, temperature, maxTokens, jsonMode, feature, routingContext } = req.body ?? {};
  const featureName = typeof feature === 'string' && /^[a-z0-9_-]{1,64}$/i.test(feature) ? feature : 'unknown';
  const access = await requireAiAccess(req, res, 'openrouter', featureName);
  if (!access || !(await allowRequestAsync(res, access.uid, 'openrouter', 60))) return;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return res.status(503).json({ error: 'OPENROUTER_API_KEY nu este configurat în Vercel.' });

  if (typeof model !== 'string' || !Array.isArray(messages)) return res.status(400).json({ error: 'Cerere OpenRouter invalidă.' });
  if (!(await isAllowedOpenRouterModel(model))) {
    return res.status(403).json({ code: 'MODEL_NOT_ALLOWED', error: 'Modelul AI solicitat nu este permis de configurația serverului.' });
  }
  if (JSON.stringify(messages).length > MAX_BODY_CHARS) return res.status(413).json({ error: 'Cererea este prea mare.' });
  const planOutputLimit = access.plan === 'free' ? 2500 : 8000;
  const outputLimit = Number.isFinite(maxTokens) ? Math.min(planOutputLimit, Math.max(32, Math.round(maxTokens))) : Math.min(2000, planOutputLimit);

  const startedAt = Date.now();
  // Rulează doar dacă este activat explicit. Clasificarea nu schimbă răspunsul elevului.
  // Handlerul așteaptă și telemetria înainte să se încheie execuția serverless.
  const shadow = canShadowRoute(featureName)
    ? shadowJevRoute(featureName, messages, routingContext && typeof routingContext === 'object' ? routingContext : {})
        .then(async (decision) => {
          if (!decision) return;
          await recordTelemetry({
            uid: access.uid,
            feature: `jev_shadow_${featureName}_${decision.route}`,
            model: decision.model,
            startedAt,
            durationMs: decision.durationMs,
            failed: false,
            usage: {
              prompt_tokens: decision.inputTokens,
              completion_tokens: decision.outputTokens,
              total_tokens: decision.inputTokens + decision.outputTokens,
              cost: decision.costUsd,
            },
          });
        })
        .catch(async () => {
          try {
            await recordTelemetry({ uid: access.uid, feature: `jev_shadow_${featureName}_error`, model: 'typesafe/jev-1.13', startedAt, durationMs: Date.now() - startedAt, failed: true });
          } catch {
            // Telemetria opțională nu poate întrerupe un răspuns valid pentru elev.
          }
        })
    : Promise.resolve();
  let telemetryUsage: unknown;
  let telemetryModel = model;
  let recorded = false;
  async function finish(status: number, body: unknown) {
    recorded = true;
    await shadow;
    await recordTelemetry({ uid: access!.uid, feature: featureName, model: telemetryModel, startedAt, durationMs: Date.now() - startedAt, failed: status !== 200, usage: telemetryUsage });
    return res.status(status).json(body);
  }
  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'EnglezaAI',
      },
      body: JSON.stringify({
        model,
        messages: withCacheControl(model, messages),
        temperature: Number.isFinite(temperature) ? temperature : 0.7,
        // Limită adaptată operației; previne răspunsurile accidentale foarte lungi fără a trunchia sarcinile complexe.
        max_tokens: outputLimit,
        ...(jsonMode === true ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const data: any = await upstream.json().catch(() => null);
    telemetryUsage = data?.usage;
    if (typeof data?.model === 'string') telemetryModel = data.model;
    if (!upstream.ok) {
      console.error('OpenRouter upstream error', upstream.status, data);
      return await finish(upstream.status < 500 ? upstream.status : 502, { error: `OpenRouter ${upstream.status}: ${data?.error?.message || 'cerere eșuată'}` });
    }
    // OpenRouter poate întoarce 200 cu o eroare încorporată (moderare, provider picat mid-stream).
    if (data?.error?.message) {
      console.error('OpenRouter embedded error', data.error);
      return await finish(502, { error: `OpenRouter: ${data.error.message}` });
    }
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = choice?.finish_reason ?? choice?.native_finish_reason;
    // Textul gol e valid doar pentru transcrieri (tăcere); pentru cererile JSON e un eșec real.
    if (typeof content !== 'string' || (jsonMode === true && !content.trim())) {
      console.error('OpenRouter empty content', JSON.stringify({ model, finishReason, feature: featureName }));
      return await finish(502, { error: `Modelul nu a returnat text (finish: ${finishReason ?? 'necunoscut'}).` });
    }
    const meta = {
      feature: featureName,
      requestedModel: model,
      actualModel: typeof data?.model === 'string' ? data.model : model,
      usage: data?.usage ?? null,
      finishReason,
      cacheStatus: upstream.headers.get('x-openrouter-cache-status') ?? undefined,
      generationId: typeof data?.id === 'string' ? data.id : undefined,
    };
    // Fără prompturi sau transcripturi în log: doar metadate de consum, utile pentru audit.
    console.info('OpenRouter usage', JSON.stringify(meta));
    return await finish(200, { content, meta });
  } catch (error) {
    await shadow;
    if (!recorded) await recordTelemetry({ uid: access.uid, feature: featureName, model: telemetryModel, startedAt, durationMs: Date.now() - startedAt, failed: true, usage: telemetryUsage });
    return safeError(res, 'OpenRouter', error);
  }
}
