import { storage } from '../storage';
import { emit } from '../events';

export interface AiUsageDetails {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
    audio_tokens?: number;
  };
}

export interface AiCallMeta {
  feature: string;
  requestedModel: string;
  actualModel: string;
  usage?: AiUsageDetails;
  fallback: boolean;
  retry: boolean;
  cacheStatus?: string;
}

export interface AiUsageBucket {
  requests: number;
  errors: number;
  fallbacks: number;
  retries: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  audioTokens: number;
  cost: number;
}

export interface AiUsageDay extends AiUsageBucket {
  date: string;
  byFeature: Record<string, AiUsageBucket>;
  byModel: Record<string, AiUsageBucket>;
}

const STORAGE_KEY = 'englezaai.ai-usage.v1';
export const AI_USAGE_EVENT = 'engleza-ai-usage';

function emptyBucket(): AiUsageBucket {
  return {
    requests: 0,
    errors: 0,
    fallbacks: 0,
    retries: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    audioTokens: 0,
    cost: 0,
  };
}

function emptyDay(date: string): AiUsageDay {
  return { date, ...emptyBucket(), byFeature: {}, byModel: {} };
}

function localDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readDays(): AiUsageDay[] {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDays(days: AiUsageDay[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(days.slice(-30)));
    emit(AI_USAGE_EVENT);
  } catch {
    // Telemetria este best-effort și nu trebuie să afecteze profesorul.
  }
}

function add(target: AiUsageBucket, patch: Partial<AiUsageBucket>): void {
  for (const key of Object.keys(emptyBucket()) as (keyof AiUsageBucket)[]) {
    target[key] += patch[key] ?? 0;
  }
}

function usagePatch(meta: AiCallMeta): AiUsageBucket {
  const usage = meta.usage ?? {};
  const details = usage.prompt_tokens_details ?? {};
  return {
    requests: 1,
    errors: 0,
    fallbacks: meta.fallback ? 1 : 0,
    retries: meta.retry ? 1 : 0,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? ((usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)),
    cachedTokens: details.cached_tokens ?? 0,
    cacheWriteTokens: details.cache_write_tokens ?? 0,
    audioTokens: details.audio_tokens ?? 0,
    cost: usage.cost ?? 0,
  };
}

export function recordAiUsage(meta: AiCallMeta): void {
  const days = readDays();
  const date = localDate();
  let day = days.find((d) => d.date === date);
  if (!day) {
    day = emptyDay(date);
    days.push(day);
  }
  const patch = usagePatch(meta);
  add(day, patch);
  day.byFeature[meta.feature] ??= emptyBucket();
  day.byModel[meta.actualModel] ??= emptyBucket();
  add(day.byFeature[meta.feature], patch);
  add(day.byModel[meta.actualModel], patch);
  writeDays(days);
}

export function recordAiFailure(feature: string, model: string, fallback: boolean, retry: boolean): void {
  const days = readDays();
  const date = localDate();
  let day = days.find((d) => d.date === date);
  if (!day) {
    day = emptyDay(date);
    days.push(day);
  }
  const patch = { ...emptyBucket(), errors: 1, fallbacks: fallback ? 1 : 0, retries: retry ? 1 : 0 };
  add(day, patch);
  day.byFeature[feature] ??= emptyBucket();
  day.byModel[model] ??= emptyBucket();
  add(day.byFeature[feature], patch);
  add(day.byModel[model], patch);
  writeDays(days);
}

export function getAiUsageSummary(daysBack = 7): AiUsageDay {
  const result = emptyDay(`ultimele-${daysBack}-zile`);
  const cutoff = Date.now() - Math.max(1, daysBack) * 86_400_000;
  for (const day of readDays()) {
    if (new Date(`${day.date}T23:59:59`).getTime() < cutoff) continue;
    add(result, day);
    for (const [feature, bucket] of Object.entries(day.byFeature ?? {})) {
      result.byFeature[feature] ??= emptyBucket();
      add(result.byFeature[feature], bucket);
    }
    for (const [model, bucket] of Object.entries(day.byModel ?? {})) {
      result.byModel[model] ??= emptyBucket();
      add(result.byModel[model], bucket);
    }
  }
  return result;
}
