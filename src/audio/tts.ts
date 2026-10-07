// Text-to-Speech: implicit vocea din browser (gratuit), opțional endpoint OpenAI-compatibil.

import { getSettings } from '../settings';
import { apiError, apiFetch } from '../api/backend';
import { recordAiFailure, recordAiUsage } from '../logic/ai-usage';

let currentAudio: HTMLAudioElement | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let sharedAudioContext: AudioContext | null = null;
let audioUnlocked = false;
let nativeVoicePrimed = false;
let currentSpeechDone: (() => void) | null = null;
const googleAudioCache = new Map<string, Blob>();
const azureAudioCache = new Map<string, Blob>();

// Mod auto (hands-free): vocea nativă iOS nu se rutează pe Bluetooth când microfonul e deschis (HFP),
// așa că pe durata modului auto forțăm un TTS determinist (Azure, cu fallback Google) în loc de
// vocea nativă a browserului. În plus, redarea NU trece prin WebAudio, ci printr-un element <audio>
// (singurul pe care iOS îl rutează pe canalul media / A2DP al mașinii — vezi playViaElement).
let forceReliableCarTts = false;
export function setForceReliableCarTts(on: boolean): void {
  if (forceReliableCarTts === on) return;
  forceReliableCarTts = on;
  if (on) {
    primeMediaElement();
    startCarKeepAlive();
  } else {
    stopCarKeepAlive();
  }
}

export function isCarTtsActive(): boolean {
  return forceReliableCarTts;
}

// ---------- Sesiunea de microfon (rutarea Bluetooth) ----------
//
// Cât timp getUserMedia e activ, iOS comută sesiunea audio pe „play and record", iar mașina trece
// de pe A2DP (media) pe HFP (convorbire). Consecințe pe care le tratăm aici:
//   1. AudioContext-ul deschis înainte rămâne legat de ruta/sample-rate-ul vechi → redare mută.
//      Îl marcăm „stale" și îl recreăm la prima redare de după microfon.
//   2. Mașina are nevoie de ~0.5–1s ca să comute înapoi pe A2DP; dacă vorbim imediat, primele
//      cuvinte (sau tot) se pierd. De aceea așteptăm ROUTE_SWITCH_MS de la închiderea microfonului.

const ROUTE_SWITCH_MS = 700;
let micSessions = 0;
let lastMicEndedAt = 0;
let contextStale = false;

export function notifyMicSessionStarted(): void {
  micSessions += 1;
  contextStale = true;
}

export function notifyMicSessionEnded(): void {
  if (micSessions === 0) return;
  micSessions -= 1;
  if (micSessions === 0) lastMicEndedAt = Date.now();
}

function isMicSessionActive(): boolean {
  return micSessions > 0;
}

/** Așteaptă ca ruta audio să revină pe canalul media după închiderea microfonului. */
async function waitForOutputRoute(): Promise<void> {
  if (isMicSessionActive() || lastMicEndedAt === 0) return;
  const elapsed = Date.now() - lastMicEndedAt;
  if (elapsed >= ROUTE_SWITCH_MS) return;
  await new Promise((r) => window.setTimeout(r, ROUTE_SWITCH_MS - elapsed));
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedAudioContext ??= new AudioContextClass();
  return sharedAudioContext;
}

/**
 * Context bun de redare sau null. Recreează contextul dacă a fost închis, întrerupt de o schimbare
 * de rută (`interrupted` — specific iOS) sau dacă între timp a rulat o sesiune de microfon.
 */
async function usableContext(): Promise<AudioContext | null> {
  let ctx = audioContext();
  if (!ctx) return null;
  const state = ctx.state as AudioContextState | 'interrupted';
  if (ctx === sharedAudioContext && (state === 'closed' || state === 'interrupted' || contextStale)) {
    if (state !== 'closed') void ctx.close().catch(() => { /* deja închis */ });
    sharedAudioContext = null;
    contextStale = false;
    ctx = audioContext();
    if (!ctx) return null;
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return null; }
  }
  return ctx.state === 'running' ? ctx : null;
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function isNativeVoicePrimed(): boolean {
  return nativeVoicePrimed;
}

export function requiresNativeVoiceActivation(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ---------- Redarea prin element <audio> (ruta media, singura stabilă pe Bluetooth) ----------

let mediaElement: HTMLAudioElement | null = null;
let mediaElementPrimed = false;
let currentObjectUrl: string | null = null;

function getMediaElement(): HTMLAudioElement {
  if (!mediaElement) {
    mediaElement = new Audio();
    mediaElement.preload = 'auto';
    mediaElement.setAttribute('playsinline', '');
    (mediaElement as any).playsInline = true;
  }
  return mediaElement;
}

/** ~1s de PCM aproape-silențios (±1 LSB): unele kituri auto închid stream-ul A2DP pe liniște digitală. */
function nearSilentWav(seconds = 1): Blob {
  const sampleRate = 8000;
  const samples = sampleRate * seconds;
  const pcm = new Uint8Array(samples * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples; i++) view.setInt16(i * 2, i % 2 === 0 ? 1 : -1, true);
  return wavFromPcm(pcm, sampleRate);
}

/**
 * iOS „binecuvântează" un element <audio> doar dacă a fost pornit într-un gest de utilizator.
 * Îl pregătim la prima atingere, ca redările programatice de mai târziu să nu fie blocate.
 */
function primeMediaElement(): void {
  if (mediaElementPrimed) return;
  try {
    const el = getMediaElement();
    el.src = URL.createObjectURL(nearSilentWav(0.05));
    el.volume = 1;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      void p.then(() => {
        el.pause();
        mediaElementPrimed = true;
      }).catch(() => { /* fără gest valid — reîncercăm la următoarea atingere */ });
    } else {
      mediaElementPrimed = true;
    }
  } catch { /* elementul rămâne nepregătit */ }
}

// Buclă aproape-silențioasă cât timp modul auto e activ: ține sesiunea media (A2DP) deschisă,
// ca mașina să nu comute pe altă sursă între replici și să nu piardă începutul următoarei replici.
let keepAliveElement: HTMLAudioElement | null = null;

function startCarKeepAlive(): void {
  if (typeof window === 'undefined' || keepAliveElement) return;
  try {
    const el = new Audio(URL.createObjectURL(nearSilentWav(1)));
    el.loop = true;
    el.volume = 0.02;
    el.setAttribute('playsinline', '');
    (el as any).playsInline = true;
    keepAliveElement = el;
    void el.play().catch(() => { /* fără gest valid — nu e critic */ });
  } catch { /* fără keep-alive */ }
}

function stopCarKeepAlive(): void {
  if (!keepAliveElement) return;
  try {
    keepAliveElement.pause();
    if (keepAliveElement.src.startsWith('blob:')) URL.revokeObjectURL(keepAliveElement.src);
  } catch { /* deja oprit */ }
  keepAliveElement = null;
}

function setMediaSessionState(state: 'playing' | 'paused'): void {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    if (!ms.metadata && 'MediaMetadata' in window) {
      ms.metadata = new (window as any).MediaMetadata({ title: 'EnglezaAI', artist: 'Conversație în engleză' });
    }
    ms.playbackState = state;
  } catch { /* API indisponibil */ }
}

/** Browser-ele mobile permit audio după un gest explicit. Apelată la prima atingere și de butonul „Activează sunetul”. */
export async function unlockAudio(audibleConfirmation = false): Promise<boolean> {
  try {
    primeMediaElement();
    const ctx = audioContext();
    if (ctx?.state === 'suspended') await ctx.resume();
    if (ctx) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = audibleConfirmation ? 0.035 : 0;
      oscillator.frequency.value = 660;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + (audibleConfirmation ? 0.09 : 0.01));
    }
    // Pe iOS trebuie rostit ceva audibil direct în click; inițializarea silențioasă nu este suficient de stabilă.
    if (audibleConfirmation && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const activation = new SpeechSynthesisUtterance("Voice activated. Let's begin.");
      activation.lang = 'en-US';
      activation.rate = 0.92;
      activation.volume = 1;
      const voice = pickBrowserVoice('en-US');
      if (voice) activation.voice = voice;
      await new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        activation.onend = done;
        activation.onerror = done;
        window.speechSynthesis.speak(activation);
        window.setTimeout(done, 5000);
      });
      nativeVoicePrimed = true;
      window.dispatchEvent(new Event('engleza-native-voice-primed'));
    }
    audioUnlocked = !ctx || ctx.state === 'running';
    if (audioUnlocked) window.dispatchEvent(new Event('engleza-audio-unlocked'));
    return audioUnlocked && (!audibleConfirmation || !requiresNativeVoiceActivation() || nativeVoicePrimed);
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* deja oprit */ }
    currentAudio = null;
  }
  if (currentSource) {
    try { currentSource.stop(); } catch { /* deja oprit */ }
    currentSource = null;
  }
  setMediaSessionState('paused');
  currentSpeechDone?.();
  currentSpeechDone = null;
}

function isRomanian(text: string): boolean {
  return /[ăâîșț]/i.test(text) || /\b(este|sunt|înseamnă|adică|pentru|cuvânt|propoziție|traducere|explicație|română|folosim|aici|exemplu)\b/i.test(text);
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function pickBrowserVoice(language: 'ro-RO' | 'en-US'): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (language === 'ro-RO') {
    return voices.find((v) => v.lang.toLowerCase() === 'ro-ro') ?? voices.find((v) => v.lang.toLowerCase().startsWith('ro')) ?? null;
  }
  const preferred = ['Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Samantha'];
  for (const name of preferred) {
    const v = voices.find((v) => v.name.includes(name));
    if (v) return v;
  }
  return voices.find((v) => v.lang.startsWith('en-US')) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
}

/** rate: 1 = normal; săptămâna 1 folosește ~0.85 (AI-ul vorbește rar). */
export async function speak(text: string, rate = 1): Promise<void> {
  stopSpeaking();
  const s = getSettings();
  const romanian = isRomanian(text);

  // Mod mașină: waterfall dedicat, determinist-first, independent de preferința generală de TTS —
  // rutarea pe Bluetooth trebuie să fie stabilă indiferent ce a ales utilizatorul altundeva.
  if (forceReliableCarTts) {
    await waitForOutputRoute();
    let blocked = false;
    try {
      await speakViaAzure(text, rate, romanian);
      return;
    } catch (err) {
      blocked = blocked || isPlaybackBlocked(err);
      recordAiFailure(romanian ? 'tts_romanian' : 'tts_english', 'azure', true, false);
      console.warn('Azure TTS (mașină) a eșuat, încerc Google AI:', err);
    }
    // Dacă redarea însăși e blocată, al doilea furnizor ar eșua identic — sărim direct la vocea din browser.
    if (!blocked) {
      try {
        await speakViaGoogleAi(text, rate, romanian);
        return;
      } catch (err) {
        blocked = blocked || isPlaybackBlocked(err);
        recordAiFailure(romanian ? 'tts_romanian' : 'tts_english', s.googleTtsModel, true, false);
        console.warn('Google AI TTS (mașină) a eșuat, revin la vocea din browser:', err);
      }
    }
    await speakBrowser(text, rate, romanian ? 'ro-RO' : 'en-US');
    return;
  }

  if (s.ttsProvider === 'azure') {
    try {
      await speakViaAzure(text, rate, romanian);
      return;
    } catch (err) {
      recordAiFailure(romanian ? 'tts_romanian' : 'tts_english', 'azure', true, false);
      console.warn('Azure TTS a eșuat, fallback pe vocea din browser:', err);
    }
  }
  const googleForMobileEnglish = !romanian && s.googleTtsMobileEnglish && isMobileDevice();
  if (s.ttsProvider === 'google-ai' && (romanian || !s.googleTtsRomanianOnly || googleForMobileEnglish)) {
    try {
      await speakViaGoogleAi(text, rate, romanian);
      return;
    } catch (err) {
      recordAiFailure(romanian ? 'tts_romanian' : 'tts_english', s.googleTtsModel, true, false);
      console.warn('Google AI TTS a eșuat, fallback pe vocea din browser:', err);
    }
  }
  if (s.ttsProvider === 'openai-compatible') {
    try {
      await speakViaApi(text, rate);
      return;
    } catch (err) {
      console.warn('TTS API a eșuat, fallback pe vocea din browser:', err);
    }
  }
  await speakBrowser(text, rate, romanian ? 'ro-RO' : 'en-US');
}

function speakBrowser(text: string, rate: number, language: 'ro-RO' | 'en-US'): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = language;
    utter.rate = rate;
    const voice = pickBrowserVoice(language);
    if (voice) utter.voice = voice;
    let finished = false;
    const watchdogMs = Math.min(45_000, Math.max(7_000, (text.trim().split(/\s+/).length * 650) / Math.max(0.6, rate) + 3_000));
    const timer = window.setTimeout(() => {
      synth.cancel();
      done();
    }, watchdogMs);
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (currentSpeechDone === done) currentSpeechDone = null;
      resolve();
    };
    currentSpeechDone = done;
    utter.onend = done;
    utter.onerror = done;
    synth.speak(utter);
  });
}

/** Test direct, fără fallback, folosit din Setări. */
export async function testGoogleTts(): Promise<void> {
  await speakViaGoogleAi('Bună! Sunt tutorele tău de engleză. Îți voi explica totul clar, pas cu pas.', 0.92, true);
}

/** Test direct, fără fallback, folosit din Setări/Admin. */
export async function testAzureTts(): Promise<void> {
  await speakViaAzure('Bună! Sunt tutorele tău de engleză. Îți voi explica totul clar, pas cu pas.', 0.92, true);
}

async function speakViaAzure(text: string, rate: number, romanian: boolean): Promise<void> {
  const s = getSettings();
  const voice = (romanian ? s.azureTtsVoiceRo : s.azureTtsVoiceEn) || (romanian ? 'ro-RO-AlinaNeural' : 'en-US-AriaNeural');
  const cacheKey = `${voice}|${rate}|${romanian}|${text}`;
  let blob = azureAudioCache.get(cacheKey);
  if (!blob) {
    const res = await apiFetch('tts', {
      method: 'POST',
      body: JSON.stringify({ provider: 'azure', text, voice, rate, romanian }),
    });
    if (!res.ok) throw await apiError(res, 'Azure TTS');
    const data = await res.json();
    if (!data?.audioBase64) throw new Error('Azure TTS nu a returnat audio.');
    const binary = atob(data.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: data.format || 'audio/mpeg' });
    recordAiUsage({
      feature: romanian ? 'tts_romanian' : 'tts_english',
      requestedModel: `azure:${voice}`,
      actualModel: `azure:${voice}`,
      fallback: false,
      retry: false,
    });
    azureAudioCache.set(cacheKey, blob);
  }
  await playAudioBlob(blob);
}

async function speakViaGoogleAi(text: string, rate: number, romanian: boolean): Promise<void> {
  const s = getSettings();
  const model = s.googleTtsModel || 'gemini-2.5-flash-preview-tts';
  const voice = s.googleTtsVoice || 'Kore';
  const cacheKey = `${model}|${voice}|${rate}|${romanian}|${text}`;
  let blob = googleAudioCache.get(cacheKey);
  if (!blob) {
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
    blob = pcmBase64ToWav(pcmBase64, data.sampleRate || 24000);
    googleAudioCache.set(cacheKey, blob);
  }
  await playAudioBlob(blob);
}

function wavFromPcm(pcm: Uint8Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: 'audio/wav' });
}

function pcmBase64ToWav(base64: string, sampleRate: number): Blob {
  const binary = atob(base64);
  const pcm = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
  return wavFromPcm(pcm, sampleRate);
}

async function speakViaApi(text: string, rate: number): Promise<void> {
  const s = getSettings();
  const res = await apiFetch('tts', {
    method: 'POST',
    body: JSON.stringify({ provider: 'openai-compatible', model: s.ttsModel, voice: s.ttsVoice, text, rate }),
  });
  if (!res.ok) throw await apiError(res, 'TTS');
  const data = await res.json();
  const binary = atob(data.audioBase64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.format || 'audio/mpeg' });
  await playAudioBlob(blob);
}

const PLAYBACK_BLOCKED = 'engleza-playback-blocked';

class PlaybackBlockedError extends Error {
  readonly code = PLAYBACK_BLOCKED;
  readonly reason?: unknown;
  constructor(reason?: unknown) {
    super('Redarea audio a fost blocată de browser.');
    this.reason = reason;
  }
}

function isPlaybackBlocked(err: unknown): boolean {
  return (err as PlaybackBlockedError)?.code === PLAYBACK_BLOCKED;
}

async function playAudioBlob(blob: Blob): Promise<void> {
  // În modul mașină redăm DOAR prin element: WebAudio rămâne lipit de ruta de convorbire (HFP)
  // după fiecare sesiune de microfon, iar rezultatul e „nu se aude nimic în mașină".
  if (forceReliableCarTts) {
    await playViaElement(blob);
    return;
  }
  if (audioUnlocked) {
    const ctx = await usableContext();
    if (ctx) {
      await playViaWebAudio(ctx, blob);
      return;
    }
  }
  await playViaElement(blob);
}

async function playViaWebAudio(ctx: AudioContext, blob: Blob): Promise<void> {
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await new Promise<void>((resolve) => {
    const source = ctx.createBufferSource();
    currentSource = source;
    source.buffer = decoded;
    source.connect(ctx.destination);
    let finished = false;
    // Watchdog: dacă `onended` nu mai vine (context întrerupt de o schimbare de rută), sesiunea
    // hands-free ar rămâne blocată pe „speaking" pentru totdeauna.
    const timer = window.setTimeout(() => {
      try { source.stop(); } catch { /* deja oprit */ }
      done();
    }, decoded.duration * 1000 + 4000);
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (currentSource === source) currentSource = null;
      if (currentSpeechDone === done) currentSpeechDone = null;
      setMediaSessionState('paused');
      resolve();
    };
    currentSpeechDone = done;
    source.onended = done;
    setMediaSessionState('playing');
    source.start();
  });
}

/**
 * Redare prin elementul <audio> partajat. Aceleași element de fiecare dată: iOS îi păstrează ruta
 * (media/A2DP) și nu mai renegociază canalul la fiecare replică.
 */
async function playViaElement(blob: Blob): Promise<void> {
  const el = getMediaElement();
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  const url = URL.createObjectURL(blob);
  currentObjectUrl = url;
  el.src = url;
  el.volume = 1;
  currentAudio = el;

  let settle!: (err?: unknown) => void;
  const finished = new Promise<void>((resolve, reject) => {
    settle = (err?: unknown) => (err ? reject(err) : resolve());
  });

  let done = (_err?: unknown) => { /* înlocuit mai jos */ };
  let over = false;
  // Fără metadate încă: plasă largă, strânsă la durata reală imediat ce o aflăm.
  let timer = window.setTimeout(() => done(), 60_000);
  const onMeta = () => {
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => done(), el.duration * 1000 + 5000);
  };
  done = (err?: unknown) => {
    if (over) return;
    over = true;
    window.clearTimeout(timer);
    el.removeEventListener('ended', onEnded);
    el.removeEventListener('error', onError);
    el.removeEventListener('loadedmetadata', onMeta);
    if (currentAudio === el) currentAudio = null;
    if (currentSpeechDone === doneVoid) currentSpeechDone = null;
    setMediaSessionState('paused');
    settle(err);
  };
  const doneVoid = () => done();
  const onEnded = () => done();
  const onError = () => done(new Error('Redarea audio a eșuat.'));
  el.addEventListener('ended', onEnded);
  el.addEventListener('error', onError);
  el.addEventListener('loadedmetadata', onMeta);
  currentSpeechDone = doneVoid;

  setMediaSessionState('playing');
  try {
    await el.play();
  } catch (err) {
    // Autoplay blocat / sesiune audio ocupată: nu tăcem eroarea — utilizatorul trebuie să știe
    // că trebuie o atingere, altfel conversația merge mai departe „mută".
    window.dispatchEvent(new Event('engleza-audio-blocked'));
    mediaElementPrimed = false;
    done(new PlaybackBlockedError(err));
  }
  await finished;
}

// Preîncarcă vocile (Chrome le încarcă async).
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// Prima atingere în aplicație deblochează audio înainte de orice request TTS asincron.
if (typeof document !== 'undefined') {
  const unlockOnGesture = () => {
    primeMediaElement();
    if (!audioUnlocked) void unlockAudio(false);
  };
  document.addEventListener('pointerdown', unlockOnGesture, { capture: true, passive: true });
  document.addEventListener('touchend', unlockOnGesture, { capture: true, passive: true });
}
