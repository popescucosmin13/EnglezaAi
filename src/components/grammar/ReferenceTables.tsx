// Tabelele de referință: partea „caut repede", cu filtru peste tot conținutul.

import { useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { REFERENCE, tableMatches, type RefTable } from '../../grammar/reference';

const SECTION_ICONS: Record<string, IconName> = {
  tenses: 'clock',
  pronouns: 'user',
  'be-have-do': 'zap',
  'articles-nouns': 'book',
  prepositions: 'mapPin',
  quantity: 'barChart',
  'questions-modals': 'help',
  'verb-patterns': 'repeat',
  spelling: 'type',
  daily: 'calendar',
  connectors: 'languages',
};

function Table({ table }: { table: RefTable }) {
  return (
    <div className="card">
      <strong>{table.titleRo}</strong>
      {table.noteRo && <p className="tiny" style={{ margin: '4px 0 0' }}>{table.noteRo}</p>}
      <div className="table-wrap">
        <table className="ref-table">
          <thead>
            <tr>{table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReferenceTables() {
  const [query, setQuery] = useState('');
  const q = query.trim();

  const sections = REFERENCE.map((s) => ({ section: s, tables: s.tables.filter((t) => tableMatches(t, q)) })).filter(
    (s) => s.tables.length > 0
  );

  return (
    <>
      <p className="tiny">
        Toate regulile în formă de tabel — pentru momentul „am nevoie acum de forma corectă".
        Filtrul caută în tot conținutul, nu doar în titluri.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Caută: much, since, mustn't, plural, ora…"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Caută în tabele"
      />

      {sections.length === 0 && (
        <div className="card"><p className="muted">Niciun tabel pentru „{query}".</p></div>
      )}

      {sections.map(({ section, tables }) => (
        <div key={section.id}>
          <h2><Icon name={SECTION_ICONS[section.id] ?? 'book'} size={16} />{section.titleRo}</h2>
          <p className="tiny" style={{ marginTop: -6 }}>{section.descRo}</p>
          {tables.map((t) => <Table key={t.id} table={t} />)}
        </div>
      ))}
    </>
  );
}
