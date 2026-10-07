// Motorul de exerciții al cursului de gramatică: aceleași reguli de verificare și același feedback,
// indiferent dacă exercițiile vin dintr-o lecție, din antrenamentul mixt sau din verbele neregulate.

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { TappableText } from '../TappableText';
import { SpeakButton } from './SpeakButton';
import { checkAnswer, filledText, orderWords, type GrammarExercise } from '../../grammar';

export interface RunnerItem {
  /** Din ce lecție vine exercițiul (pentru etichetă și pentru memoria de repetiție). */
  lessonId: string;
  lessonTitleRo: string;
  index: number;
  exercise: GrammarExercise;
}

const KIND_LABELS: Record<GrammarExercise['kind'], string> = {
  choice: 'Alege varianta corectă',
  fill: 'Completează spațiul liber',
  fix: 'Rescrie corect propoziția',
  translate: 'Tradu în engleză',
  order: 'Atinge cuvintele în ordinea corectă',
};

export default function ExerciseRunner({
  title,
  items,
  showSource,
  onAnswered,
  onExit,
  onFinish,
  onNext,
  nextLabel,
}: {
  title: string;
  items: RunnerItem[];
  /** În antrenamentul mixt arătăm din ce lecție vine exercițiul. */
  showSource?: boolean;
  /** Lipsește când exercițiile sunt generate (verbe neregulate) și nu intră în repetiție. */
  onAnswered?: (item: RunnerItem, ok: boolean) => void;
  onExit: () => void;
  onFinish?: (correct: number, total: number, isRetry: boolean) => void | Promise<void>;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const [queue, setQueue] = useState<RunnerItem[]>(items);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [built, setBuilt] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState<RunnerItem[]>([]);
  const [finished, setFinished] = useState(false);
  /** Reluarea greșelilor nu e o parcurgere completă — nu se salvează ca scor și nu dă XP. */
  const [isRetry, setIsRetry] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const item = queue[idx];
  const ex = item?.exercise;
  const words = ex?.kind === 'order' ? orderWords(ex) : [];

  useEffect(() => {
    if (ex && ex.kind !== 'choice' && ex.kind !== 'order') inputRef.current?.focus();
  }, [idx, ex]);

  function answer(value: string) {
    if (verdict !== null || !item) return;
    const ok = checkAnswer(item.exercise, value);
    setInput(value);
    setVerdict(ok);
    if (ok) setCorrect((n) => n + 1);
    else setWrong((w) => [...w, item]);
    onAnswered?.(item, ok);
  }

  function reset(next: RunnerItem[], retry: boolean) {
    setQueue(next);
    setIsRetry(retry);
    setWrong([]);
    setIdx(0);
    setCorrect(0);
    setInput('');
    setBuilt([]);
    setVerdict(null);
    setFinished(false);
  }

  async function advance() {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setInput('');
      setBuilt([]);
      setVerdict(null);
      return;
    }
    setFinished(true);
    await onFinish?.(correct, queue.length, isRetry);
  }

  if (finished) {
    const total = queue.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <div className="card">
          <p style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, color: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
            {correct}/{total} <span style={{ fontSize: '1rem', fontWeight: 600 }}>({pct}%)</span>
          </p>
          <p className="tiny">
            {pct === 100
              ? 'Perfect. Regulile astea sunt ale tale — folosește-le azi în conversație.'
              : pct >= 80
                ? 'Foarte bine. Reia greșelile, apoi treci mai departe.'
                : 'Recitește explicația și reia exercițiile — se așază după a doua trecere.'}
          </p>
          <div className="btn-row">
            {wrong.length > 0 && (
              <button className="btn-primary" onClick={() => reset(wrong, true)}>
                <Icon name="rotate" size={15} />Reia cele {wrong.length} greșite
              </button>
            )}
            <button onClick={() => reset(items, false)}><Icon name="repeat" size={15} />De la capăt</button>
            <button className="btn-ghost" onClick={onExit}><Icon name="undo" size={15} />Înapoi</button>
          </div>
          {onNext && wrong.length === 0 && (
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button className="btn-ghost" onClick={onNext}>{nextLabel ?? 'Mai departe'} <Icon name="arrowUpRight" size={15} /></button>
            </div>
          )}
        </div>
      </>
    );
  }

  if (!item || !ex) {
    return (
      <>
        <div className="card"><p className="muted">Nu există exerciții de antrenat acum.</p></div>
        <div className="btn-row"><button onClick={onExit}>Înapoi</button></div>
      </>
    );
  }

  const builtSentence = built.map((i) => words[i]).join(' ');

  return (
    <>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn-ghost" onClick={onExit}><Icon name="undo" size={15} />Înapoi</button>
      </div>

      <p className="tiny" style={{ fontWeight: 700 }}>
        {title} · exercițiul {idx + 1}/{queue.length}{isRetry ? ' (reluare)' : ''}
      </p>
      <div className="bar" style={{ marginBottom: 12 }}>
        <div style={{ width: `${Math.round((idx / queue.length) * 100)}%` }} />
      </div>

      <div className="card">
        <p className="tiny" style={{ marginTop: 0 }}>
          {KIND_LABELS[ex.kind]}{showSource && ` · ${item.lessonTitleRo}`}
        </p>
        <p style={{ fontSize: '1.08rem', fontWeight: 600, margin: '4px 0 12px' }}>
          {ex.kind === 'translate' || ex.kind === 'order' ? ex.text : <TappableText text={ex.text} />}
        </p>

        {ex.kind === 'choice' && (
          <div className="chip-row">
            {(ex.options ?? []).map((o) => {
              const chosen = verdict !== null && o === input;
              const isAnswer = verdict !== null && o === ex.answer;
              return (
                <button
                  key={o}
                  className="chip"
                  disabled={verdict !== null}
                  style={
                    isAnswer
                      ? { borderColor: 'var(--success)', background: 'var(--success-soft)', color: 'var(--success)' }
                      : chosen
                        ? { borderColor: 'var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)' }
                        : undefined
                  }
                  onClick={() => answer(o)}
                >
                  {o}
                </button>
              );
            })}
          </div>
        )}

        {ex.kind === 'order' && (
          <>
            <div
              style={{
                minHeight: 44,
                padding: '10px 12px',
                borderRadius: 13,
                background: 'var(--bg-soft)',
                fontWeight: 600,
                fontSize: '1.02rem',
              }}
            >
              {builtSentence || <span className="tiny">Atinge cuvintele de mai jos, în ordine…</span>}
            </div>
            <div className="chip-row">
              {words.map((w, i) => (
                <button
                  key={`${w}-${i}`}
                  className="chip"
                  disabled={verdict !== null || built.includes(i)}
                  style={built.includes(i) ? { opacity: 0.35 } : undefined}
                  onClick={() => setBuilt((b) => [...b, i])}
                >
                  {w}
                </button>
              ))}
            </div>
            {verdict === null && (
              <div className="btn-row">
                <button className="btn-primary" onClick={() => answer(builtSentence)} disabled={built.length === 0}>Verifică</button>
                <button onClick={() => setBuilt((b) => b.slice(0, -1))} disabled={built.length === 0}>
                  <Icon name="undo" size={15} />Șterge ultimul
                </button>
                <button className="btn-ghost" onClick={() => answer('')}>Nu știu</button>
              </div>
            )}
          </>
        )}

        {(ex.kind === 'fill' || ex.kind === 'fix' || ex.kind === 'translate') && (
          <>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && verdict === null) answer(input); }}
              disabled={verdict !== null}
              placeholder={ex.kind === 'fill' ? 'Cuvântul lipsă…' : 'Scrie propoziția corectă…'}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Răspunsul tău"
            />
            {verdict === null && (
              <div className="btn-row">
                <button className="btn-primary" onClick={() => answer(input)} disabled={!input.trim()}>Verifică</button>
                <button className="btn-ghost" onClick={() => answer('')}>Nu știu</button>
              </div>
            )}
          </>
        )}

        {verdict !== null && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 700, color: verdict ? 'var(--success)' : 'var(--danger)', margin: '0 0 6px' }}>
              <Icon name={verdict ? 'checkCircle' : 'xCircle'} size={16} /> {verdict ? 'Corect!' : 'Nu chiar.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {!verdict && <span className="tiny">Corect:</span>}
              <TappableText text={filledText(ex)} style={{ fontWeight: 700, color: 'var(--success)' }} />
              <SpeakButton text={filledText(ex)} />
            </div>
            <p className="tiny" style={{ marginTop: 6 }}>{ex.explainRo}</p>
            {showSource && <p className="tiny" style={{ opacity: 0.8 }}>Din lecția „{item.lessonTitleRo}"</p>}
            <div className="btn-row">
              <button className="btn-primary" onClick={advance}>
                {idx + 1 < queue.length ? 'Următorul →' : 'Vezi rezultatul'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
