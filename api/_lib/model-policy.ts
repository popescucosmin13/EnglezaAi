import { getFirestore } from 'firebase-admin/firestore';

const DEFAULT_OPENROUTER_MODELS = new Set([
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-2.5-flash',
]);

let cachedModels: { values: Set<string>; expiresAt: number } | null = null;

function configuredModels(): string[] {
  return (process.env.OPENROUTER_ALLOWED_MODELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Modelele acceptate vin din config/app (scris numai de admin), plus fallback-urile cunoscute și
 * lista opțională din environment. Astfel, un client modificat nu poate selecta un model arbitrar/scump.
 */
export async function isAllowedOpenRouterModel(model: string): Promise<boolean> {
  if (cachedModels && cachedModels.expiresAt > Date.now()) return cachedModels.values.has(model);
  const values = new Set([...DEFAULT_OPENROUTER_MODELS, ...configuredModels()]);
  try {
    const snapshot = await getFirestore().doc('config/app').get();
    const config = snapshot.data() ?? {};
    for (const key of ['chatModel', 'utilityModel', 'freeModel', 'sttModel']) {
      const value = config[key];
      if (typeof value === 'string' && value.trim()) values.add(value.trim());
    }
  } catch (error) {
    // Fallback-urile implicite rămân suficiente la prima pornire sau la o eroare Firestore.
    console.warn('Nu am putut încărca allowlist-ul de modele din Firestore:', error);
  }
  cachedModels = { values, expiresAt: Date.now() + 5 * 60_000 };
  return values.has(model);
}
