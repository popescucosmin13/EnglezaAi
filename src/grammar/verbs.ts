// Conjugatorul: formele oricărui verb englezesc, la toate timpurile, calculate local.
//
// Două părți: dicționarul de verbe neregulate (formele nu se pot deduce) și regulile de ortografie
// pentru verbele regulate (-s, -ing, -ed). Peste ele stau șabloanele de timpuri, care combină
// auxiliarul potrivit persoanei cu forma potrivită a verbului.

import type { GrammarExercise } from './types';

export interface IrregularVerb {
  base: string;
  past: string;
  participle: string;
  /** Traducerea, ca lista să fie utilă și ca dicționar. */
  ro: string;
  /** Formă alternativă acceptată (ex. learnt / learned). */
  altPast?: string;
  altParticiple?: string;
}

export const IRREGULAR_VERBS: IrregularVerb[] = [
  { base: 'be', past: 'was / were', participle: 'been', ro: 'a fi' },
  { base: 'beat', past: 'beat', participle: 'beaten', ro: 'a bate' },
  { base: 'become', past: 'became', participle: 'become', ro: 'a deveni' },
  { base: 'begin', past: 'began', participle: 'begun', ro: 'a începe' },
  { base: 'bend', past: 'bent', participle: 'bent', ro: 'a îndoi' },
  { base: 'bet', past: 'bet', participle: 'bet', ro: 'a paria' },
  { base: 'bite', past: 'bit', participle: 'bitten', ro: 'a mușca' },
  { base: 'blow', past: 'blew', participle: 'blown', ro: 'a sufla' },
  { base: 'break', past: 'broke', participle: 'broken', ro: 'a sparge, a rupe' },
  { base: 'bring', past: 'brought', participle: 'brought', ro: 'a aduce' },
  { base: 'build', past: 'built', participle: 'built', ro: 'a construi' },
  { base: 'burn', past: 'burnt', participle: 'burnt', ro: 'a arde', altPast: 'burned', altParticiple: 'burned' },
  { base: 'buy', past: 'bought', participle: 'bought', ro: 'a cumpăra' },
  { base: 'catch', past: 'caught', participle: 'caught', ro: 'a prinde' },
  { base: 'choose', past: 'chose', participle: 'chosen', ro: 'a alege' },
  { base: 'come', past: 'came', participle: 'come', ro: 'a veni' },
  { base: 'cost', past: 'cost', participle: 'cost', ro: 'a costa' },
  { base: 'cut', past: 'cut', participle: 'cut', ro: 'a tăia' },
  { base: 'deal', past: 'dealt', participle: 'dealt', ro: 'a se ocupa de' },
  { base: 'do', past: 'did', participle: 'done', ro: 'a face' },
  { base: 'draw', past: 'drew', participle: 'drawn', ro: 'a desena, a trage' },
  { base: 'dream', past: 'dreamt', participle: 'dreamt', ro: 'a visa', altPast: 'dreamed', altParticiple: 'dreamed' },
  { base: 'drink', past: 'drank', participle: 'drunk', ro: 'a bea' },
  { base: 'drive', past: 'drove', participle: 'driven', ro: 'a conduce (mașina)' },
  { base: 'eat', past: 'ate', participle: 'eaten', ro: 'a mânca' },
  { base: 'fall', past: 'fell', participle: 'fallen', ro: 'a cădea' },
  { base: 'feed', past: 'fed', participle: 'fed', ro: 'a hrăni' },
  { base: 'feel', past: 'felt', participle: 'felt', ro: 'a simți' },
  { base: 'fight', past: 'fought', participle: 'fought', ro: 'a lupta' },
  { base: 'find', past: 'found', participle: 'found', ro: 'a găsi' },
  { base: 'fly', past: 'flew', participle: 'flown', ro: 'a zbura' },
  { base: 'forget', past: 'forgot', participle: 'forgotten', ro: 'a uita' },
  { base: 'forgive', past: 'forgave', participle: 'forgiven', ro: 'a ierta' },
  { base: 'freeze', past: 'froze', participle: 'frozen', ro: 'a îngheța' },
  { base: 'get', past: 'got', participle: 'got', ro: 'a primi, a obține', altParticiple: 'gotten' },
  { base: 'give', past: 'gave', participle: 'given', ro: 'a da' },
  { base: 'go', past: 'went', participle: 'gone', ro: 'a merge' },
  { base: 'grow', past: 'grew', participle: 'grown', ro: 'a crește' },
  { base: 'hang', past: 'hung', participle: 'hung', ro: 'a atârna' },
  { base: 'have', past: 'had', participle: 'had', ro: 'a avea' },
  { base: 'hear', past: 'heard', participle: 'heard', ro: 'a auzi' },
  { base: 'hide', past: 'hid', participle: 'hidden', ro: 'a ascunde' },
  { base: 'hit', past: 'hit', participle: 'hit', ro: 'a lovi' },
  { base: 'hold', past: 'held', participle: 'held', ro: 'a ține' },
  { base: 'hurt', past: 'hurt', participle: 'hurt', ro: 'a răni, a durea' },
  { base: 'keep', past: 'kept', participle: 'kept', ro: 'a păstra' },
  { base: 'know', past: 'knew', participle: 'known', ro: 'a ști, a cunoaște' },
  { base: 'lay', past: 'laid', participle: 'laid', ro: 'a așeza' },
  { base: 'lead', past: 'led', participle: 'led', ro: 'a conduce (un grup)' },
  { base: 'learn', past: 'learnt', participle: 'learnt', ro: 'a învăța', altPast: 'learned', altParticiple: 'learned' },
  { base: 'leave', past: 'left', participle: 'left', ro: 'a pleca, a lăsa' },
  { base: 'lend', past: 'lent', participle: 'lent', ro: 'a împrumuta (cuiva)' },
  { base: 'let', past: 'let', participle: 'let', ro: 'a lăsa, a permite' },
  { base: 'lie', past: 'lay', participle: 'lain', ro: 'a sta întins' },
  { base: 'light', past: 'lit', participle: 'lit', ro: 'a aprinde' },
  { base: 'lose', past: 'lost', participle: 'lost', ro: 'a pierde' },
  { base: 'make', past: 'made', participle: 'made', ro: 'a face, a produce' },
  { base: 'mean', past: 'meant', participle: 'meant', ro: 'a însemna' },
  { base: 'meet', past: 'met', participle: 'met', ro: 'a întâlni' },
  { base: 'pay', past: 'paid', participle: 'paid', ro: 'a plăti' },
  { base: 'put', past: 'put', participle: 'put', ro: 'a pune' },
  { base: 'quit', past: 'quit', participle: 'quit', ro: 'a renunța, a demisiona' },
  { base: 'read', past: 'read', participle: 'read', ro: 'a citi (trecutul se pronunță „red")' },
  { base: 'ride', past: 'rode', participle: 'ridden', ro: 'a merge cu (bicicleta, calul)' },
  { base: 'ring', past: 'rang', participle: 'rung', ro: 'a suna' },
  { base: 'rise', past: 'rose', participle: 'risen', ro: 'a se ridica, a crește' },
  { base: 'run', past: 'ran', participle: 'run', ro: 'a alerga, a conduce (o firmă)' },
  { base: 'say', past: 'said', participle: 'said', ro: 'a spune (ceva)' },
  { base: 'see', past: 'saw', participle: 'seen', ro: 'a vedea' },
  { base: 'seek', past: 'sought', participle: 'sought', ro: 'a căuta' },
  { base: 'sell', past: 'sold', participle: 'sold', ro: 'a vinde' },
  { base: 'send', past: 'sent', participle: 'sent', ro: 'a trimite' },
  { base: 'set', past: 'set', participle: 'set', ro: 'a stabili, a seta' },
  { base: 'shake', past: 'shook', participle: 'shaken', ro: 'a scutura' },
  { base: 'shine', past: 'shone', participle: 'shone', ro: 'a străluci' },
  { base: 'shoot', past: 'shot', participle: 'shot', ro: 'a împușca, a trage' },
  { base: 'show', past: 'showed', participle: 'shown', ro: 'a arăta' },
  { base: 'shut', past: 'shut', participle: 'shut', ro: 'a închide' },
  { base: 'sing', past: 'sang', participle: 'sung', ro: 'a cânta' },
  { base: 'sink', past: 'sank', participle: 'sunk', ro: 'a se scufunda' },
  { base: 'sit', past: 'sat', participle: 'sat', ro: 'a sta jos' },
  { base: 'sleep', past: 'slept', participle: 'slept', ro: 'a dormi' },
  { base: 'slide', past: 'slid', participle: 'slid', ro: 'a aluneca' },
  { base: 'speak', past: 'spoke', participle: 'spoken', ro: 'a vorbi' },
  { base: 'spend', past: 'spent', participle: 'spent', ro: 'a cheltui, a petrece' },
  { base: 'spread', past: 'spread', participle: 'spread', ro: 'a răspândi, a întinde' },
  { base: 'stand', past: 'stood', participle: 'stood', ro: 'a sta în picioare' },
  { base: 'steal', past: 'stole', participle: 'stolen', ro: 'a fura' },
  { base: 'stick', past: 'stuck', participle: 'stuck', ro: 'a lipi, a se bloca' },
  { base: 'strike', past: 'struck', participle: 'struck', ro: 'a lovi, a intra în grevă' },
  { base: 'swear', past: 'swore', participle: 'sworn', ro: 'a jura, a înjura' },
  { base: 'sweep', past: 'swept', participle: 'swept', ro: 'a mătura' },
  { base: 'swim', past: 'swam', participle: 'swum', ro: 'a înota' },
  { base: 'take', past: 'took', participle: 'taken', ro: 'a lua' },
  { base: 'teach', past: 'taught', participle: 'taught', ro: 'a preda, a învăța pe cineva' },
  { base: 'tear', past: 'tore', participle: 'torn', ro: 'a rupe (hârtie, stofă)' },
  { base: 'tell', past: 'told', participle: 'told', ro: 'a spune (cuiva)' },
  { base: 'think', past: 'thought', participle: 'thought', ro: 'a gândi, a crede' },
  { base: 'throw', past: 'threw', participle: 'thrown', ro: 'a arunca' },
  { base: 'understand', past: 'understood', participle: 'understood', ro: 'a înțelege' },
  { base: 'upset', past: 'upset', participle: 'upset', ro: 'a supăra' },
  { base: 'wake', past: 'woke', participle: 'woken', ro: 'a (se) trezi' },
  { base: 'wear', past: 'wore', participle: 'worn', ro: 'a purta (haine)' },
  { base: 'win', past: 'won', participle: 'won', ro: 'a câștiga' },
  { base: 'write', past: 'wrote', participle: 'written', ro: 'a scrie' },
];

const IRREGULAR_BY_BASE = new Map(IRREGULAR_VERBS.map((v) => [v.base, v]));

// ---------- Reguli de ortografie pentru verbele regulate ----------

const VOWELS = 'aeiou';
const isVowel = (c: string) => VOWELS.includes(c);

/**
 * Verbe de două silabe la care consoana finală se dublează (accentul cade pe silaba a doua).
 * Regula generală nu se poate deduce din scriere, așa că lista rămâne explicită.
 */
const DOUBLING = new Set([
  'begin', 'forget', 'prefer', 'refer', 'admit', 'permit', 'submit', 'commit', 'omit', 'occur',
  'control', 'regret', 'transfer', 'upset', 'forbid', 'equip', 'patrol', 'prohibit',
]);

/** Ultimele trei litere sunt consoană-vocală-consoană (fără w, x, y la final)? */
function endsCVC(word: string): boolean {
  if (word.length < 3) return false;
  const [a, b, c] = word.slice(-3);
  return !isVowel(a) && isVowel(b) && !isVowel(c) && !'wxy'.includes(c);
}

function syllableCount(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouy]+/g);
  if (!groups) return 1;
  let n = groups.length;
  if (/e$/.test(word) && n > 1) n -= 1; // „e" mut final
  return Math.max(1, n);
}

function shouldDouble(base: string): boolean {
  if (!endsCVC(base)) return false;
  return syllableCount(base) === 1 || DOUBLING.has(base);
}

/** Persoana a III-a singular: works, watches, studies, goes. */
export function thirdPerson(base: string): string {
  if (base === 'be') return 'is';
  if (base === 'have') return 'has';
  if (/(s|ss|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** Forma în -ing: working, making, sitting, lying. */
export function ingForm(base: string): string {
  // verbe de două litere: „e" e chiar vocala cuvântului, nu un „e" mut (be → being)
  if (base.length <= 2) return `${base}ing`;
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  if (base.endsWith('ee') || base.endsWith('oe') || base.endsWith('ye')) return `${base}ing`;
  if (base.endsWith('e')) return `${base.slice(0, -1)}ing`;
  if (shouldDouble(base)) return `${base}${base.slice(-1)}ing`;
  return `${base}ing`;
}

/** Trecutul regulat: worked, liked, studied, stopped. */
export function regularPast(base: string): string {
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (shouldDouble(base)) return `${base}${base.slice(-1)}ed`;
  return `${base}ed`;
}

export interface VerbForms {
  base: string;
  thirdPerson: string;
  ing: string;
  past: string;
  participle: string;
  irregular: boolean;
  ro?: string;
  altPast?: string;
  altParticiple?: string;
}

/** Toate formele de bază ale unui verb, indiferent dacă e regulat sau neregulat. */
export function verbForms(input: string): VerbForms {
  const base = input.trim().toLowerCase().replace(/^to\s+/, '');
  const irregular = IRREGULAR_BY_BASE.get(base);
  if (irregular) {
    return {
      base,
      thirdPerson: thirdPerson(base),
      ing: ingForm(base),
      past: irregular.past,
      participle: irregular.participle,
      irregular: true,
      ro: irregular.ro,
      altPast: irregular.altPast,
      altParticiple: irregular.altParticiple,
    };
  }
  return {
    base,
    thirdPerson: thirdPerson(base),
    ing: ingForm(base),
    past: regularPast(base),
    participle: regularPast(base),
    irregular: false,
  };
}

// ---------- Conjugarea pe timpuri ----------

export type ConjugationMode = 'affirmative' | 'negative' | 'question';

/** Cele șase persoane, în ordinea din tabele. */
export const PERSONS = ['I', 'you', 'he / she / it', 'we', 'you (voi)', 'they'] as const;

const SUBJECT = ['I', 'you', 'he / she / it', 'we', 'you', 'they'];
const BE_PRESENT = ['am', 'are', 'is', 'are', 'are', 'are'];
const BE_PAST = ['was', 'were', 'was', 'were', 'were', 'were'];
const HAVE = ['have', 'have', 'has', 'have', 'have', 'have'];
const DO = ['do', 'do', 'does', 'do', 'do', 'do'];

const isThird = (p: number) => p === 2;

function sentence(parts: string, mode: ConjugationMode): string {
  const text = parts.replace(/\s+/g, ' ').trim();
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return capitalized + (mode === 'question' ? '?' : '.');
}

export interface TenseDef {
  id: string;
  nameEn: string;
  nameRo: string;
  /** Când se folosește — o propoziție, ca tabelul să fie și lecție, nu doar listă. */
  useRo: string;
  /** Din ce se compune forma, în cuvinte: „have / has + participiu". */
  formulaRo?: string;
  /** Cu ce timp din română se potrivește — puntea care lipsește de obicei din manuale. */
  roEquivalentRo?: string;
  /** Exemplu fix, cu același verb la toate timpurile, ca să vezi diferența dintre ele. */
  exampleEn?: string;
  exampleRo?: string;
  build(f: VerbForms, person: number, mode: ConjugationMode): string;
}

export const TENSES: TenseDef[] = [
  {
    id: 'present-simple',
    nameEn: 'Present Simple',
    nameRo: 'Prezentul simplu',
    useRo: 'Rutine, obiceiuri, adevăruri generale.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (f.base === 'be') {
        if (mode === 'affirmative') return sentence(`${s} ${BE_PRESENT[p]}`, mode);
        if (mode === 'negative') return sentence(`${s} ${BE_PRESENT[p]} not`, mode);
        return sentence(`${BE_PRESENT[p]} ${s}`, mode);
      }
      const verb = isThird(p) ? f.thirdPerson : f.base;
      if (mode === 'affirmative') return sentence(`${s} ${verb}`, mode);
      if (mode === 'negative') return sentence(`${s} ${DO[p]} not ${f.base}`, mode);
      return sentence(`${DO[p]} ${s} ${f.base}`, mode);
    },
  },
  {
    id: 'present-continuous',
    nameEn: 'Present Continuous',
    nameRo: 'Prezentul continuu',
    useRo: 'Ce se întâmplă chiar acum sau temporar.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} ${BE_PRESENT[p]} ${f.ing}`, mode);
      if (mode === 'negative') return sentence(`${s} ${BE_PRESENT[p]} not ${f.ing}`, mode);
      return sentence(`${BE_PRESENT[p]} ${s} ${f.ing}`, mode);
    },
  },
  {
    id: 'past-simple',
    nameEn: 'Past Simple',
    nameRo: 'Trecutul simplu',
    useRo: 'Acțiune terminată, într-un moment încheiat.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (f.base === 'be') {
        if (mode === 'affirmative') return sentence(`${s} ${BE_PAST[p]}`, mode);
        if (mode === 'negative') return sentence(`${s} ${BE_PAST[p]} not`, mode);
        return sentence(`${BE_PAST[p]} ${s}`, mode);
      }
      if (mode === 'affirmative') return sentence(`${s} ${f.past}`, mode);
      if (mode === 'negative') return sentence(`${s} did not ${f.base}`, mode);
      return sentence(`did ${s} ${f.base}`, mode);
    },
  },
  {
    id: 'past-continuous',
    nameEn: 'Past Continuous',
    nameRo: 'Trecutul continuu',
    useRo: 'Fundalul unei întâmplări: ce se petrecea atunci.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} ${BE_PAST[p]} ${f.ing}`, mode);
      if (mode === 'negative') return sentence(`${s} ${BE_PAST[p]} not ${f.ing}`, mode);
      return sentence(`${BE_PAST[p]} ${s} ${f.ing}`, mode);
    },
  },
  {
    id: 'present-perfect',
    nameEn: 'Present Perfect',
    nameRo: 'Perfectul prezent',
    useRo: 'Momentul nu contează sau efectul se vede acum.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} ${HAVE[p]} ${f.participle}`, mode);
      if (mode === 'negative') return sentence(`${s} ${HAVE[p]} not ${f.participle}`, mode);
      return sentence(`${HAVE[p]} ${s} ${f.participle}`, mode);
    },
  },
  {
    id: 'present-perfect-continuous',
    nameEn: 'Present Perfect Continuous',
    nameRo: 'Perfectul prezent continuu',
    useRo: 'Acțiune începută în trecut și care ține până acum.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} ${HAVE[p]} been ${f.ing}`, mode);
      if (mode === 'negative') return sentence(`${s} ${HAVE[p]} not been ${f.ing}`, mode);
      return sentence(`${HAVE[p]} ${s} been ${f.ing}`, mode);
    },
  },
  {
    id: 'past-perfect',
    nameEn: 'Past Perfect',
    nameRo: 'Mai mult ca perfectul',
    useRo: 'Ce se întâmplase înainte de alt moment din trecut.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} had ${f.participle}`, mode);
      if (mode === 'negative') return sentence(`${s} had not ${f.participle}`, mode);
      return sentence(`had ${s} ${f.participle}`, mode);
    },
  },
  {
    id: 'future-will',
    nameEn: 'Future Simple (will)',
    nameRo: 'Viitorul cu will',
    useRo: 'Decizie de moment, promisiune, predicție.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} will ${f.base}`, mode);
      if (mode === 'negative') return sentence(`${s} will not ${f.base}`, mode);
      return sentence(`will ${s} ${f.base}`, mode);
    },
  },
  {
    id: 'future-going-to',
    nameEn: 'Future (going to)',
    nameRo: 'Viitorul cu going to',
    useRo: 'Plan deja făcut sau predicție cu dovadă vizibilă.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} ${BE_PRESENT[p]} going to ${f.base}`, mode);
      if (mode === 'negative') return sentence(`${s} ${BE_PRESENT[p]} not going to ${f.base}`, mode);
      return sentence(`${BE_PRESENT[p]} ${s} going to ${f.base}`, mode);
    },
  },
  {
    id: 'future-perfect',
    nameEn: 'Future Perfect',
    nameRo: 'Viitorul anterior',
    useRo: 'Ce va fi gata până la un moment din viitor.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} will have ${f.participle}`, mode);
      if (mode === 'negative') return sentence(`${s} will not have ${f.participle}`, mode);
      return sentence(`will ${s} have ${f.participle}`, mode);
    },
  },
  {
    id: 'conditional',
    nameEn: 'Conditional (would)',
    nameRo: 'Condiționalul prezent',
    useRo: 'Ce ai face într-o situație ipotetică.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} would ${f.base}`, mode);
      if (mode === 'negative') return sentence(`${s} would not ${f.base}`, mode);
      return sentence(`would ${s} ${f.base}`, mode);
    },
  },
  {
    id: 'conditional-perfect',
    nameEn: 'Conditional Perfect',
    nameRo: 'Condiționalul perfect',
    useRo: 'Ce ai fi făcut în trecut, dar nu s-a întâmplat.',
    build(f, p, mode) {
      const s = SUBJECT[p];
      if (mode === 'affirmative') return sentence(`${s} would have ${f.participle}`, mode);
      if (mode === 'negative') return sentence(`${s} would not have ${f.participle}`, mode);
      return sentence(`would ${s} have ${f.participle}`, mode);
    },
  },
];

/** Formele care nu depind de persoană — afișate separat, deasupra tabelelor. */
export function nonFiniteForms(f: VerbForms): { labelRo: string; value: string }[] {
  return [
    { labelRo: 'Infinitiv', value: `to ${f.base}` },
    { labelRo: 'Persoana a III-a', value: f.thirdPerson },
    { labelRo: 'Gerunziu / -ing', value: f.ing },
    { labelRo: 'Trecut (forma a II-a)', value: f.altPast ? `${f.past} / ${f.altPast}` : f.past },
    { labelRo: 'Participiu (forma a III-a)', value: f.altParticiple ? `${f.participle} / ${f.altParticiple}` : f.participle },
    { labelRo: 'Imperativ', value: `${f.base}! / Don't ${f.base}!` },
  ];
}

/**
 * Un set de exerciții pe verbe neregulate, generat la cerere: antrenament practic infinit,
 * fără să scriem de mână sute de exerciții. Verbele cu două forme (was / were) sunt sărite.
 */
export function irregularExercises(count = 10): GrammarExercise[] {
  const pool = IRREGULAR_VERBS.filter((v) => !v.past.includes('/'));
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);

  return shuffled.map((v, i) => {
    const askParticiple = i % 2 === 1;
    const answer = askParticiple ? v.participle : v.past;
    const alt = askParticiple ? v.altParticiple : v.altPast;
    return {
      kind: 'fill' as const,
      text: askParticiple
        ? `Participiul (forma a III-a) lui „${v.base}" este ___ .`
        : `Trecutul lui „${v.base}" este ___ .`,
      answer,
      accept: alt ? [alt] : undefined,
      explainRo: `${v.base} – ${v.past} – ${v.participle} (${v.ro})`,
    };
  });
}

/** Verbele sugerate la căutare — potrivire după început de cuvânt sau după traducere. */
export function searchVerbs(query: string, limit = 8): IrregularVerb[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = IRREGULAR_VERBS.filter((v) => v.base.startsWith(q));
  const others = IRREGULAR_VERBS.filter((v) => !v.base.startsWith(q) && (v.base.includes(q) || v.ro.includes(q)));
  return [...starts, ...others].slice(0, limit);
}
