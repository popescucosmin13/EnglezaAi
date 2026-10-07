// Setările AI/voce sunt administrate central: adminul le salvează în Firestore (config/app)
// și se aplică tuturor utilizatorilor; localStorage rămâne fallback. Cheile secrete stau doar în Vercel.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type SttProvider = 'openrouter' | 'webspeech';
export type TtsProvider = 'browser' | 'google-ai' | 'azure' | 'openai-compatible';

export interface AppSettings {
  chatModel: string; // modelul de conversație/corecturi
  utilityModel: string; // model ieftin pentru sarcini mecanice (rezumat, analiză, traduceri, fișe)
  freeModel: string; // model :free OpenRouter pentru sarcini de fundal; gol = dezactivat (se folosește utilityModel)
  sttModel: string; // model cu input audio, prin OpenRouter
  sttProvider: SttProvider;
  ttsProvider: TtsProvider;
  ttsModel: string;
  ttsVoice: string;
  googleTtsModel: string;
  googleTtsVoice: string;
  googleTtsRomanianOnly: boolean;
  googleTtsMobileEnglish: boolean;
  // Azure Neural TTS — determinist, folosit automat în modul hands-free (mașină) indiferent de ttsProvider
  azureTtsVoiceEn: string;
  azureTtsVoiceRo: string;
}

const KEY = 'englezaai.settings';

// Configul global (setat din Admin Center), încărcat la login; are prioritate peste localStorage.
let remoteSettings: Partial<AppSettings> | null = null;

export async function loadRemoteSettings(): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'config', 'app'));
    remoteSettings = snap.exists() ? (snap.data() as Partial<AppSettings>) : null;
  } catch {
    // offline sau reguli nepublicate încă — rămân setările locale/implicite
  }
}

/** Doar adminul poate scrie (firestore.rules); se aplică tuturor utilizatorilor la următorul login/refresh. */
export async function saveRemoteSettings(s: AppSettings): Promise<void> {
  await setDoc(doc(db, 'config', 'app'), s);
  remoteSettings = { ...s };
}

export const DEFAULT_SETTINGS: AppSettings = {
  chatModel: 'anthropic/claude-sonnet-4.5',
  // Haiku pe utility: rulează analiza gramaticală și explicațiile în română — calitatea primează
  // (decizie explicită: nu coborâm pe Llama aici; Llama rămâne doar pe tier-ul 'free', de fundal).
  utilityModel: 'anthropic/claude-haiku-4.5',
  // Variantele „:free" dispar des de pe OpenRouter (dau 404) — folosim slug-ul plătit al aceluiași
  // model, foarte ieftin și stabil. Orice eșec cade oricum automat pe utilityModel. Gol = dezactivat.
  freeModel: 'meta-llama/llama-3.3-70b-instruct',
  sttModel: 'google/gemini-2.5-flash',
  sttProvider: 'openrouter',
  ttsProvider: 'google-ai',
  ttsModel: 'gpt-4o-mini-tts',
  ttsVoice: 'alloy',
  googleTtsModel: 'gemini-2.5-flash-preview-tts',
  googleTtsVoice: 'Kore',
  googleTtsRomanianOnly: true,
  googleTtsMobileEnglish: false,
  azureTtsVoiceEn: 'en-US-AriaNeural',
  azureTtsVoiceRo: 'ro-RO-AlinaNeural',
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, ...(remoteSettings ?? {}) };
    const parsed = JSON.parse(raw);
    // Pe iOS preferăm vocea locală după activarea explicită; migrare o singură dată de la fallback-ul Google mobil.
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !localStorage.getItem('englezaai.ios-native-voice-v1')) {
      parsed.googleTtsMobileEnglish = false;
      localStorage.setItem('englezaai.ios-native-voice-v1', '1');
    }
    // Migrare de la versiunea care salva secretele în browser: nu le mai păstrăm nici măcar local.
    const secretKeys = ['openrouterKey', 'googleAiKey', 'azureKey', 'ttsKey', 'ttsBaseUrl', 'azureRegion'];
    const containedSecrets = secretKeys.some((key) => key in parsed);
    for (const key of secretKeys) delete parsed[key];
    const sanitized = { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
    if (containedSecrets) localStorage.setItem(KEY, JSON.stringify(sanitized));
    // configul global (Admin Center) are ultimul cuvânt
    return { ...sanitized, ...(remoteSettings ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS, ...(remoteSettings ?? {}) };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function hasOpenRouterKey(): boolean {
  // Păstrat pentru compatibilitatea componentelor existente; cheia este acum pe server.
  return true;
}
