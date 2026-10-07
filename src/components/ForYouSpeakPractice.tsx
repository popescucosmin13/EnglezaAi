import { useEffect, useRef, useState } from 'react';
import { Recorder } from '../audio/recorder';
import { Icon } from './Icon';

interface Props {
  target: string;
  active: boolean;
  compact?: boolean;
  isPlaying: boolean;
  completed: boolean;
  onPlay: () => void;
  onComplete: () => void;
}

export function ForYouSpeakPractice({ target, active, compact = false, isPlaying, completed, onPlay, onComplete }: Props) {
  const recorderRef = useRef<Recorder | null>(null);
  const audioUrlRef = useRef('');
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');

  function replaceAudioUrl(next: string) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = next;
    setAudioUrl(next);
  }

  async function startRecording() {
    setError('');
    replaceAudioUrl('');
    const recorder = new Recorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setRecording(true);
    } catch {
      recorderRef.current = null;
      setError('Microfonul nu este disponibil. Poți asculta modelul și confirma manual după ce repeți.');
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const blob = await recorder.stop();
      replaceAudioUrl(URL.createObjectURL(blob));
    } catch {
      setError('Înregistrarea nu a putut fi salvată. Poți încerca din nou.');
    } finally {
      recorderRef.current = null;
      setRecording(false);
    }
  }

  useEffect(() => () => {
    recorderRef.current?.cancel();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  useEffect(() => {
    if (active) return;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
  }, [active]);

  return (
    <div className={`for-you-speak-practice${compact ? ' is-compact' : ''}`}>
      <div className="for-you-speak-head">
        <span><Icon name="mic" size={15} /> Practică aici</span>
        <small>înregistrare locală · 0 tokeni</small>
      </div>
      <p>{compact
        ? 'Repetă ultima replică, redă vocea ta și compară ritmul.'
        : 'Ascultă modelul, înregistrează-te spunând replica, apoi redă vocea ta și compară ritmul.'}</p>
      <div className="for-you-speak-actions">
        <button onClick={onPlay} aria-label={`Ascultă modelul: ${target}`}><Icon name={isPlaying ? 'audio' : 'volume'} size={17} /> {isPlaying ? 'Se redă…' : 'Ascultă modelul'}</button>
        {recording ? (
          <button className="recording" onClick={() => void stopRecording()}><Icon name="square" size={15} /> Oprește</button>
        ) : (
          <button onClick={() => void startRecording()}><Icon name="mic" size={17} /> Înregistrează-te</button>
        )}
      </div>
      {recording && <div className="for-you-recording-live" aria-live="polite"><span /> Înregistrezi acum — spune replica de mai sus.</div>}
      {audioUrl && (
        <div className="for-you-recording-review">
          <small>Vocea ta</small>
          <audio controls src={audioUrl} />
        </div>
      )}
      {error && <p className="for-you-speak-error" role="status">{error}</p>}
      {completed ? (
        <div className="for-you-speak-complete">
          <Icon name="checkCircle" size={17} />
          <span><strong>Practică terminată</strong><small>Poți asculta sau înregistra din nou oricând.</small></span>
        </div>
      ) : (
        <button className="for-you-spoken-confirm" onClick={onComplete}>
          <Icon name="checkCircle" size={17} /> Am repetat și am comparat
        </button>
      )}
    </div>
  );
}
