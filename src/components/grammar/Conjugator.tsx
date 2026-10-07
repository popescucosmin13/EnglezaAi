// Conjugatorul: scrii un verb (în engleză sau în română) și primești toate formele lui,
// la toate timpurile, afirmativ / negativ / interogativ. Merge pentru orice verb: cele neregulate
// vin din dicționar, restul se calculează din regulile de ortografie.

import { useState } from 'react';
import { Icon } from '../Icon';
import { SpeakButton } from './SpeakButton';
import ExerciseRunner, { type RunnerItem } from './ExerciseRunner';
import {
  IRREGULAR_VERBS,
  TENSES,
  PERSONS,
  verbForms,
  nonFiniteForms,
  searchVerbs,
  irregularExercises,
  type ConjugationMode,
} from '../../grammar/verbs';

const MODES: { id: ConjugationMode; labelRo: string }[] = [
  { id: 'affirmative', labelRo: 'Afirmativ' },
  { id: 'negative', labelRo: 'Negativ' },
  { id: 'question', labelRo: 'Întrebare' },
];

const QUICK_VERBS = ['be', 'have', 'do', 'go', 'work', 'make', 'take', 'get', 'say', 'know'];

const IRREGULAR_PRACTICE_SIZE = 10;

export default function Conjugator() {
  const [query, setQuery] = useState('');
  const [verb, setVerb] = useState('be');
  const [mode, setMode] = useState<ConjugationMode>('affirmative');
  const [verbFilter, setVerbFilter] = useState('');
  const [practice, setPractice] = useState<RunnerItem[] | null>(null);

  if (practice) {
    return (
      <ExerciseRunner
        title="Verbe neregulate"
        items={practice}
        onExit={() => setPractice(null)}
      />
    );
  }

  const forms = verbForms(verb);
  const suggestions = searchVerbs(query, 6);

  function pick(v: string) {
    setVerb(v);
    setQuery('');
  }

  function startPractice() {
    setPractice(
      irregularExercises(IRREGULAR_PRACTICE_SIZE).map((exercise, index) => ({
        lessonId: 'irregular-verbs',
        lessonTitleRo: 'Verbe neregulate',
        index,
        exercise,
      }))
    );
  }

  const filtered = verbFilter.trim()
    ? IRREGULAR_VERBS.filter((v) => {
        const q = verbFilter.trim().toLowerCase();
        return v.base.includes(q) || v.past.includes(q) || v.participle.includes(q) || v.ro.includes(q);
      })
    : IRREGULAR_VERBS;

  return (
    <>
      <p className="tiny">
        Scrie orice verb englezesc (sau caută-l în română) și vezi toate formele lui. Verbele
        neregulate vin din dicționarul de mai jos; pentru celelalte formele se calculează din reguli.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const first = suggestions[0];
          pick(first && !/^[a-z]+$/i.test(query.trim()) ? first.base : query.trim().toLowerCase());
        }}
        placeholder="Caută un verb: write, a merge, buy…"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Caută un verb"
      />

      {query.trim() && (
        <div className="chip-row">
          {suggestions.map((v) => (
            <button key={v.base} className="chip" onClick={() => pick(v.base)}>
              {v.base} <span className="tiny">— {v.ro}</span>
            </button>
          ))}
          {/^[a-z]+$/i.test(query.trim()) && !suggestions.some((v) => v.base === query.trim().toLowerCase()) && (
            <button className="chip selected" onClick={() => pick(query.trim().toLowerCase())}>
              Conjugă „{query.trim().toLowerCase()}"
            </button>
          )}
        </div>
      )}

      {!query.trim() && (
        <div className="chip-row">
          {QUICK_VERBS.map((v) => (
            <button key={v} className={`chip ${v === forms.base ? 'selected' : ''}`} onClick={() => pick(v)}>{v}</button>
          ))}
        </div>
      )}

      <h2 style={{ marginBottom: 4 }}>
        to {forms.base}
        <SpeakButton text={`to ${forms.base}`} />
      </h2>
      <p className="tiny" style={{ marginTop: 0 }}>
        {forms.ro ? `${forms.ro} · ` : ''}
        <span className="badge soft">{forms.irregular ? 'neregulat' : 'regulat'}</span>
      </p>

      <div className="card">
        <div className="kv-rows">
          {nonFiniteForms(forms).map((f) => (
            <div key={f.labelRo} className="kv-row">
              <span className="k">{f.labelRo}</span>
              <span className="v">{f.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="tabs">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => setMode(m.id)}>{m.labelRo}</button>
        ))}
      </div>

      {TENSES.map((t) => {
        const sample = t.build(forms, 2, mode);
        return (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong>{t.nameEn}</strong>
              <SpeakButton text={sample} />
            </div>
            <p className="tiny" style={{ margin: '2px 0 8px' }}>{t.nameRo} · {t.useRo}</p>
            <div className="kv-rows">
              {PERSONS.map((p, i) => (
                <div key={p} className="kv-row">
                  <span className="k">{p}</span>
                  <span className="v" style={{ fontWeight: 600 }}>{t.build(forms, i, mode)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <h2><Icon name="repeat" size={16} />Verbe neregulate ({IRREGULAR_VERBS.length})</h2>
      <div className="btn-row">
        <button className="btn-primary" onClick={startPractice}>
          <Icon name="puzzle" size={15} />Exersează {IRREGULAR_PRACTICE_SIZE} verbe la întâmplare
        </button>
      </div>
      <input
        value={verbFilter}
        onChange={(e) => setVerbFilter(e.target.value)}
        placeholder="Filtrează lista (write, a scrie, wrote…)"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Filtrează verbele neregulate"
      />
      <div className="table-wrap">
        <table className="ref-table">
          <thead>
            <tr><th>Infinitiv</th><th>Trecut</th><th>Participiu</th><th>Română</th></tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.base} onClick={() => pick(v.base)} style={{ cursor: 'pointer' }}>
                <td><strong>{v.base}</strong></td>
                <td>{v.altPast ? `${v.past} / ${v.altPast}` : v.past}</td>
                <td>{v.altParticiple ? `${v.participle} / ${v.altParticiple}` : v.participle}</td>
                <td className="tiny">{v.ro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="muted">Niciun verb pentru „{verbFilter}".</p>}
    </>
  );
}
