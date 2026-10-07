// Client OpenRouter — un singur key pentru chat (Claude Sonnet) și STT (model cu input audio).

import { getSettings } from '../settings';
import { apiError, apiFetch, BackendApiError } from './backend';
import { recordAiFailure, recordAiUsage, type AiCallMeta, type AiUsageDetails } from '../logic/ai-usage';

interface ContentPartText {
  type: 'text';
  text: string;
}
interface ContentPartAudio {
  type: 'input_audio';
  // m4a: doar pe Android (înregistrarea nativă nu produce WAV); modelele Gemini îl acceptă
  input_audio: { data: string; format: 'wav' | 'mp3' | 'm4a' };
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | (ContentPartText | ContentPartAudio)[];
}

interface CompletionTracking {
  fallback?: boolean;
  retry?: boolean;
}

interface CompletionOptions extends CompletionTracking {
  maxTokens: number;
  feature: string;
  jsonMode?: boolean;
  timeoutMs?: number;
  onMeta?: (meta: AiCallMeta) => void;
  routingContext?: { level?: string; focus?: string };
}

const modelsWithoutJsonMode = new Set<string>();
// Vercel taie funcția la 60s (vercel.json maxDuration) — clientul așteaptă puțin peste,
// ca eroarea serverului să ajungă prima; plafonul local e doar plasa de siguranță.
const DEFAULT_TIMEOUT_MS = 75_000;

/** Erori pentru care repetarea cererii fără JSON mode nu poate ajuta (inclusiv timeout — a doua ar aștepta la fel). */
function isNonRetryableError(message: string): boolean {
  return /sesiunea|autentific|prea mare|nu a răspuns|consumat accesul|limita zilnică|revino mâine|401|403|413|429/i.test(message);
}

function isTerminalAccessError(error: unknown): boolean {
  return error instanceof BackendApiError && (
    [401, 403, 413, 429].includes(error.status) ||
    error.code === 'DAILY_QUOTA_EXCEEDED' ||
    error.code === 'PRO_FEATURE_REQUIRED'
  );
}

async function chatCompletion(model: string, messages: ChatMessage[], temperature: number, opts: CompletionOptions): Promise<string> {
  const request = async (jsonMode: boolean, tracking: CompletionTracking): Promise<string> => {
    // Fără plafon, o cerere agățată la provider poate bloca UI-ul minute în șir (ex. „Se analizează…").
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await apiFetch('openrouter', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          maxTokens: opts.maxTokens,
          jsonMode,
          feature: opts.feature,
          ...(opts.routingContext ? { routingContext: opts.routingContext } : {}),
        }),
      });
    } catch (error) {
      if (controller.signal.aborted) {
        recordAiFailure(opts.feature, model, Boolean(tracking.fallback), Boolean(tracking.retry));
        throw new Error(`Modelul nu a răspuns în ${Math.round(timeoutMs / 1000)} secunde.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      recordAiFailure(opts.feature, model, Boolean(tracking.fallback), Boolean(tracking.retry));
      throw await apiError(res, 'OpenRouter');
    }
    const data = await res.json();
    const content = data?.content;
    // Textul gol e valid pentru transcrieri (tăcere), dar e un eșec real când s-a cerut JSON.
    if (typeof content !== 'string' || (jsonMode && !content.trim())) {
      recordAiFailure(opts.feature, model, Boolean(tracking.fallback), Boolean(tracking.retry));
      throw new Error('Răspuns gol de la model.');
    }
    const serverMeta = data?.meta ?? {};
    const meta: AiCallMeta = {
      feature: typeof serverMeta.feature === 'string' ? serverMeta.feature : opts.feature,
      requestedModel: typeof serverMeta.requestedModel === 'string' ? serverMeta.requestedModel : model,
      actualModel: typeof serverMeta.actualModel === 'string' ? serverMeta.actualModel : model,
      usage: (serverMeta.usage ?? undefined) as AiUsageDetails | undefined,
      fallback: Boolean(tracking.fallback),
      retry: Boolean(tracking.retry),
      cacheStatus: typeof serverMeta.cacheStatus === 'string' ? serverMeta.cacheStatus : undefined,
    };
    recordAiUsage(meta);
    opts.onMeta?.(meta);
    return content;
  };

  // JSON mode e doar o optimizare (evită retry-uri de parsare) — nu are voie să pice o cerere
  // care ar fi mers fără el. Variantele :free rulează pe provideri fără response_format garantat.
  const useJsonMode = Boolean(opts.jsonMode) && !modelsWithoutJsonMode.has(model) && !model.endsWith(':free');
  try {
    return await request(useJsonMode, opts);
  } catch (error) {
    // La orice eșec al unei cereri cu JSON mode (parametru refuzat, 404 „no endpoints",
    // răspuns gol) refacem aceeași cerere fără response_format, păstrând validatorul local.
    const message = String((error as Error)?.message ?? error);
    if (!useJsonMode || isTerminalAccessError(error) || isNonRetryableError(message)) throw error;
    modelsWithoutJsonMode.add(model);
    return request(false, { ...opts, retry: true });
  }
}

/**
 * tier 'utility' = modelul ieftin (rezumat, analiză batch, traduceri, explicații, fișe);
 * tier 'free' = model :free OpenRouter pentru sarcini de fundal insensibile la calitate,
 *   cu fallback AUTOMAT pe utilityModel la orice eșec (rate limit, JSON invalid) — potențialul
 *   aplicației nu scade, doar costul;
 * implicit rămâne modelul de conversație (top).
 */
export interface ChatOpts {
  temperature?: number;
  tier?: 'chat' | 'utility' | 'free';
  /** Etichetă fără date personale, folosită în telemetria locală de consum. */
  feature?: string;
  /** Plafonul maxim de output pentru operația curentă. */
  maxTokens?: number;
  /** Pentru sarcini de fundal: false înseamnă că un eșec al modelului gratuit nu consumă modelul plătit. */
  allowFreeFallback?: boolean;
  /** Plafonul de așteptare per cerere; implicit 75s (60s pe tier 'free', unde cozile lungi sunt frecvente). */
  timeoutMs?: number;
  onMeta?: (meta: AiCallMeta) => void;
  /** Context scurt pentru clasificarea Jev pe server; fără istoric de conversație. */
  routingContext?: { level?: string; focus?: string };
  /** Validare structurală a JSON-ului parsat; dacă întoarce false, se cere modelului o corectură. */
  validate?: (value: unknown) => boolean;
}

function modelFor(tier?: 'chat' | 'utility' | 'free'): string {
  const s = getSettings();
  if (tier === 'free') return s.freeModel || s.utilityModel || s.chatModel;
  return tier === 'utility' ? s.utilityModel || s.chatModel : s.chatModel;
}

/** Modelele :free pot sta minute în coadă — cedăm repede spre fallback-ul plătit. */
function timeoutFor(opts?: ChatOpts): number | undefined {
  return opts?.timeoutMs ?? (opts?.tier === 'free' ? 60_000 : undefined);
}

/** Modelul pe care cade tier-ul 'free' când modelul gratuit eșuează. */
function fallbackFor(opts?: ChatOpts): string | null {
  if (opts?.tier !== 'free' || opts.allowFreeFallback === false) return null;
  const s = getSettings();
  const fallback = s.utilityModel || s.chatModel;
  return fallback && fallback !== modelFor(opts.tier) ? fallback : null;
}

export async function chatText(messages: ChatMessage[], opts?: ChatOpts): Promise<string> {
  const temperature = opts?.temperature ?? 0.7;
  const completionOpts: CompletionOptions = {
    feature: opts?.feature ?? 'text_generic',
    maxTokens: opts?.maxTokens ?? 1200,
    timeoutMs: timeoutFor(opts),
    onMeta: opts?.onMeta,
    routingContext: opts?.routingContext,
  };
  try {
    return await chatCompletion(modelFor(opts?.tier), messages, temperature, completionOpts);
  } catch (error) {
    if (isTerminalAccessError(error)) throw error;
    const fallback = fallbackFor(opts);
    if (!fallback) throw error;
    console.warn('Modelul gratuit a eșuat, fallback pe modelul utilitar:', error);
    return chatCompletion(fallback, messages, temperature, { ...completionOpts, fallback: true });
  }
}

function extractJson(raw: string): string {
  let t = raw.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.search(/[{[]/);
  if (start > 0) t = t.slice(start);
  // taie tot ce e după ultimul } sau ]
  const lastBrace = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  return t;
}

/**
 * Chat cu output STRICT JSON — retry o dată dacă parsarea sau validarea structurală eșuează.
 * Pe tier 'free', retry-ul și orice eroare de apel folosesc modelul utilitar (calitate garantată).
 */
export async function chatJson<T>(messages: ChatMessage[], opts?: ChatOpts): Promise<T> {
  const model = modelFor(opts?.tier);
  const retryModel = fallbackFor(opts) ?? model;
  const completionOpts: CompletionOptions = {
    feature: opts?.feature ?? 'json_generic',
    maxTokens: opts?.maxTokens ?? 2000,
    jsonMode: true,
    timeoutMs: timeoutFor(opts),
    onMeta: opts?.onMeta,
    routingContext: opts?.routingContext,
  };
  const parse = (raw: string): T => {
    const value = JSON.parse(extractJson(raw)) as T;
    if (opts?.validate && !opts.validate(value)) {
      throw new Error('JSON-ul primit nu are structura cerută.');
    }
    return value;
  };
  let raw: string;
  try {
    raw = await chatCompletion(model, messages, opts?.temperature ?? 0.4, completionOpts);
  } catch (error) {
    if (isTerminalAccessError(error)) throw error;
    if (retryModel === model) throw error;
    console.warn('Modelul gratuit a eșuat, fallback pe modelul utilitar:', error);
    raw = await chatCompletion(retryModel, messages, opts?.temperature ?? 0.4, { ...completionOpts, fallback: true });
  }
  try {
    return parse(raw);
  } catch {
    // Un mesaj assistant gol/doar spații e respins de Anthropic cu 400 — îl omitem din retry.
    const previousAttempt: ChatMessage[] = raw.trim() ? [{ role: 'assistant', content: raw }] : [];
    raw = await chatCompletion(
      retryModel,
      [
        ...messages,
        ...previousAttempt,
        {
          role: 'user',
          content:
            'Răspunsul anterior nu a fost JSON valid sau nu a respectat structura cerută. Repetă răspunsul ca UN SINGUR obiect JSON valid, cu exact câmpurile din instrucțiuni, fără niciun alt text, fără code fences.',
        },
      ],
      0.1,
      { ...completionOpts, retry: true, fallback: retryModel !== model }
    );
    return parse(raw);
  }
}

/**
 * Transcriere audio prin OpenRouter: modelul primește WAV base64 și întoarce textul verbatim.
 * `contextHint` (opțional) dezambiguizează cuvintele neclare — vorbitor cu accent românesc,
 * subiectul conversației, vocabular așteptat — fără să corecteze ce s-a spus de fapt.
 */
export async function transcribeViaOpenRouter(wavBase64: string, contextHint?: string, format: 'wav' | 'm4a' = 'wav'): Promise<string> {
  const { sttModel } = getSettings();
  const context = contextHint?.trim()
    ? `\n\nContext (ONLY for resolving acoustically unclear or ambiguous words — it is NOT what the audio says; NEVER replace what was actually said with an expected phrase):\n${contextHint.trim().slice(0, 600)}`
    : '';
  const raw = await chatCompletion(
    sttModel,
    [
      {
        role: 'system',
        content:
          'You are a verbatim speech transcriber. The speaker is a Romanian learner of English (Romanian-accented English). Transcribe the English speech in the audio EXACTLY as spoken, preserving all grammar mistakes, wrong word choices and hesitations (write "uh"/"um" only if clearly audible). Do NOT correct anything. Output ONLY the transcript text, nothing else. If there is no speech, output an empty string.' + context,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe this audio verbatim.' },
          { type: 'input_audio', input_audio: { data: wavBase64, format } },
        ],
      },
    ],
    0,
    // Utilizatorul așteaptă activ după transcriere — plafon strâns, nu cel implicit de 150s.
    { feature: 'speech_to_text', maxTokens: 500, timeoutMs: 60_000 }
  );
  return raw.trim().replace(/^["']|["']$/g, '');
}
