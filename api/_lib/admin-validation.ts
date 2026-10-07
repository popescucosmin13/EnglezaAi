export class AdminInputError extends Error {}

export function validId(value: unknown, label = 'UID'): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[/\u0000-\u001f]/.test(value) || value === '.' || value === '..') {
    throw new AdminInputError(`${label} invalid.`);
  }
  return value.trim();
}
export function validDays(value: unknown): number {
  if (![7, 30, 90].includes(Number(value))) throw new AdminInputError('Perioada trebuie să fie 7, 30 sau 90 de zile.');
  return Number(value);
}
export function profilePatch(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminInputError('Profil invalid.');
  const patch = value as Record<string, unknown>;
  const allowed = ['currentLevel', 'targetLevel', 'dailyGoalMinutes', 'mainObjective', 'correctionMode'];
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !allowed.includes(key))) throw new AdminInputError('Câmp de profil neacceptat.');
  for (const [key, val] of Object.entries(patch)) {
    if (['currentLevel', 'targetLevel'].includes(key) && (typeof val !== 'string' || !['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(val))) throw new AdminInputError('Nivel CEFR invalid.');
    if (key === 'dailyGoalMinutes' && (typeof val !== 'number' || !Number.isInteger(val) || val < 5 || val > 120)) throw new AdminInputError('Obiectivul zilnic trebuie să fie între 5 și 120 minute.');
    if (key === 'mainObjective' && (typeof val !== 'string' || !val.trim() || val.length > 500)) throw new AdminInputError('Obiectivul trebuie să aibă între 1 și 500 de caractere.');
    if (key === 'correctionMode' && (typeof val !== 'string' || !['discreet', 'immediate', 'final'].includes(val))) throw new AdminInputError('Mod de corectare invalid.');
  }
  return patch as Record<string, string | number>;
}
export function configPatch(value: unknown): Record<string, string | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AdminInputError('Configurație invalidă.');
  const strings = ['chatModel', 'utilityModel', 'freeModel', 'sttModel', 'sttProvider', 'ttsProvider', 'ttsModel', 'ttsVoice', 'googleTtsModel', 'googleTtsVoice', 'azureTtsVoiceEn', 'azureTtsVoiceRo'];
  const booleans = ['googleTtsRomanianOnly', 'googleTtsMobileEnglish'];
  const patch = value as Record<string, string | boolean>;
  if (!Object.keys(patch).length) throw new AdminInputError('Configurație goală.');
  for (const [key, val] of Object.entries(patch)) {
    if (booleans.includes(key)) { if (typeof val !== 'boolean') throw new AdminInputError('Valoare booleană invalidă.'); }
    else if (!strings.includes(key) || typeof val !== 'string' || val.length > 200 || (key !== 'freeModel' && !val.trim())) throw new AdminInputError(`Câmp de configurație invalid: ${key}.`);
    if (key === 'sttProvider' && !['openrouter', 'webspeech'].includes(String(val))) throw new AdminInputError('Furnizor STT invalid.');
    if (key === 'ttsProvider' && !['browser', 'google-ai', 'azure', 'openai-compatible'].includes(String(val))) throw new AdminInputError('Furnizor TTS invalid.');
  }
  return patch;
}
