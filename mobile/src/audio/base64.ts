// Helperi puri base64 + header WAV — fără dependență de atob/btoa (Hermes le are, dar nu riscăm).
// Înlocuiește wav.ts de pe web: conversia webm→WAV dispare (înregistrăm direct WAV pe iOS).

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(128).fill(255);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  t['='.charCodeAt(0)] = 0;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = (clean.length / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean.charCodeAt(i)];
    const c1 = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c2 = B64_LOOKUP[clean.charCodeAt(i + 2)];
    const c3 = B64_LOOKUP[clean.charCodeAt(i + 3)];
    if (o < outLen) out[o++] = (c0 << 2) | (c1 >> 4);
    if (o < outLen) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (o < outLen) out[o++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}

/** PCM16 mono little-endian (base64, ex. de la Google AI TTS) → fișier WAV complet, ca base64. */
export function pcmBase64ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = base64ToBytes(pcmBase64);
  const buffer = new Uint8Array(44 + pcm.length);
  const view = new DataView(buffer.buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  buffer.set(pcm, 44);
  return bytesToBase64(buffer);
}

/** Citește header-ul unui WAV (validare la debug): întoarce sampleRate/canale/biți sau null. */
export function parseWavHeader(bytes: Uint8Array): { sampleRate: number; channels: number; bitsPerSample: number } | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}
