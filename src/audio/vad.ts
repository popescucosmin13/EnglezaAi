// Detector de tăcere pentru modul hands-free (mașină): oprește automat
// înregistrarea când utilizatorul a terminat de vorbit, fără apăsare pe microfon.

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

// ---------- AudioContext partajat pentru analiză ----------
//
// Safari pe iOS tolerează doar câteva AudioContext-uri simultane și nu le eliberează imediat la
// close(). Un context nou per înregistrare (×2: tăcere + măsurare) epuiza limita după câteva ture,
// iar `new AudioContext()` începea să arunce — hands-free rămânea cu microfonul deschis la nesfârșit.
// Aici există UN singur context de analiză, reținut între înregistrări și eliberat prin refcount.

let analysisCtx: AudioContext | null = null;
let analysisRefs = 0;

interface AnalysisTap {
  analyser: AnalyserNode;
  release: () => void;
}

function acquireAnalyser(stream: MediaStream): AnalysisTap | null {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    if (!analysisCtx || analysisCtx.state === 'closed') analysisCtx = new AudioContextClass();
    const ctx = analysisCtx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* analiza merge și suspendată pe unele browsere */ });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analysisRefs += 1;
    let released = false;
    return {
      analyser,
      release: () => {
        if (released) return;
        released = true;
        try { source.disconnect(); } catch { /* deja deconectat */ }
        try { analyser.disconnect(); } catch { /* deja deconectat */ }
        analysisRefs = Math.max(0, analysisRefs - 1);
        // Contextul rămâne deschis: recrearea lui la fiecare replică e exact ce epuiza limita iOS.
      },
    };
  } catch {
    return null;
  }
}

const TICK_MS = 100;

/**
 * Prag de vorbire relativ la zgomotul ambiental, cu histerezis.
 *
 * Pragul absolut de dinainte (0.015) era depășit permanent de zgomotul de rulare din mașină:
 * detectorul „auzea vorbire" continuu, nu se declanșa niciodată pauza și replica se tăia abia la
 * limita de 60s, trimițând un minut de zgomot la STT. Acum podeaua de zgomot urcă lent în zgomot
 * susținut și coboară repede în liniște, iar vorbirea trebuie să sară clar peste ea.
 */
function createSpeechDetector() {
  let floor = 0.004;
  let elapsed = 0;
  let speaking = false;
  return (rms: number): boolean => {
    elapsed += TICK_MS;
    if (rms < floor) floor = floor * 0.85 + rms * 0.15; // liniște: coborâm repede
    else floor = floor * 0.995 + rms * 0.005;           // zgomot susținut: urcăm lent
    floor = Math.min(Math.max(floor, 0.0005), 0.25);
    // primele ~500ms doar calibrăm ambientul (ex. intrarea în tunel, ventilația pornită)
    if (elapsed < 500) return false;
    const on = Math.max(0.006, floor * 3);
    const off = Math.max(0.004, floor * 1.8);
    speaking = speaking ? rms > off : rms > on;
    return speaking;
  };
}

function rmsOf(analyser: AnalyserNode, data: Float32Array): number {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/**
 * Măsoară timpul efectiv vorbit dintr-o înregistrare (RMS peste pragul adaptiv de zgomot),
 * ca statisticile „minute vorbite" să reflecte vorbirea reală, nu durata cu microfonul deschis.
 */
export class VoiceMeter {
  private tap: AnalysisTap | null = null;
  private timer: number | null = null;
  private voicedMs = 0;

  /** Pornește măsurarea. Întoarce false dacă WebAudio nu e disponibil (se folosește fallback-ul pe durata totală). */
  start(stream: MediaStream): boolean {
    this.stop();
    this.voicedMs = 0;
    this.tap = acquireAnalyser(stream);
    if (!this.tap) return false;
    const analyser = this.tap.analyser;
    const data = new Float32Array(analyser.fftSize);
    const detect = createSpeechDetector();
    this.timer = window.setInterval(() => {
      if (!this.tap) return;
      if (detect(rmsOf(analyser, data))) this.voicedMs += TICK_MS;
    }, TICK_MS);
    return true;
  }

  /** Oprește măsurarea și întoarce secundele efectiv vorbite (0 dacă nu s-a măsurat nimic). */
  stop(): number {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.tap?.release();
    this.tap = null;
    const sec = this.voicedMs / 1000;
    this.voicedMs = 0;
    return sec;
  }
}

export class SilenceWatcher {
  private tap: AnalysisTap | null = null;
  private timer: number | null = null;

  /** Pornește monitorizarea pe stream-ul microfonului. Întoarce false dacă WebAudio nu e disponibil. */
  start(stream: MediaStream, opts: SilenceWatcherOptions): boolean {
    this.stop();
    this.tap = acquireAnalyser(stream);
    if (!this.tap) return false;
    const analyser = this.tap.analyser;
    const data = new Float32Array(analyser.fftSize);
    const detect = createSpeechDetector();

    const silenceMs = opts.silenceMs ?? 1800;
    const noSpeechMs = opts.noSpeechMs ?? 12_000;
    const maxMs = opts.maxMs ?? 60_000;
    let hadSpeech = false;
    let loudTicks = 0;
    const startedAt = Date.now();
    let lastLoudAt = Date.now();

    this.timer = window.setInterval(() => {
      if (!this.tap) return;
      const now = Date.now();
      if (detect(rmsOf(analyser, data))) {
        loudTicks += 1;
        // două tick-uri consecutive: un pocnet din trafic nu trebuie să treacă drept început de replică
        if (loudTicks >= 2) {
          hadSpeech = true;
          lastLoudAt = now;
        }
      } else {
        loudTicks = 0;
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
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.tap?.release();
    this.tap = null;
  }
}
