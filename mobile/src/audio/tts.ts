// Text-to-Speech nativ: implicit vocea de sistem (expo-speech, gratuit), opțional
// Google AI TTS sau endpoint OpenAI-compatibil prin backend (redare expo-audio din fișier).
// Tot mecanismul „unlock audio" de pe web dispare — nativ nu există autoplay policy.

import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { getSettings } from '../settings';
import { apiError, apiFetch } from '../api/backend';
import { recordAiFailure, recordAiUsage } from '../logic/ai-usage';
import { pcmBase64ToWavBase64 } from './base64';
import { emit } from '../events';

let currentPlayer: AudioPlayer | null = null;
let speechActive = false;
let speechGeneration = 0;
let pendingSpeechStop: Promise<void> = Promise.resolve();
let currentSpeechDone: (() => void) | null = null;

// Cache de fișiere TTS (echivalentul googleAudioCache de pe web, dar pe disc, cu plafon LRU).
const audioFileCache = new Map<string, string>(); // cheie → uri fișier
const CACHE_MAX = 30;

// Mod auto (hands-free): păstrat pentru compatibilitate — pe nativ rutarea audio e gestionată
// de iOS, dar preferința „Google TTS pentru engleză în modul auto" rămâne funcțională.
let forceGoogleEnglish = false;
export function setForceGoogleEnglish(on: boolean): void {
  forceGoogleEnglish = on;
}

// Comutarea rutei Bluetooth după înregistrare: cât timp microfonul e deschis, iOS ține sesiunea pe
// „play and record", iar kitul auto e pe canalul de convorbire (HFP). După închiderea microfonului
// mașina are nevoie de o fracțiune de secundă ca să revină pe canalul media (A2DP) — fără pauza
// asta, primele cuvinte ale replicii (sau toată replica) se pierd în difuzoare.
const ROUTE_SWITCH_MS = 600;
let lastMicEndedAt = 0;

export function notifyMicSessionEnded(): void {
  lastMicEndedAt = Date.now();
}

async function waitForOutputRoute(): Promise<void> {
  if (lastMicEndedAt === 0) return;
  const elapsed = Date.now() - lastMicEndedAt;
  if (elapsed >= ROUTE_SWITCH_MS) return;
  await new Promise((r) => setTimeout(r, ROUTE_SWITCH_MS - elapsed));
}

// ---------- Stub-uri de compatibilitate (pe web gestionau autoplay policy) ----------

export function isAudioUnlocked(): boolean {
  return true;
}

export function isNativeVoicePrimed(): boolean {
  return true;
}

export function requiresNativeVoiceActivation(): boolean {
  return false;
}

export async function unlockAudio(_audibleConfirmation = false): Promise<boolean> {
  emit('engleza-audio-unlocked');
  return true;
}

// ---------- API-ul public (identic cu web) ----------

export function stopSpeaking(): void {
  speechGeneration += 1;
  if (speechActive) {
    speechActive = false;
    pendingSpeechStop = Speech.stop().catch(() => {});
  }
  if (currentPlayer) {
    try {
      currentPlayer.pause();
      currentPlayer.remove();
    } catch {
      /* deja oprit */
    }
    currentPlayer = null;
  }
  currentSpeechDone?.();
  currentSpeechDone = null;
}

function isRomanian(text: string): boolean {
  return /[ăâîșț]/i.test(text) || /\b(este|sunt|înseamnă|adică|pentru|cuvânt|propoziție|traducere|explicație|română|folosim|aici|exemplu)\b/i.test(text);
}

/** rate: 1 = normal; săptămâna 1 folosește ~0.85 (AI-ul vorbește rar). */
export async function speak(text: string, rate = 1): Promise<void> {
  stopSpeaking();
  const generation = speechGeneration;
  await pendingSpeechStop;
  await waitForOutputRoute();
  if (generation !== speechGeneration) return;
  const s = getSettings();
  const romanian = isRomanian(text);
  // pe nativ nu mai există problema vocii de „browser mobil" — googleTtsMobileEnglish și
  // forceGoogleEnglish păstrează același sens: folosește Google TTS și pentru engleză
  const googleForMobileEnglish = !romanian && (s.googleTtsMobileEnglish || forceGoogleEnglish);
  if (s.ttsProvider === 'google-ai' && (romanian || !s.googleTtsRomanianOnly || googleForMobileEnglish)) {
    try {
      await speakViaGoogleAi(text, rate, romanian, generation);
      return;
    } catch (err) {
      recordAiFailure(romanian ? 'tts_romanian' : 'tts_english', s.googleTtsModel, true, false);
      console.warn('Google AI TTS a eșuat, fallback pe vocea de sistem:', err);
    }
  }
  if (s.ttsProvider === 'openai-compatible') {
    try {
      await speakViaApi(text, rate, generation);
      return;
    } catch (err) {
      console.warn('TTS API a eșuat, fallback pe vocea de sistem:', err);
    }
  }
  if (generation !== speechGeneration) return;
  await speakSystem(text, rate, romanian ? 'ro-RO' : 'en-US', generation);
}

/** Vocea de sistem (expo-speech) — echivalentul speechSynthesis de pe web. */
async function speakSystem(text: string, rate: number, language: 'ro-RO' | 'en-US', generation: number): Promise<void> {
  // Prima replică trebuie să funcționeze înainte de orice utilizare a microfonului,
  // inclusiv cu comutatorul silențios activ pe iOS.
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'doNotMix',
  });
  if (generation !== speechGeneration) return;
  await setIsAudioActiveAsync(true);
  if (generation !== speechGeneration) return;
  return new Promise((resolve) => {
    let finished = false;
    const watchdogMs = Math.min(45_000, Math.max(7_000, (text.trim().split(/\s+/).length * 650) / Math.max(0.6, rate) + 3_000));
    const timer = setTimeout(() => {
      pendingSpeechStop = Speech.stop().catch(() => {});
      done();
    }, watchdogMs);
    const done = () => {
      if (finished) return;
      finished = true;
      speechActive = false;
      clearTimeout(timer);
      if (currentSpeechDone === done) currentSpeechDone = null;
      resolve();
    };
    currentSpeechDone = done;
    speechActive = true;
    try {
      Speech.speak(text, {
        language,
        rate,
        useApplicationAudioSession: true,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    } catch {
      done();
    }
  });
}

/** Test direct, fără fallback, folosit din Setări/Admin. */
export async function testGoogleTts(): Promise<void> {
  await speakViaGoogleAi('Bună! Sunt tutorele tău de engleză. Îți voi explica totul clar, pas cu pas.', 0.92, true);
}

function cacheKeyHash(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

async function writeCachedAudio(cacheKey: string, base64: string, ext: 'wav' | 'mp3'): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}tts-${cacheKeyHash(cacheKey)}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  // plafon LRU: ștergem cea mai veche intrare când depășim limita
  audioFileCache.delete(cacheKey);
  audioFileCache.set(cacheKey, uri);
  if (audioFileCache.size > CACHE_MAX) {
    const [oldKey, oldUri] = audioFileCache.entries().next().value as [string, string];
    audioFileCache.delete(oldKey);
    void FileSystem.deleteAsync(oldUri, { idempotent: true }).catch(() => {});
  }
  return uri;
}

async function cachedAudioUri(cacheKey: string): Promise<string | null> {
  const uri = audioFileCache.get(cacheKey);
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (!info?.exists) {
    audioFileCache.delete(cacheKey);
    return null;
  }
  // reîmprospătăm poziția LRU
  audioFileCache.delete(cacheKey);
  audioFileCache.set(cacheKey, uri);
  return uri;
}

async function speakViaGoogleAi(text: string, rate: number, romanian: boolean, generation = speechGeneration): Promise<void> {
  const s = getSettings();
  const model = s.googleTtsModel || 'gemini-2.5-flash-preview-tts';
  const voice = s.googleTtsVoice || 'Kore';
  const cacheKey = `${model}|${voice}|${rate}|${romanian}|${text}`;
  let uri = await cachedAudioUri(cacheKey);
  if (!uri) {
    const res = await apiFetch('tts', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'google-ai', text, model, voice, rate, romanian,
      }),
    });
    if (!res.ok) throw await apiError(res, 'Google AI TTS');
    const data = await res.json();
    const pcmBase64 = data?.audioBase64;
    if (!pcmBase64) throw new Error('Google AI TTS nu a returnat audio.');
    const meta = data?.meta ?? {};
    recordAiUsage({
      feature: romanian ? 'tts_romanian' : 'tts_english',
      requestedModel: typeof meta.requestedModel === 'string' ? meta.requestedModel : model,
      actualModel: typeof meta.actualModel === 'string' ? meta.actualModel : model,
      usage: meta.usage,
      fallback: false,
      retry: false,
    });
    const wavBase64 = pcmBase64ToWavBase64(pcmBase64, data.sampleRate || 24000);
    uri = await writeCachedAudio(cacheKey, wavBase64, 'wav');
  }
  await playAudioFile(uri, generation);
}

async function speakViaApi(text: string, rate: number, generation: number): Promise<void> {
  const s = getSettings();
  const res = await apiFetch('tts', {
    method: 'POST',
    body: JSON.stringify({ provider: 'openai-compatible', model: s.ttsModel, voice: s.ttsVoice, text, rate }),
  });
  if (!res.ok) throw await apiError(res, 'TTS');
  const data = await res.json();
  if (!data?.audioBase64) throw new Error('TTS nu a returnat audio.');
  const cacheKey = `oa|${s.ttsModel}|${s.ttsVoice}|${rate}|${text}`;
  const uri = await writeCachedAudio(cacheKey, data.audioBase64, 'mp3');
  await playAudioFile(uri, generation);
}

async function playAudioFile(uri: string, generation: number): Promise<void> {
  if (generation !== speechGeneration) return;
  // asigură categoria de redare pe difuzor/Bluetooth media (dacă un stop de înregistrare nu a
  // apucat să o reseteze, redarea ar ieși pe casca de convorbire, aproape inaudibil în mașină)
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  }).catch(() => {});
  if (generation !== speechGeneration) return;
  await new Promise<void>((resolve) => {
    const player = createAudioPlayer({ uri });
    currentPlayer = player;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      try {
        sub.remove();
      } catch {
        /* deja scos */
      }
      if (currentPlayer === player) currentPlayer = null;
      try {
        player.remove();
      } catch {
        /* deja eliberat */
      }
      if (currentSpeechDone === done) currentSpeechDone = null;
      resolve();
    };
    // dacă redarea se blochează (fișier corupt, întrerupere de sesiune), nu ținem UI-ul captiv
    const watchdog = setTimeout(done, 90_000);
    currentSpeechDone = done;
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) done();
    });
    try {
      player.play();
    } catch {
      done();
    }
  });
}
