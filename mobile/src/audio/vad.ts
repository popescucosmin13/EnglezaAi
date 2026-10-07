// Detector de tăcere pentru modul hands-free (mașină): oprește automat înregistrarea
// când utilizatorul a terminat de vorbit. Portat de pe WebAudio pe metering-ul expo-audio.
//
// Echivalența cu web-ul: acolo pragul e relativ la podeaua de zgomot RMS, aici la aceeași
// podea exprimată în dBFS (metering). În ambele, podeaua urcă lent în zgomot susținut și
// coboară repede în liniște, iar începutul/sfârșitul vorbirii au praguri diferite (histerezis).

import type { Recorder } from './recorder';

export interface SilenceWatcherOptions {
  /** Apelat o singură dată când trebuie oprită înregistrarea. hadSpeech=false = nu s-a vorbit deloc. */
  onAutoStop: (hadSpeech: boolean) => void;
  /** Pauză de tăcere după vorbire care încheie replica (ms). */
  silenceMs?: number;
  /** Dacă nu se aude nimic atât timp, renunțăm (ms). */
  noSpeechMs?: number;
  /** Durata maximă a unei replici (ms). */
  maxMs?: number;
}

const SPEECH_FLOOR_DB = -48; // sub acest nivel nu considerăm niciodată vorbire
const SPEECH_JUMP_DB = 9; // saltul cerut peste zgomotul de fond ca să înceapă vorbirea
const SPEECH_DROP_DB = 5; // histerezis: sub atâta peste fond, vorbirea s-a încheiat
const NOISE_EMA_QUIET = 0.15; // în liniște coborâm repede
const NOISE_EMA_LOUD = 0.005; // în zgomot susținut (rulare, ventilație) urcăm lent
const CALIBRATION_MS = 500;

/**
 * Detector de vorbire cu prag relativ la zgomotul ambiental și histerezis.
 *
 * Varianta veche actualiza zgomotul de fond DOAR în liniște: în mașină, unde nivelul de fond stă
 * permanent peste -42 dB, detectorul „auzea vorbire" continuu, nu se declanșa niciodată pauza de
 * final și replica se tăia abia la limita de 60s — un minut de zgomot trimis la STT.
 */
function createSpeechDetector() {
  let noiseFloorDb = -55;
  let elapsed = 0;
  let speaking = false;
  return (db: number, tickMs: number): boolean => {
    elapsed += tickMs;
    const ema = db < noiseFloorDb ? NOISE_EMA_QUIET : NOISE_EMA_LOUD;
    noiseFloorDb = noiseFloorDb * (1 - ema) + db * ema;
    if (elapsed < CALIBRATION_MS) return false; // calibrăm ambientul înainte de prima decizie
    const on = Math.max(SPEECH_FLOOR_DB, noiseFloorDb + SPEECH_JUMP_DB);
    const off = Math.max(SPEECH_FLOOR_DB - 3, noiseFloorDb + SPEECH_DROP_DB);
    speaking = speaking ? db > off : db > on;
    return speaking;
  };
}

/**
 * Măsoară timpul efectiv vorbit dintr-o înregistrare (metering peste pragul adaptiv),
 * ca statisticile „minute vorbite" să reflecte vorbirea reală, nu durata cu microfonul deschis.
 */
export class VoiceMeter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private voicedMs = 0;

  /** Pornește măsurarea. Întoarce false dacă metering-ul nu e disponibil (fallback pe durata totală). */
  start(recorder: Recorder): boolean {
    this.stop();
    this.voicedMs = 0;
    const TICK_MS = 100;
    const detect = createSpeechDetector();
    this.timer = setInterval(() => {
      const status = recorder.getStatus();
      const db = status?.metering;
      if (typeof db !== 'number' || !isFinite(db)) return;
      if (detect(db, TICK_MS)) this.voicedMs += TICK_MS;
    }, TICK_MS);
    // nu putem ști sincron dacă metering-ul funcționează; raportăm true și lăsăm
    // apelantul să folosească fallback-ul dacă stop() întoarce 0
    return true;
  }

  /** Oprește măsurarea și întoarce secundele efectiv vorbite (0 dacă nu s-a măsurat nimic). */
  stop(): number {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const sec = this.voicedMs / 1000;
    this.voicedMs = 0;
    return sec;
  }
}

export class SilenceWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Pornește monitorizarea pe recorder-ul activ. Întoarce false dacă nu se poate porni. */
  start(recorder: Recorder, opts: SilenceWatcherOptions): boolean {
    this.stop();
    const silenceMs = opts.silenceMs ?? 1800;
    const noSpeechMs = opts.noSpeechMs ?? 12_000;
    const maxMs = opts.maxMs ?? 60_000;
    const TICK_MS = 120;
    const detect = createSpeechDetector();
    let hadSpeech = false;
    let loudTicks = 0;
    const startedAt = Date.now();
    let lastLoudAt = Date.now();

    this.timer = setInterval(() => {
      const status = recorder.getStatus();
      const now = Date.now();
      const db = status?.metering;
      if (typeof db === 'number' && isFinite(db)) {
        if (detect(db, TICK_MS)) {
          loudTicks += 1;
          // două tick-uri consecutive: un pocnet din trafic nu trece drept început de replică
          if (loudTicks >= 2) {
            hadSpeech = true;
            lastLoudAt = now;
          }
        } else {
          loudTicks = 0;
        }
      }

      const finish = () => {
        const spoke = hadSpeech;
        this.stop();
        opts.onAutoStop(spoke);
      };
      if (hadSpeech && now - lastLoudAt >= silenceMs) return finish();
      if (!hadSpeech && now - startedAt >= noSpeechMs) return finish();
      if (now - startedAt >= maxMs) return finish();
    }, TICK_MS);
    return true;
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
