// Setările AI/voce sunt administrate central: adminul le salvează în Firestore (config/app)
// și se aplică tuturor utilizatorilor; storage-ul local rămâne fallback. Cheile secrete stau doar în Vercel.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { storage } from './storage';

// 'webspeech' rămâne în tip pentru compatibilitate cu configul global scris de pe web;
// în aplicația nativă nu există recunoaștere live, deci se folosește mereu STT-ul cloud.
export type SttProvider = 'openrouter' | 'webspeech';
export type TtsProvider = 'browser' | 'google-ai' | 'openai-compatible';

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
}

const KEY = 'englezaai.settings';

// Configul global (setat din Admin Center), încărcat la login; are prioritate peste storage-ul local.
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
  // cu credite în cont, modelele :free au 1000 cereri/zi; orice eșec cade automat pe utilityModel
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
};

export function getSettings(): AppSettings {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, ...(remoteSettings ?? {}) };
    const parsed = JSON.parse(raw);
    const sanitized = { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
    // configul global (Admin Center) are ultimul cuvânt
    return { ...sanitized, ...(remoteSettings ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS, ...(remoteSettings ?? {}) };
  }
}

export function saveSettings(s: AppSettings) {
  storage.setItem(KEY, JSON.stringify(s));
}

export function hasOpenRouterKey(): boolean {
  // Păstrat pentru compatibilitatea componentelor existente; cheia este acum pe server.
  return true;
}
