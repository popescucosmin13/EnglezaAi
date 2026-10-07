import { describe, it, expect } from 'vitest';
import { REFERENCE, allTables, tableMatches } from './reference';

describe('tabelele de referință', () => {
  it('au id-uri unice', () => {
    const sectionIds = REFERENCE.map((s) => s.id);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);

    const tableIds = allTables().map(({ table }) => table.id);
    expect(new Set(tableIds).size).toBe(tableIds.length);
  });

  it('au toate rândurile de aceeași lățime cu antetul', () => {
    for (const { section, table } of allTables()) {
      expect(table.columns.length, `${section.id}/${table.id}`).toBeGreaterThan(1);
      expect(table.rows.length, `${section.id}/${table.id} fără rânduri`).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(row.length, `${section.id}/${table.id}: rândul „${row[0]}"`).toBe(table.columns.length);
      }
    }
  });

  it('caută în tot conținutul, nu doar în titlu', () => {
    const { table } = allTables().find((t) => t.table.id === 'modals')!;
    expect(tableMatches(table, 'mustn')).toBe(true); // dintr-o celulă
    expect(tableMatches(table, 'modale')).toBe(true); // din titlu
    expect(tableMatches(table, 'xyz')).toBe(false);
    expect(tableMatches(table, '')).toBe(true);
  });

  it('acoperă întrebările frecvente', () => {
    const hit = (q: string) => allTables().some(({ table }) => tableMatches(table, q));
    for (const q of ['much', 'since', 'whose', 'people', 'quarter past', 'despite', 'themselves', 'stopped']) {
      expect(hit(q), `nimic pentru „${q}"`).toBe(true);
    }
  });
});
