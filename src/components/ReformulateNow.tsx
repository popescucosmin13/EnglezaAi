// Reformulare la cald (§12+): imediat după raport, utilizatorul rostește varianta
// corectă a fiecărei greșeli principale. Succesul actualizează SRS-ul greșelii persistate.

import { useEffect, useRef, useState } from 'react';
import type { Mistake, ReportMistake, Session } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { getMistakes, bumpActivity, addXp, saveSession } from '../db/db';
import { reviewMistake } from '../logic/engine';
import { Icon } from './Icon';

const PASS_SCORE = 80;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, '').replace(/\s+/g, ' ').trim();
}

type StepState = 'pending' | 'recording' | 'checking' | 'passed' | 'failed';

export default function ReformulateNow({ mistakes, session }: { mistakes: ReportMistake[]; session?: Session }) {
  // Corectările deja reformulate cu succes (persistate pe sesiune) — la redeschiderea raportului
  // apar ca rezolvate, nu de la zero.
  const resolved = useRef<Set<string>>(new Set((session?.resolvedMistakes ?? []).map(norm)));
  const [idx, setIdx] = useState(() => {
    const firstUnresolved = mistakes.findIndex((mm) => !resolved.current.has(norm(mm.correct)));
    return firstUnresolved === -1 ? mistakes.length : firstUnresolved;
  });
  const [state, setState] = useState<StepState>('pending');
  const [score, setScore] = useState<number | null>(null);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const [passedCount, setPassedCount] = useState(() => mistakes.filter((mm) => resolved.current.has(norm(mm.correct))).length);
  const recorder = useRef(new Recorder());
  const persisted = useRef<Mistake[] | null>(null);

  useEffect(() => {
    getMistakes().then((m) => { persisted.current = m; }).catch(() => { persisted.current = []; });
  }, []);

  if (mistakes.length === 0) return null;
  const done = idx >= mistakes.length;
  const m = done ? null : mistakes[idx];

  /** Greșeala persistată care corespunde corectării din raport (match tolerant). */
  function findPersisted(correct: string): Mistake | undefined {
    const target = norm(correct);
    return persisted.current?.find(
      (p) => norm(p.corrected) === target || norm(p.corrected).includes(target) || target.includes(norm(p.corrected))
    );
  }

  function advance() {
    setIdx((i) => i + 1);
    setState('pending');
    setScore(null);
    setHeard('');
    setError('');
  }

  async function toggleRecording() {
    if (!m) return;
    if (state === 'recording') {
      setState('checking');
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(m.correct));
        const res = sttDiffAssessment(m.correct, text);
        setScore(res.accuracyScore);
        setHeard(text);
        if (res.accuracyScore >= PASS_SCORE) {
          setState('passed');
          setPassedCount((n) => n + 1);
          await bumpActivity('sentencesRepeated', 1);
          await addXp(10);
          const persistedMistake = findPersisted(m.correct);
          if (persistedMistake) await reviewMistake(persistedMistake, 'good');
          // marcăm corectarea ca rezolvată pe sesiune, ca la redeschiderea raportului să rămână rezolvată
          const key = norm(m.correct);
          if (session && !resolved.current.has(key)) {
            resolved.current.add(key);
            session.resolvedMistakes = [...(session.resolvedMistakes ?? []), m.correct];
            await saveSession(session).catch(() => {});
          }
        } else {
          setState('failed');
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
        setState('pending');
      }
      return;
    }
    try {
      await recorder.current.start();
      setError('');
      setState('recording');
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  if (done) {
    return (
      <div className="card reformulate-card">
        <h3><Icon name="repeat" />Reformulare la cald</h3>
        <p className="muted">
          {passedCount === mistakes.length
            ? `Excelent! Ai reformulat corect toate cele ${mistakes.length} greșeli — corectarea imediată e cea care rămâne. +${passedCount * 10} XP`
            : `Ai reformulat ${passedCount} din ${mistakes.length} greșeli. Restul revin la recapitulare în zilele următoare.`}
        </p>
      </div>
    );
  }

  return (
    <div className="card reformulate-card">
      <div className="reformulate-head">
        <h3><Icon name="repeat" />Reformulează acum</h3>
        <span className="badge soft">{idx + 1} / {mistakes.length}</span>
      </div>
      <p className="muted">Rostește pe loc varianta corectă — corectarea imediată se ține minte cel mai bine.</p>

      <div className="mirror-row mirror-said"><span className="lbl">Ce ai spus</span>{m!.said}</div>
      <div className="mirror-row mirror-correct">
        <span className="lbl">Rostește corect</span>{m!.correct}
        <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(m!.correct, 0.95)} aria-label="Ascultă"><Icon name="volume" /></button>
      </div>

      <div className="btn-row">
        <button
          className={state === 'recording' ? 'btn-danger' : 'btn-primary'}
          disabled={state === 'checking'}
          onClick={toggleRecording}
        >
          {state === 'checking' ? <Icon name="loader" className="icon-spin" /> : <Icon name={state === 'recording' ? 'stop' : 'mic'} />}
          {state === 'recording' ? 'Oprește și verifică' : state === 'checking' ? 'Se verifică…' : 'Rostește corectarea'}
        </button>
        {(state === 'passed' || state === 'failed') && (
          <button onClick={advance}>{idx === mistakes.length - 1 ? 'Încheie' : 'Următoarea →'}</button>
        )}
        {state === 'failed' && <button className="btn-ghost" onClick={() => { setState('pending'); setScore(null); }}>↻ Mai încearcă</button>}
      </div>

      {score != null && (
        <p className={state === 'passed' ? 'reformulate-pass' : 'reformulate-fail'}>
          {state === 'passed' && <Icon name="checkCircle" size={17} />} {state === 'passed' ? `${score}% — corect! +10 XP` : `${score}% — am auzit: „${heard}". Ascultă din nou și reia.`}
        </p>
      )}
      {error && <p className="tiny" style={{ color: 'var(--danger)' }}><Icon name="xCircle" size={15} /> {error}</p>}
    </div>
  );
}
