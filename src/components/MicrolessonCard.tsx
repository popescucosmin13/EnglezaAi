// Cardul unei microlecții (regulă + exemple + exercițiu vocal) — reutilizat în tab-ul Gramatică
// (curriculum și lecții salvate) și în „Reia scena" (lecție generată dintr-o propoziție proprie).

import { useRef, useState } from 'react';
import type { Microlesson } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { bumpActivity } from '../db/db';
import { Icon } from './Icon';
import type { ReactNode } from 'react';

export default function MicrolessonCard({
  lesson,
  badge = 'Microlecție',
  footer,
}: {
  lesson: Microlesson;
  badge?: string;
  footer?: ReactNode;
}) {
  const [recording, setRecording] = useState(false);
  const [voiceScore, setVoiceScore] = useState<number | null>(null);
  const recorder = useRef(new Recorder());

  async function voiceExercise() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(lesson.voiceExercise));
        setVoiceScore(sttDiffAssessment(lesson.voiceExercise, text).accuracyScore);
        await bumpActivity('sentencesRepeated', 1);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card">
      {badge && <span className="badge">{badge}</span>}
      <h3>{lesson.rule}</h3>
      {lesson.patternRo && (
        <div className="info-banner" style={{ textAlign: 'left' }}>
          <strong>Tipar:</strong> {lesson.patternRo}
        </div>
      )}
      <p className="muted">{lesson.explanationRo}</p>
      {lesson.whenToUseRo && (
        <p className="tiny"><strong>Când se folosește:</strong> {lesson.whenToUseRo}</p>
      )}
      {lesson.examples.map((ex, i) => (
        <p key={i} style={{ margin: '6px 0' }}>
          <strong>{ex.en}</strong>{' '}
          <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(ex.en, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button>
          <br /><span className="tiny">{ex.ro}</span>
        </p>
      ))}
      {lesson.personalExamples.length > 0 && <p className="tiny" style={{ fontWeight: 700 }}>Din contextul tău:</p>}
      {lesson.personalExamples.map((ex, i) => (
        <p key={i} className="muted" style={{ margin: '4px 0' }}>{ex}</p>
      ))}
      {lesson.targetPhrases.length > 0 && (
        <div className="chip-row">
          {lesson.targetPhrases.map((p, i) => (
            <span key={i} className="chip selected">{p}</span>
          ))}
        </div>
      )}
      <p style={{ fontWeight: 600 }}><Icon name="mic" size={17} /> Rostește: {lesson.voiceExercise}</p>
      <div className="btn-row">
        <button className="btn-ghost" onClick={() => speak(lesson.voiceExercise, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
        <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={voiceExercise}>
          <Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Oprește' : 'Rostește'}
        </button>
        {voiceScore != null && <span className={voiceScore >= 80 ? 'ws-good' : 'ws-mid'} style={{ padding: '4px 10px', borderRadius: 10 }}>{voiceScore}%</span>}
      </div>
      {footer}
    </div>
  );
}
