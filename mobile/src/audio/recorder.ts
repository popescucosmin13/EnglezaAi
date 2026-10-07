// Recorder pe expo-audio — start/stop, întoarce RecordedAudio (fișier local, nu Blob).
// iOS: WAV LINEARPCM 16 kHz mono 16-bit — exact formatul cerut de Azure Pronunciation
// Assessment și acceptat de OpenRouter STT; conversia/reeșantionarea de pe web dispare.
// Android (secundar): m4a/AAC — OpenRouter STT îl acceptă; Azure cade pe fallback-ul stt-diff.

import { Alert, Linking, Platform } from 'react-native';
import {
  AudioModule,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  AudioQuality,
  IOSOutputFormat,
  PermissionStatus,
  type RecordingOptions,
  type RecorderState,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { notifyMicSessionEnded } from './tts';

/** Moneda audio a aplicației (înlocuiește Blob-ul de pe web). */
export interface RecordedAudio {
  uri: string;
  mimeType: 'audio/wav' | 'audio/m4a';
  /** Formatul pentru input_audio la OpenRouter. */
  format: 'wav' | 'm4a';
  /** Citește fișierul ca base64 (o singură dată, apoi eliberează referința). */
  base64(): Promise<string>;
  /** Șterge fișierul de pe disc (best-effort). */
  dispose(): Promise<void>;
}

export function makeRecordedAudio(uri: string): RecordedAudio {
  const isWav = uri.toLowerCase().endsWith('.wav');
  return {
    uri,
    mimeType: isWav ? 'audio/wav' : 'audio/m4a',
    format: isWav ? 'wav' : 'm4a',
    async base64() {
      return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    },
    async dispose() {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    },
  };
}

const RECORDING_OPTIONS: RecordingOptions = {
  extension: Platform.OS === 'ios' ? '.wav' : '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

function showMicrophoneRationale(): Promise<boolean> {
  if (Platform.OS !== 'android') return Promise.resolve(true);

  return new Promise((resolve) => {
    Alert.alert(
      'Permite accesul la microfon',
      'Ca să îți asculte pronunția și răspunsurile, EnglezaAI are nevoie de microfon. Înregistrarea pornește numai când apeși butonul de microfon sau activezi modul hands-free.',
      [
        { text: 'Nu acum', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuă', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

function showMicrophoneSettingsAlert(): void {
  const settingsName = Platform.OS === 'android' ? 'Setările Android' : 'Setările telefonului';
  Alert.alert(
    'Microfonul este dezactivat',
    `Permisiunea nu mai poate fi cerută automat. Deschide ${settingsName} și activează Microfon pentru EnglezaAI.`,
    [
      { text: 'Mai târziu', style: 'cancel' },
      { text: 'Deschide setările', onPress: () => void Linking.openSettings().catch(() => {}) },
    ],
  );
}

async function ensureMicrophonePermission(): Promise<void> {
  let permission = await getRecordingPermissionsAsync();
  if (permission.granted) return;

  if (permission.status === PermissionStatus.UNDETERMINED) {
    const shouldContinue = await showMicrophoneRationale();
    if (!shouldContinue) throw new Error('Accesul la microfon nu a fost acordat.');
  }

  if (permission.canAskAgain) permission = await requestRecordingPermissionsAsync();
  if (permission.granted) return;

  if (!permission.canAskAgain) showMicrophoneSettingsAlert();
  throw new Error('Nu am acces la microfon. Verifică permisiunea aplicației în Setările telefonului.');
}

export class Recorder {
  private recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  private recording = false;

  get isRecording(): boolean {
    return this.recording;
  }

  /** Starea nativă (durationMillis, metering în dBFS) — folosită de detecția de tăcere. */
  getStatus(): RecorderState | null {
    if (!this.recorder) return null;
    try {
      return this.recorder.getStatus();
    } catch {
      return null;
    }
  }

  async start(): Promise<void> {
    await ensureMicrophonePermission();

    // playAndRecord cu redare pe difuzor (nu pe casca de convorbire); TTS-ul merge și pe Silent.
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'doNotMix',
    });

    this.recorder = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
    await this.recorder.prepareToRecordAsync();
    this.recorder.record();
    this.recording = true;
  }

  async stop(): Promise<RecordedAudio> {
    const rec = this.recorder;
    if (!rec || !this.recording) {
      await this.cleanup();
      throw new Error('Nu se înregistrează.');
    }
    this.recording = false;
    try {
      await rec.stop();
      const uri = rec.uri;
      if (!uri) throw new Error('Înregistrarea nu a produs niciun fișier.');
      return makeRecordedAudio(uri);
    } finally {
      await this.cleanup();
    }
  }

  cancel(): void {
    const rec = this.recorder;
    this.recording = false;
    if (rec) {
      rec
        .stop()
        .then(() => {
          if (rec.uri) void FileSystem.deleteAsync(rec.uri, { idempotent: true }).catch(() => {});
        })
        .catch(() => {});
    }
    void this.cleanup();
  }

  private async cleanup() {
    const rec = this.recorder;
    this.recorder = null;
    if (rec) {
      try {
        rec.release();
      } catch {
        /* deja eliberat */
      }
    }
    // înapoi pe categoria de redare — altfel iOS ține sesiunea playAndRecord (volum/rutare de convorbire)
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
    // TTS-ul așteaptă comutarea Bluetooth înapoi pe canalul media înainte să vorbească
    notifyMicSessionEnded();
  }
}
