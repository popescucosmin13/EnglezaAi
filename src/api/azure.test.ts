// Teste pentru fallback-ul STT-diff (aliniere LCS pe cuvinte) — folosit la
// pronunție și la „Reformulează acum" când Azure nu e configurat.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./backend', () => ({ apiFetch: vi.fn(), apiError: vi.fn() }));
vi.mock('./stt', () => ({ transcribe: vi.fn(), referenceHint: vi.fn() }));
vi.mock('../audio/wav', () => ({ blobToBase64: vi.fn() }));

import { assessWithAzure, sttDiffAssessment } from './azure';
import { apiFetch } from './backend';
import { transcribe } from './stt';

describe('assessWithAzure — parsarea răspunsului Azure', () => {
  const okResponse = (data: unknown) => ({ ok: true, json: async () => data }) as unknown as Response;

  it('citește forma PLATĂ a REST short-audio (scoruri direct pe NBest[0] și pe Words)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okResponse({
      RecognitionStatus: 'Success',
      DisplayText: 'Good morning.',
      SNR: 38,
      NBest: [{
        Lexical: 'good morning',
        AccuracyScore: 96, FluencyScore: 90, ProsodyScore: 88, PronScore: 94,
        Words: [
          { Word: 'good', AccuracyScore: 95, Phonemes: [{ Phoneme: 'g', AccuracyScore: 92 }, { Phoneme: 'ʊ', AccuracyScore: 80 }] },
          { Word: 'morning', AccuracyScore: 97, Phonemes: [{ Phoneme: 'm', AccuracyScore: 99 }] },
        ],
      }],
    }));
    const r = await assessWithAzure(new Blob(), 'Good morning');
    expect(r.source).toBe('azure');
    expect(r.accuracyScore).toBe(96);
    expect(r.fluencyScore).toBe(90);
    expect(r.prosodyScore).toBe(88);
    expect(r.words).toEqual([{ word: 'good', score: 95 }, { word: 'morning', score: 97 }]);
    expect(r.phonemes.find((p) => p.phoneme === 'g')?.score).toBe(92);
    expect(r.phonemes.find((p) => p.phoneme === 'ʊ')?.score).toBe(80);
  });

  it('citește și forma IMBRICATĂ (SDK: obj.PronunciationAssessment.X)', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okResponse({
      RecognitionStatus: 'Success',
      NBest: [{
        PronunciationAssessment: { AccuracyScore: 80, FluencyScore: 70, ProsodyScore: 60 },
        Words: [{ Word: 'hi', PronunciationAssessment: { AccuracyScore: 85 }, Phonemes: [{ Phoneme: 'h', PronunciationAssessment: { AccuracyScore: 88 } }] }],
      }],
    }));
    const r = await assessWithAzure(new Blob(), 'hi');
    expect(r.source).toBe('azure');
    expect(r.accuracyScore).toBe(80);
    expect(r.words).toEqual([{ word: 'hi', score: 85 }]);
    expect(r.phonemes.find((p) => p.phoneme === 'h')?.score).toBe(88);
  });

  it('răspuns fără scoruri (doar recunoaștere) → cade pe STT-diff, nu pe scor 0 fals', async () => {
    vi.mocked(apiFetch).mockResolvedValue(okResponse({
      RecognitionStatus: 'Success',
      NBest: [{ Lexical: 'good morning' }], // niciun scor
    }));
    vi.mocked(transcribe).mockResolvedValue({ text: 'good morning' } as Awaited<ReturnType<typeof transcribe>>);
    const r = await assessWithAzure(new Blob(), 'good morning');
    expect(r.source).toBe('stt-diff');
  });
});

describe('sttDiffAssessment', () => {
  it('transcriere identică → 100%', () => {
    const r = sttDiffAssessment('I am thirty years old', 'I am thirty years old');
    expect(r.accuracyScore).toBe(100);
    expect(r.words.every((w) => w.score === 100)).toBe(true);
    expect(r.source).toBe('stt-diff');
  });

  it('ignoră punctuația și majusculele', () => {
    const r = sttDiffAssessment('Hello, world!', 'hello world');
    expect(r.accuracyScore).toBe(100);
  });

  it('punctează proporțional cuvintele regăsite în ordine', () => {
    // 6 din 8 cuvinte de referință apar în ordine în transcriere
    const r = sttDiffAssessment('i have been working here for two years', 'i been working here two years');
    expect(r.accuracyScore).toBe(75);
    expect(r.words.find((w) => w.word === 'have')?.score).toBe(0);
    expect(r.words.find((w) => w.word === 'working')?.score).toBe(100);
  });

  it('cuvintele în ordine greșită nu sunt considerate potrivite (LCS)', () => {
    const r = sttDiffAssessment('the red car', 'car red the');
    expect(r.accuracyScore).toBe(33); // doar un cuvânt poate rămâne în ordine
  });

  it('tolerează inflexiuni/plural din STT (work/worked, year/years)', () => {
    // cuvinte rostite corect dar transcrise cu altă terminație — nu mai sunt punctate greșit
    const r = sttDiffAssessment('I worked here for two years', 'I work here for two year');
    expect(r.accuracyScore).toBe(100);
  });

  it('tolerează contracțiile STT (I am → I\'m, it is → it\'s)', () => {
    // STT-ul scrie des contracții unde referința are forma lungă — o pronunție corectă nu trebuie penalizată
    const r = sttDiffAssessment('I am sure it is fine', "I'm sure it's fine");
    expect(r.accuracyScore).toBe(100);
  });

  it('nu potrivește fals cuvinte scurte diferite (the/there rămâne cu prag pe lungime)', () => {
    // „car" (3 litere) nu se potrivește cu „cart"; doar cuvintele exacte contează aici
    const r = sttDiffAssessment('a car', 'a cart');
    expect(r.accuracyScore).toBe(50); // doar „a" se potrivește, „car" ≠ „cart"
  });

  it('transcriere goală → 0%', () => {
    const r = sttDiffAssessment('say something', '');
    expect(r.accuracyScore).toBe(0);
    expect(r.words.every((w) => w.score === 0)).toBe(true);
  });

  it('referință goală → 0% fără împărțire la zero', () => {
    const r = sttDiffAssessment('', 'anything');
    expect(r.accuracyScore).toBe(0);
    expect(r.words).toHaveLength(0);
  });
});
