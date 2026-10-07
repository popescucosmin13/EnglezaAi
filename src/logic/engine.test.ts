// Teste pentru motorul educațional (§5, §29): stări, priorități, scor compozit,
// persistarea greșelilor (dedupe + reapariție) și detectarea folosirii spontane.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mistake, VocabItem, AnalyzedError } from '../types';
import { todayStr } from '../srs/ladder';

const db = vi.hoisted(() => ({
  getMistakes: vi.fn(),
  saveMistake: vi.fn(),
  getVocab: vi.fn(),
  saveVocab: vi.fn(),
  newId: vi.fn(() => 'generated-id'),
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  getSessions: vi.fn(),
  savePlan: vi.fn(),
  getPlan: vi.fn(),
  todayStr: vi.fn(() => '2026-07-15'),
  addXp: vi.fn(),
  bumpActivity: vi.fn(),
  getPronResults: vi.fn(),
  getActivity: vi.fn(),
  updateActivity: vi.fn(),
  getAllActivity: vi.fn(),
  getSituations: vi.fn(),
  saveSituation: vi.fn(),
  getMemory: vi.fn(),
  saveMemory: vi.fn(),
}));

vi.mock('../db/db', () => db);
// evită lanțul openrouter → settings → firebase în mediul de test
vi.mock('../api/openrouter', () => ({ chatJson: vi.fn(), chatText: vi.fn() }));

import {
  nextStatus,
  prioritizeMistakes,
  compositeScore,
  persistErrors,
  detectSpontaneousUse,
  reviewMistake,
  containsExpression,
  measureCompetencies,
  blendScores,
  competencyLevelFromScore,
  competencyLevelsFromScores,
  levelFromRecentEvidence,
  detectMistakeCorrectUse,
  formatMemoryForPrompt,
} from './engine';
import { normalizeProgramDuration, ninetyDayStage } from '../content';

function mistake(partial: Partial<Mistake>): Mistake {
  return {
    id: 'm1',
    original: 'I have 30 years',
    corrected: 'I am 30 years old',
    category: 'unnatural_phrasing',
    severity: 'medium',
    explanationRo: '',
    firstSeenAt: '2026-07-01T10:00:00.000Z',
    lastSeenAt: '2026-07-01T10:00:00.000Z',
    occurrenceCount: 1,
    status: 'new',
    review: { step: 0, nextReviewAt: todayStr(), correctUses: 0, failures: 0 },
    ...partial,
  };
}

function vocabItem(partial: Partial<VocabItem>): VocabItem {
  return {
    id: 'v1',
    word: 'get along',
    translation: '',
    kind: 'expression',
    example: '',
    recognized: true,
    pronounced: false,
    usedInSentence: false,
    usedInNewContext: false,
    usedSpontaneously: false,
    passiveScore: 30,
    activeScore: 0,
    review: { step: 0, nextReviewAt: todayStr(), correctUses: 0, failures: 0 },
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('nextStatus', () => {
  it('urcă pe scara stărilor după utilizări corecte', () => {
    expect(nextStatus(mistake({ review: { step: 0, nextReviewAt: '', correctUses: 0, failures: 0 } }))).toBe('new');
    expect(nextStatus(mistake({ review: { step: 0, nextReviewAt: '', correctUses: 1, failures: 0 } }))).toBe('learning');
    expect(nextStatus(mistake({ review: { step: 0, nextReviewAt: '', correctUses: 2, failures: 0 } }))).toBe('improving');
    expect(nextStatus(mistake({ review: { step: 0, nextReviewAt: '', correctUses: 4, failures: 0 } }))).toBe('almost');
    expect(nextStatus(mistake({ review: { step: 0, nextReviewAt: '', correctUses: 6, failures: 0 } }))).toBe('mastered');
  });

  it('o greșeală stăpânită fără utilizări noi devine reapărută', () => {
    expect(nextStatus(mistake({ status: 'mastered', review: { step: 0, nextReviewAt: '', correctUses: 0, failures: 1 } }))).toBe('reappeared');
  });
});

describe('prioritizeMistakes', () => {
  it('ordonează: severitate > categoria-focus > frecvență', () => {
    const high = mistake({ id: 'high', severity: 'high', occurrenceCount: 1 });
    const frequent = mistake({ id: 'freq', severity: 'medium', occurrenceCount: 10, category: 'past_simple' });
    const focus = mistake({ id: 'focus', severity: 'low', occurrenceCount: 1, category: 'article' });

    const noFocus = prioritizeMistakes([focus, frequent, high]);
    expect(noFocus.map((m) => m.id)).toEqual(['high', 'freq', 'focus']);

    const withFocus = prioritizeMistakes([focus, frequent, high], 'article');
    // focusul (0+50+500+10=560) urcă peste... nu peste high (1060), dar aproape de frecvent (610)
    expect(withFocus[0].id).toBe('high');
    expect(withFocus.map((m) => m.id)).toContain('focus');
  });

  it('nu mută array-ul primit', () => {
    const list = [mistake({ id: 'a', severity: 'low' }), mistake({ id: 'b', severity: 'high' })];
    prioritizeMistakes(list);
    expect(list.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('compositeScore', () => {
  it('aplică ponderile 30/25/20/15/10', () => {
    expect(compositeScore({ conversation: 100, grammar: 100, pronunciation: 100, vocabulary: 100, listening: 100 })).toBe(100);
    expect(compositeScore({ conversation: 80, grammar: 60, pronunciation: 40, vocabulary: 20, listening: 0 })).toBe(50);
    expect(compositeScore({ conversation: 0, grammar: 0, pronunciation: 0, vocabulary: 0, listening: 0 })).toBe(0);
  });
});

describe('persistErrors', () => {
  const err: AnalyzedError = {
    category: 'unnatural_phrasing',
    originalFragment: 'I have 30 years',
    correctFragment: 'I am 30 years old',
    severity: 'medium',
    explanationRo: 'Vârsta se exprimă cu "to be".',
  };

  it('o greșeală nouă se salvează cu status new și frecvență 1', async () => {
    db.getMistakes.mockResolvedValue([]);
    const map = new Map([[err, { original: 'I have 30 years.', corrected: 'I am 30 years old.' }]]);
    await persistErrors([err], map);

    expect(db.saveMistake).toHaveBeenCalledTimes(1);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.status).toBe('new');
    expect(saved.occurrenceCount).toBe(1);
    expect(saved.original).toBe('I have 30 years.');
    expect(saved.id).toBe('generated-id');
  });

  it('duplicatul crește frecvența și coboară SRS-ul (eșec la review)', async () => {
    const existing = mistake({ status: 'improving', occurrenceCount: 2, review: { step: 3, nextReviewAt: '2026-08-01', correctUses: 3, failures: 0 } });
    db.getMistakes.mockResolvedValue([existing]);
    await persistErrors([err], new Map());

    expect(db.saveMistake).toHaveBeenCalledTimes(1);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.occurrenceCount).toBe(3);
    expect(saved.review.failures).toBe(1);
    expect(saved.review.step).toBe(1); // 3 - 2
    expect(saved.status).toBe('learning');
  });

  it('o greșeală stăpânită care revine devine reapărută', async () => {
    const existing = mistake({ status: 'mastered', review: { step: 5, nextReviewAt: '2026-09-01', correctUses: 6, failures: 0 } });
    db.getMistakes.mockResolvedValue([existing]);
    await persistErrors([err], new Map());

    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.status).toBe('reappeared');
  });

  it('nu face nimic pentru o listă goală', async () => {
    await persistErrors([], new Map());
    expect(db.getMistakes).not.toHaveBeenCalled();
    expect(db.saveMistake).not.toHaveBeenCalled();
  });

  it('nu salvează diferențe doar de capitalizare sau punctuație', async () => {
    const cosmetic: AnalyzedError = {
      ...err,
      originalFragment: 'because I work here.',
      correctFragment: 'Because I work here!',
    };
    await persistErrors([cosmetic], new Map([[cosmetic, { original: cosmetic.originalFragment, corrected: cosmetic.correctFragment }]]));
    expect(db.getMistakes).not.toHaveBeenCalled();
    expect(db.saveMistake).not.toHaveBeenCalled();
  });

  it('elimină ezitările din corectură înainte de salvare', async () => {
    db.getMistakes.mockResolvedValue([]);
    const map = new Map([[err, { original: 'I uh have 30 years.', corrected: 'I uh am 30 years old.' }]]);
    await persistErrors([err], map);
    expect((db.saveMistake.mock.calls[0][0] as Mistake).corrected).toBe('I am 30 years old.');
  });

  it('actualizează corectura unui duplicat cu varianta validă cea mai nouă', async () => {
    const existing = mistake({ corrected: 'I have 30 years old', occurrenceCount: 2 });
    db.getMistakes.mockResolvedValue([existing]);
    const map = new Map([[err, { original: 'I have 30 years.', corrected: 'I am 30 years old.' }]]);
    await persistErrors([err], map);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.corrected).toBe('I am 30 years old.');
    expect(saved.occurrenceCount).toBe(3);
  });

  it('salvează fragmentele atomice pe lângă propoziția completă', async () => {
    db.getMistakes.mockResolvedValue([]);
    const map = new Map([[err, { original: 'Well, I have 30 years and I live here.', corrected: 'Well, I am 30 years old and I live here.' }]]);
    await persistErrors([err], map);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.originalFragment).toBe('I have 30 years');
    expect(saved.correctFragment).toBe('I am 30 years old');
    expect(saved.original).toBe('Well, I have 30 years and I live here.');
  });

  it('aceeași corectură etichetată cu altă categorie nu creează card nou', async () => {
    const existing = mistake({
      originalFragment: 'She like',
      correctFragment: 'She likes',
      category: 'present_simple',
      occurrenceCount: 1,
    });
    db.getMistakes.mockResolvedValue([existing]);
    const relabeled: AnalyzedError = { ...err, category: 'other', originalFragment: 'She like', correctFragment: 'She likes' };
    await persistErrors([relabeled], new Map());
    expect(db.saveMistake).toHaveBeenCalledTimes(1);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.id).toBe('m1');
    expect(saved.occurrenceCount).toBe(2);
  });

  it('nu salvează „corecturi" care doar înlocuiesc numele utilizatorului', async () => {
    db.getProfile.mockResolvedValueOnce({ email: 'alex.ionescu@example.com' });
    const nameErr: AnalyzedError = { ...err, originalFragment: 'Alex', correctFragment: 'Cosmic' };
    await persistErrors([nameErr], new Map([[nameErr, { original: 'Alex', corrected: 'Cosmic' }]]));
    expect(db.getMistakes).not.toHaveBeenCalled();
    expect(db.saveMistake).not.toHaveBeenCalled();
  });
});

describe('reviewMistake', () => {
  it('succesul urcă SRS-ul, dă XP și actualizează statusul', async () => {
    const m = mistake({ review: { step: 1, nextReviewAt: todayStr(), correctUses: 1, failures: 0 } });
    const updated = await reviewMistake(m, 'good');
    expect(updated.review.correctUses).toBe(2);
    expect(updated.status).toBe('improving');
    expect(db.saveMistake).toHaveBeenCalledWith(updated);
    expect(db.addXp).toHaveBeenCalledWith(5);
  });

  it('eșecul nu dă XP și readuce greșeala în învățare', async () => {
    const m = mistake({ status: 'almost', review: { step: 4, nextReviewAt: todayStr(), correctUses: 4, failures: 0 } });
    const updated = await reviewMistake(m, 'fail');
    expect(updated.status).toBe('learning');
    expect(updated.review.step).toBe(2);
    expect(db.addXp).not.toHaveBeenCalled();
  });
});

describe('containsExpression', () => {
  it('potrivește doar cuvinte întregi, nu substring-uri', () => {
    expect(containsExpression('I saw a cat yesterday', 'cat')).toBe(true);
    expect(containsExpression('That category is wrong', 'cat')).toBe(false);
    expect(containsExpression('We get along well', 'get along')).toBe(true);
    expect(containsExpression('I get a long email', 'get along')).toBe(false);
  });

  it('ignoră punctuația și majusculele', () => {
    expect(containsExpression('Honestly, we GET ALONG!', 'get along')).toBe(true);
    expect(containsExpression('', 'cat')).toBe(false);
    expect(containsExpression('anything', '')).toBe(false);
  });
});

describe('detectSpontaneousUse', () => {
  it('marchează expresia folosită spontan în replică și pornește contorul', async () => {
    const v = vocabItem({ word: 'get along' });
    db.getVocab.mockResolvedValue([v]);
    const used = await detectSpontaneousUse('We get along really well at work.');
    expect(used).toEqual(['get along']);
    expect(db.saveVocab).toHaveBeenCalledTimes(1);
    const saved = db.saveVocab.mock.calls[0][0] as VocabItem;
    expect(saved.usedSpontaneously).toBe(true);
    expect(saved.spontaneousUses).toBe(1);
    expect(saved.activeScore).toBeGreaterThan(0);
  });

  it('numără utilizările repetate până la activarea completă (3)', async () => {
    const v = vocabItem({ word: 'get along', usedSpontaneously: true, spontaneousUses: 2, activeScore: 40 });
    db.getVocab.mockResolvedValue([v]);
    const used = await detectSpontaneousUse('We still get along fine.');
    expect(used).toEqual(['get along']);
    const saved = db.saveVocab.mock.calls[0][0] as VocabItem;
    expect(saved.spontaneousUses).toBe(3);
  });

  it('ignoră expresiile complet activate (3+ spontane) și pe cele absente', async () => {
    db.getVocab.mockResolvedValue([
      vocabItem({ id: 'v1', word: 'get along', usedSpontaneously: true, spontaneousUses: 3 }),
      vocabItem({ id: 'v2', word: 'figure out' }),
    ]);
    const used = await detectSpontaneousUse('We get along really well.');
    expect(used).toEqual([]);
    expect(db.saveVocab).not.toHaveBeenCalled();
  });

  it('nu potrivește cuvântul înăuntrul altui cuvânt', async () => {
    db.getVocab.mockResolvedValue([vocabItem({ word: 'cat' })]);
    const used = await detectSpontaneousUse('That category is interesting.');
    expect(used).toEqual([]);
    expect(db.saveVocab).not.toHaveBeenCalled();
  });
});

describe('detectMistakeCorrectUse — pipeline-ul problemelor (§P1)', () => {
  it('forma corectă folosită când era țintă → „folosită ghidat"', async () => {
    const m = mistake({ corrected: 'I am 30 years old' });
    db.getMistakes.mockResolvedValue([m]);
    const used = await detectMistakeCorrectUse('Well, I am 30 years old now.', ['I am 30 years old']);
    expect(used).toEqual(['I am 30 years old']);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.pipeline?.usedGuided).toBe(true);
    expect(saved.pipeline?.spontaneousUses ?? 0).toBe(0);
  });

  it('forma corectă folosită fără să fie țintă → utilizare spontană', async () => {
    const m = mistake({ corrected: 'I am 30 years old' });
    db.getMistakes.mockResolvedValue([m]);
    await detectMistakeCorrectUse('Actually I am 30 years old.', []);
    const saved = db.saveMistake.mock.calls[0][0] as Mistake;
    expect(saved.pipeline?.spontaneousUses).toBe(1);
    expect(saved.pipeline?.usedGuided).toBe(false);
  });

  it('ignoră formele de un singur cuvânt și greșelile stăpânite', async () => {
    db.getMistakes.mockResolvedValue([
      mistake({ id: 'a', corrected: 'went' }),
      mistake({ id: 'b', corrected: 'I am 30 years old', status: 'mastered' }),
    ]);
    const used = await detectMistakeCorrectUse('I went home. I am 30 years old.', []);
    expect(used).toEqual([]);
    expect(db.saveMistake).not.toHaveBeenCalled();
  });
});

describe('measureCompetencies', () => {
  const session = (over: Record<string, unknown>) => ({
    id: 's',
    type: 'free',
    startedAt: '2026-07-10T10:00:00.000Z',
    durationSec: 600,
    userSpeakingSec: 300,
    wordCount: 400,
    uniqueWords: 180,
    avgHesitationMs: 2000,
    errorCount: 12,
    highSeverityCount: 1,
    turns: [],
    ...over,
  }) as any;

  it('nu întoarce nimic sub 3 sesiuni valide (nu promovăm după una singură)', () => {
    expect(measureCompetencies([session({}), session({})], [], [])).toEqual({});
  });

  it('măsoară gramatica, conversația și vocabularul din fereastra de sesiuni', () => {
    const m = measureCompetencies([session({}), session({}), session({})], [], []);
    // 3 greșeli/100 → 95 - 16.5 ≈ 78
    expect(m.grammar).toBeGreaterThan(70);
    expect(m.grammar).toBeLessThan(85);
    expect(m.conversation).toBeGreaterThan(0);
    expect(m.vocabulary).toBeGreaterThan(0);
    expect(m.listening).toBeUndefined();
    expect(m.pronunciation).toBeUndefined(); // fără rezultate de pronunție
  });

  it('pronunția vine din media rezultatelor recente (minim 5)', () => {
    const pron = Array.from({ length: 6 }, () => ({ score: 80 })) as any[];
    const m = measureCompetencies([], [], pron);
    expect(m.pronunciation).toBe(80);
  });

  it('ascultarea vine doar din exercițiile listening ladder, separat de pronunție', () => {
    const listening = Array.from({ length: 5 }, () => ({ score: 70, exercise: 'listening' })) as any[];
    const m = measureCompetencies([], [], listening);
    expect(m.listening).toBe(70);
    expect(m.pronunciation).toBeUndefined();
  });
});

describe('formatMemoryForPrompt', () => {
  it('formatează compact faptele, subiectele recente și firele deschise', () => {
    const out = formatMemoryForPrompt({
      facts: ['works in IT support', 'has two kids'],
      topics: [{ topic: 'OneDrive incident', date: '2026-07-15' }, { topic: 'weekend plans', date: '2026-07-16' }],
      openThreads: ['client demo on Friday'],
      updatedAt: '',
    });
    expect(out).toContain('works in IT support');
    expect(out).toContain('weekend plans (2026-07-16)');
    expect(out).toContain('client demo on Friday');
  });

  it('memoria goală produce string gol (nu se injectează nimic în prompt)', () => {
    expect(formatMemoryForPrompt({ facts: [], topics: [], openThreads: [], updatedAt: '' })).toBe('');
  });

  it('plafonează listele lungi', () => {
    const out = formatMemoryForPrompt({
      facts: Array.from({ length: 30 }, (_, i) => `fact ${i}`),
      topics: Array.from({ length: 30 }, (_, i) => ({ topic: `topic ${i}`, date: '2026-07-01' })),
      openThreads: [],
      updatedAt: '',
    });
    expect(out).not.toContain('fact 12'); // max 12 fapte
    expect(out).toContain('topic 29'); // ultimele 8 subiecte
    expect(out).not.toContain('topic 21');
  });
});

describe('blendScores', () => {
  it('amestecă 70/30 doar competențele măsurate', () => {
    const current = { conversation: 40, grammar: 40, pronunciation: 40, vocabulary: 40, listening: 40 };
    const next = blendScores(current, { grammar: 80 });
    expect(next.grammar).toBe(52); // 40*0.7 + 80*0.3
    expect(next.listening).toBe(40);
    expect(next.conversation).toBe(40);
  });
});

describe('niveluri CEFR din progres măsurat', () => {
  it('mapează consecvent scorurile la nivelurile CEFR', () => {
    expect(competencyLevelFromScore(34)).toBe('A1');
    expect(competencyLevelFromScore(35)).toBe('A2');
    expect(competencyLevelFromScore(50)).toBe('B1');
    expect(competencyLevelFromScore(65)).toBe('B2');
    expect(competencyLevelFromScore(80)).toBe('C1');
    expect(competencyLevelFromScore(90)).toBe('C2');
  });

  it('actualizează separat fiecare competență', () => {
    expect(competencyLevelsFromScores({ conversation: 55, grammar: 48, pronunciation: 66, vocabulary: 82, listening: 31 }))
      .toEqual({ conversation: 'B1', grammar: 'A2', pronunciation: 'B2', vocabulary: 'C1', listening: 'A1' });
  });

  it('promovează doar după patru sesiuni consecvente și un scor care confirmă', () => {
    expect(levelFromRecentEvidence('A2', ['B1', 'B1', 'B1'], 60)).toBe('A2');
    expect(levelFromRecentEvidence('A2', ['B1', 'B1', 'B1', 'B1'], 49)).toBe('A2');
    expect(levelFromRecentEvidence('A2', ['B1', 'B1', 'B1', 'B1'], 50)).toBe('B1');
  });

  it('nu sare peste mai multe niveluri într-o singură actualizare', () => {
    expect(levelFromRecentEvidence('A2', ['B2', 'B2', 'B2', 'B2', 'B2'], 80)).toBe('B1');
  });
});

describe('program extensibil', () => {
  it('normalizează durata în pași de 30 de zile fără a coborî sub 90', () => {
    expect(normalizeProgramDuration(undefined)).toBe(90);
    expect(normalizeProgramDuration(100)).toBe(90);
    expect(normalizeProgramDuration(121)).toBe(120);
  });

  it('continuă cu etape de consolidare după ziua 90', () => {
    expect(ninetyDayStage(89, 120).stage).toBe('Zilele 61–90');
    expect(ninetyDayStage(90, 120).stage).toBe('Extensie · zilele 91–120');
    expect(ninetyDayStage(200, 120).stage).toBe('Extensie · zilele 91–120');
  });
});
