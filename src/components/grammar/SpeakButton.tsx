// Buton mic de ascultare, folosit peste tot în cursul de gramatică.

import { Icon } from '../Icon';
import { speak } from '../../audio/tts';

/** Curăță formele de tabel („he / she / it works") ca sinteza vocală să nu citească „slash". */
export function speakable(text: string): string {
  return text
    .replace(/he \/ she \/ it/gi, 'he')
    .replace(/was \/ were/gi, 'was')
    .replace(/you \(voi\)/gi, 'you')
    .replace(/\s*\/\s*/g, ' or ');
}

export function SpeakButton({ text, size = 16 }: { text: string; size?: number }) {
  return (
    <button
      className="btn-ghost"
      style={{ padding: '0 6px', minHeight: 26, flex: '0 0 auto' }}
      onClick={() => void speak(speakable(text), 0.95)}
      aria-label={`Ascultă „${text}"`}
    >
      <Icon name="volume" size={size} />
    </button>
  );
}
