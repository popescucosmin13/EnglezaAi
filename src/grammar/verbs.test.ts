import { describe, it, expect } from 'vitest';
import {
  IRREGULAR_VERBS,
  TENSES,
  thirdPerson,
  ingForm,
  regularPast,
  verbForms,
  searchVerbs,
} from './verbs';

const tense = (id: string) => TENSES.find((t) => t.id === id)!;

describe('reguli de ortografie', () => {
  it('formează persoana a III-a', () => {
    expect(thirdPerson('work')).toBe('works');
    expect(thirdPerson('watch')).toBe('watches');
    expect(thirdPerson('go')).toBe('goes');
    expect(thirdPerson('study')).toBe('studies');
    expect(thirdPerson('play')).toBe('plays');
    expect(thirdPerson('have')).toBe('has');
    expect(thirdPerson('be')).toBe('is');
  });

  it('formează gerunziul', () => {
    expect(ingForm('work')).toBe('working');
    expect(ingForm('make')).toBe('making');
    expect(ingForm('sit')).toBe('sitting');
    expect(ingForm('run')).toBe('running');
    expect(ingForm('begin')).toBe('beginning');
    expect(ingForm('lie')).toBe('lying');
    expect(ingForm('see')).toBe('seeing');
    expect(ingForm('be')).toBe('being'); // „e" e vocala cuvântului, nu un „e" mut
    expect(ingForm('do')).toBe('doing');
    expect(ingForm('go')).toBe('going');
    expect(ingForm('visit')).toBe('visiting'); // accentul pe prima silabă: fără dublare
    expect(ingForm('play')).toBe('playing');
  });

  it('formează trecutul regulat', () => {
    expect(regularPast('work')).toBe('worked');
    expect(regularPast('like')).toBe('liked');
    expect(regularPast('study')).toBe('studied');
    expect(regularPast('stop')).toBe('stopped');
    expect(regularPast('play')).toBe('played');
    expect(regularPast('prefer')).toBe('preferred');
    expect(regularPast('open')).toBe('opened');
  });
});

describe('verbForms', () => {
  it('ia formele din dicționar pentru verbele neregulate', () => {
    const go = verbForms('go');
    expect(go).toMatchObject({ base: 'go', thirdPerson: 'goes', ing: 'going', past: 'went', participle: 'gone', irregular: true });
    expect(go.ro).toBe('a merge');
  });

  it('le calculează pentru verbele regulate', () => {
    expect(verbForms('watch')).toMatchObject({ thirdPerson: 'watches', ing: 'watching', past: 'watched', participle: 'watched', irregular: false });
  });

  it('acceptă „to work" și majuscule', () => {
    expect(verbForms('  To Work ').base).toBe('work');
  });
});

describe('conjugare', () => {
  const work = verbForms('work');
  const be = verbForms('be');

  it('prezentul simplu: -s doar la persoana a III-a', () => {
    expect(tense('present-simple').build(work, 0, 'affirmative')).toBe('I work.');
    expect(tense('present-simple').build(work, 2, 'affirmative')).toBe('He / she / it works.');
  });

  it('prezentul simplu: negativul și întrebarea folosesc do/does, cu verbul la bază', () => {
    expect(tense('present-simple').build(work, 2, 'negative')).toBe('He / she / it does not work.');
    expect(tense('present-simple').build(work, 2, 'question')).toBe('Does he / she / it work?');
  });

  it('to be se conjugă singur, fără do', () => {
    expect(tense('present-simple').build(be, 0, 'affirmative')).toBe('I am.');
    expect(tense('present-simple').build(be, 0, 'negative')).toBe('I am not.');
    expect(tense('present-simple').build(be, 2, 'question')).toBe('Is he / she / it?');
    expect(tense('past-simple').build(be, 3, 'affirmative')).toBe('We were.');
  });

  it('trecutul simplu: forma neregulată la afirmativ, forma de bază după did', () => {
    const go = verbForms('go');
    expect(tense('past-simple').build(go, 0, 'affirmative')).toBe('I went.');
    expect(tense('past-simple').build(go, 0, 'negative')).toBe('I did not go.');
    expect(tense('past-simple').build(go, 0, 'question')).toBe('Did I go?');
  });

  it('perfectul folosește participiul, cu have/has după persoană', () => {
    const write = verbForms('write');
    expect(tense('present-perfect').build(write, 2, 'affirmative')).toBe('He / she / it has written.');
    expect(tense('present-perfect').build(write, 0, 'question')).toBe('Have I written?');
    expect(tense('past-perfect').build(write, 2, 'affirmative')).toBe('He / she / it had written.');
  });

  it('viitorul și condiționalul păstrează verbul la forma de bază', () => {
    expect(tense('future-will').build(work, 2, 'affirmative')).toBe('He / she / it will work.');
    expect(tense('future-going-to').build(work, 0, 'affirmative')).toBe('I am going to work.');
    expect(tense('conditional').build(work, 2, 'negative')).toBe('He / she / it would not work.');
    expect(tense('conditional-perfect').build(work, 0, 'affirmative')).toBe('I would have worked.');
  });

  it('generează toate formele fără să rămână spații duble sau text gol', () => {
    for (const verb of ['be', 'have', 'go', 'work', 'study']) {
      const f = verbForms(verb);
      for (const t of TENSES) {
        for (let p = 0; p < 6; p++) {
          for (const mode of ['affirmative', 'negative', 'question'] as const) {
            const s = t.build(f, p, mode);
            expect(s.length, `${verb}/${t.id}`).toBeGreaterThan(3);
            expect(s).not.toMatch(/\s{2}/);
            expect(s[0]).toBe(s[0].toUpperCase());
          }
        }
      }
    }
  });
});

describe('dicționarul de verbe neregulate', () => {
  it('nu are duplicate și are traducere peste tot', () => {
    const bases = IRREGULAR_VERBS.map((v) => v.base);
    expect(new Set(bases).size).toBe(bases.length);
    for (const v of IRREGULAR_VERBS) {
      expect(v.ro.trim(), v.base).not.toBe('');
      expect(v.past.trim(), v.base).not.toBe('');
      expect(v.participle.trim(), v.base).not.toBe('');
    }
  });

  it('caută după cuvânt englezesc și după traducere', () => {
    expect(searchVerbs('brin')[0].base).toBe('bring');
    expect(searchVerbs('a cumpăra')[0].base).toBe('buy');
    expect(searchVerbs('')).toEqual([]);
  });
});
