// Raportul după conversație (§12): rezumat, ce ai făcut bine, max 3 greșeli cu exercițiu vocal.

import { useRef, useState } from 'react';
import type { Session, SessionReport, Utterance, Microlesson } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { checkWithLanguageTool, type LtMatch } from '../api/languagetool';
import { TappableText } from './TappableText';
import MicrolessonCard from './MicrolessonCard';
import { bumpActivity, addXp, getProfile, saveSavedLesson, newId } from '../db/db';
import { chatJson } from '../api/openrouter';
import { buildRedoSceneEvalPrompt, buildSentenceLessonPrompt, isMicrolessonShape } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import ReformulateNow from './ReformulateNow';
import { Icon } from './Icon';

export default function ReportView({ session, report }: { session: Session; report?: SessionReport }) {
  const [recordingIdx, setRecordingIdx] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [ltMatches, setLtMatches] = useState<LtMatch[] | null>(session.grammarMatches ?? null);
  const [ltBusy, setLtBusy] = useState(false);
  const [ltError, setLtError] = useState<string | null>(null);
  const recorder = useRef(new Recorder());

  const minutes = Math.round(session.userSpeakingSec / 60);
  const per100 = session.wordCount > 0 ? ((session.errorCount / session.wordCount) * 100).toFixed(1) : '0';
  const pause = session.avgHesitationMs != null ? (session.avgHesitationMs / 1000).toFixed(1) : '—';

  async function repeatSentence(key: string, target: string) {
    if (recordingIdx === key) {
      setRecordingIdx(null);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(target));
        const res = sttDiffAssessment(target, text);
        setScores((s) => ({ ...s, [key]: res.accuracyScore }));
        await bumpActivity('sentencesRepeated', 1);
        await addXp(res.accuracyScore >= 80 ? 8 : 4);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecordingIdx(key);
    } catch {
      /* fără mic */
    }
  }

  async function runLanguageTool() {
    setLtBusy(true);
    setLtError(null);
    const userText = session.turns.filter((t) => t.role === 'user').map((t) => t.text).join('. ');
    try {
      setLtMatches(await checkWithLanguageTool(userText));
    } catch (e: any) {
      setLtError(String(e?.message ?? e));
    }
    setLtBusy(false);
  }

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-tile"><div className="value">{Math.round(session.durationSec / 60)}</div><div className="label">min sesiune</div></div>
        <div className="stat-tile"><div className="value">{minutes}</div><div className="label">min vorbite de tine</div></div>
        <div className="stat-tile"><div className="value">{session.wordCount}</div><div className="label">cuvinte</div></div>
        <div className="stat-tile"><div className="value">{pause}</div><div className="label">pauza medie (s)</div></div>
        <div className="stat-tile"><div className="value">{per100}</div><div className="label">greșeli / 100 cuvinte</div></div>
        {report && <div className="stat-tile"><div className="value">{report.generalScore}</div><div className="label">scor general</div></div>}
      </div>

      {report && (
        <>
          <p className="muted" style={{ marginTop: 12 }}>{report.summaryRo}</p>

          <h2><Icon name="checkCircle" size={16} />Ce ai făcut bine</h2>
          <div className="card">
            {report.wellDone.map((w, i) => (
              <p key={i} style={{ margin: '5px 0' }}>• {w}</p>
            ))}
          </div>

          {report.mainMistakes.length > 0 && <h2><Icon name="target" size={16} />Greșelile principale (max 3)</h2>}
          {report.mainMistakes.map((m, i) => (
            <div key={i} className="card">
              <div className="mirror-row mirror-said"><span className="lbl">Ce ai spus</span>{m.said}</div>
              <div className="mirror-row mirror-correct">
                <span className="lbl">Corect</span><TappableText text={m.correct} />
                <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(m.correct, 0.95)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
              <div className="mirror-row mirror-natural">
                <span className="lbl">Mai natural</span><TappableText text={m.natural} />
                <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(m.natural, 0.95)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
              <p className="muted">{m.explanationRo}</p>
              <p className="tiny" style={{ fontWeight: 700 }}>Exercițiu — rostește:</p>
              {m.exerciseSentences.map((s, j) => {
                const key = `${i}-${j}`;
                return (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                    <TappableText text={s} style={{ flex: 1 }} />
                    <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(s, 0.95)} aria-label="Ascultă"><Icon name="volume" /></button>
                    <button
                      className={recordingIdx === key ? 'btn-danger' : ''}
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      onClick={() => repeatSentence(key, s)}
                    >
                      <Icon name={recordingIdx === key ? 'stop' : 'mic'} />
                    </button>
                    {scores[key] != null && (
                      <span className={scores[key] >= 80 ? 'ws-good' : 'ws-mid'} style={{ padding: '2px 8px', borderRadius: 8, fontSize: '0.8rem' }}>
                        {scores[key]}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {report.mainMistakes.length > 0 && <ReformulateNow mistakes={report.mainMistakes} session={session} />}

          {report.newExpressions.length > 0 && (
            <>
              <h2><Icon name="sparkles" size={16} />Expresii noi</h2>
              <div className="chip-row">
                {report.newExpressions.map((e, i) => (
                  <TappableText key={i} text={e} className="chip selected" />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <RedoScene session={session} />

      {/* Fără replici ale utilizatorului nu există text de verificat — serverul ar respinge cererea goală. */}
      {session.turns.some((t) => t.role === 'user') && (
        <>
          <h2><Icon name="search" size={16} />Verificare suplimentară</h2>
          {!ltMatches && (
            <button onClick={runLanguageTool} disabled={ltBusy}>
              {ltBusy ? 'Se verifică…' : ltError ? 'Reîncearcă' : 'Rulează din nou verificarea'}
            </button>
          )}
          {ltError && <p className="tiny" style={{ color: 'var(--danger, #c0392b)' }}><Icon name="xCircle" size={15} /> {ltError}</p>}
          {ltMatches && ltMatches.length === 0 && <p className="muted"><Icon name="party" size={16} /> Nicio problemă suplimentară găsită.</p>}
          {ltMatches &&
            ltMatches.slice(0, 8).map((m, i) => (
              <p key={i} className="tiny" style={{ margin: '4px 0' }}>
                • {m.message} {m.replacements.length > 0 && <strong>→ {m.replacements.join(' / ')}</strong>}
              </p>
            ))}
        </>
      )}
    </div>
  );
}

/** Reia scena (§P1): refaci momentul cu cele mai multe greșeli din conversație, mai natural. */
function RedoScene({ session }: { session: Session }) {
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ improved: boolean; feedbackRo: string; bestVersionEn: string } | null>(null);
  const [error, setError] = useState('');
  const [lesson, setLesson] = useState<Microlesson | null>(null);
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonSaved, setLessonSaved] = useState(false);
  const recorder = useRef(new Recorder());

  // momentul cu cele mai multe greșeli + replica profesorului dinaintea lui
  const moment = ((): { teacher?: Utterance; learner: Utterance; errors: number } | null => {
    let best: { teacher?: Utterance; learner: Utterance; errors: number } | null = null;
    for (let i = 0; i < session.turns.length; i++) {
      const t = session.turns[i];
      if (t.role !== 'user' || !t.analysis) continue;
      const errors = t.analysis.errors.filter((e) => !e.disputed).length;
      if (errors === 0) continue;
      if (!best || errors > best.errors) {
        const teacher = [...session.turns.slice(0, i)].reverse().find((x) => x.role === 'ai');
        best = { teacher, learner: t, errors };
      }
    }
    return best;
  })();

  if (!moment || !hasOpenRouterKey()) return null;

  async function evaluate(text: string) {
    if (!text.trim() || !moment) return;
    setBusy(true);
    setError('');
    try {
      const profile = await getProfile();
      const res = await chatJson<{ improved: boolean; feedbackRo: string; bestVersionEn: string }>(
        [
          { role: 'system', content: buildRedoSceneEvalPrompt(profile) },
          {
            role: 'user',
            content: `Teacher said: "${moment.teacher?.text ?? '(conversation opening)'}"\nOriginal learner answer: "${moment.learner.text}"\nNew attempt: "${text.trim()}"`,
          },
        ],
        {
          tier: 'utility',
          feature: 'redo_scene',
          maxTokens: 700,
          validate: (v: any) => typeof v?.improved === 'boolean' && typeof v?.feedbackRo === 'string' && typeof v?.bestVersionEn === 'string',
        }
      );
      setResult(res);
      if (res.improved) await addXp(10);
      await bumpActivity('sentencesRepeated', 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setAnswer(text);
        await evaluate(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  async function explainLesson() {
    if (!result) return;
    setLessonBusy(true);
    setError('');
    try {
      const profile = await getProfile();
      const l = await chatJson<Microlesson>(
        [{ role: 'user', content: buildSentenceLessonPrompt(profile, result.bestVersionEn) }],
        { feature: 'sentence_lesson', maxTokens: 1600, validate: isMicrolessonShape }
      );
      setLesson(l);
      setLessonSaved(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setLessonBusy(false);
  }

  async function saveLesson() {
    if (!lesson || !result) return;
    await saveSavedLesson({ ...lesson, id: newId(), createdAt: new Date().toISOString(), sourceEn: result.bestVersionEn }).catch((e) =>
      setError(String(e?.message ?? e))
    );
    setLessonSaved(true);
  }

  return (
    <>
      <h2><Icon name="repeat" size={16} />Reia scena</h2>
      <div className="card">
        <p className="tiny">Refă momentul în care ai avut cele mai multe greșeli — de data asta mai natural.</p>
        {moment.teacher && (
          <div className="mirror-row" style={{ marginBottom: 6 }}>
            <span className="lbl">Profesorul a spus</span>{moment.teacher.text}
            <button className="btn-ghost" style={{ padding: '2px 8px' }} onClick={() => speak(moment.teacher!.text, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button>
          </div>
        )}
        <div className="mirror-row mirror-said"><span className="lbl">Tu ai răspuns</span>{moment.learner.text}</div>
        {error && <div className="error-banner">{error}</div>}
        {!result ? (
          <>
            <p className="tiny" style={{ fontWeight: 700 }}>Răspunde din nou, mai bine:</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Noua ta variantă…" onKeyDown={(e) => e.key === 'Enter' && evaluate(answer)} />
              <button className={recording ? 'btn-danger' : ''} onClick={mic} disabled={busy} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
            </div>
            <div className="btn-row">
              <button className="btn-primary" onClick={() => evaluate(answer)} disabled={!answer.trim() || busy}>
                {busy ? 'Se evaluează…' : 'Evaluează'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: result.improved ? 'var(--success)' : 'var(--warn)', fontWeight: 700 }}>
              {result.improved ? '✓ Mai bine decât prima dată! +10 XP' : 'Încă nu e mai bine — vezi feedbackul.'}
            </p>
            <p className="muted">{result.feedbackRo}</p>
            <p className="tiny">
              Varianta cea mai naturală: <strong>{result.bestVersionEn}</strong>
              <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(result.bestVersionEn, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button>
            </p>
            <div className="btn-row">
              <button onClick={() => { setResult(null); setAnswer(''); setLesson(null); setLessonSaved(false); }}>Mai încearcă o dată</button>
              {!lesson && hasOpenRouterKey() && (
                <button className="btn-ghost" onClick={explainLesson} disabled={lessonBusy}>
                  <Icon name={lessonBusy ? 'loader' : 'lightbulb'} className={lessonBusy ? 'icon-spin' : undefined} />
                  {lessonBusy ? 'Se pregătește…' : 'Explică-mi timpurile folosite'}
                </button>
              )}
            </div>
          </>
        )}
        {lesson && (
          <MicrolessonCard
            lesson={lesson}
            badge="Lecția ta"
            footer={
              <button onClick={saveLesson} disabled={lessonSaved}>
                <Icon name={lessonSaved ? 'check' : 'star'} />
                {lessonSaved ? 'Salvată în Gramatică' : 'Salvează în Gramatică'}
              </button>
            }
          />
        )}
      </div>
    </>
  );
}
