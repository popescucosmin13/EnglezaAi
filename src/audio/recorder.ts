// Recorder pe MediaRecorder — start/stop, întoarce Blob-ul înregistrat.

import { notifyMicSessionEnded, notifyMicSessionStarted } from './tts';

export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private micNotified = false;

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /** Stream-ul activ al microfonului (pentru detecția de tăcere în modul hands-free). */
  getStream(): MediaStream | null {
    return this.stream;
  }

  async start(): Promise<void> {
    // Procesare la sursă pentru vorbire mai curată: ecoul TTS-ului (hands-free), zgomotul de fond
    // și volumul variabil strică recunoașterea. Constrângerile nesuportate sunt ignorate de browser.
    // TTS-ul trebuie să știe că se deschide microfonul: pe iOS asta schimbă ruta audio (Bluetooth
    // trece pe canalul de convorbire) și invalidează contextul de redare.
    notifyMicSessionStarted();
    this.micNotified = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      this.releaseMicSession();
      throw e;
    }
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    this.mediaRecorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder;
      if (!mr || mr.state === 'inactive') {
        this.cleanup();
        reject(new Error('Nu se înregistrează.'));
        return;
      }
      mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };
      mr.stop();
    });
  }

  cancel(): void {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    } catch {
      /* ignore */
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.mediaRecorder = null;
    this.releaseMicSession();
  }

  private releaseMicSession() {
    if (!this.micNotified) return;
    this.micNotified = false;
    notifyMicSessionEnded();
  }
}

// ---------- Web Speech API (fallback STT gratuit, live) ----------
type SpeechRecognitionCtor = new () => any;

export function getWebSpeech(): SpeechRecognitionCtor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Recunoaștere live: emite interimuri prin onInterim, întoarce textul final la stop. */
export class LiveRecognizer {
  private rec: any = null;
  private finalText = '';

  start(onInterim: (text: string) => void): boolean {
    const Ctor = getWebSpeech();
    if (!Ctor) return false;
    this.finalText = '';
    this.rec = new Ctor();
    this.rec.lang = 'en-US';
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      onInterim((this.finalText + interim).trim());
    };
    try {
      this.rec.start();
      return true;
    } catch {
      return false;
    }
  }

  stop(): string {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    const t = this.finalText.trim();
    this.rec = null;
    return t;
  }
}
