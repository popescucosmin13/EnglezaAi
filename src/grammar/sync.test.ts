import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stocare în memorie în locul localStorage (nu există în Node) și strat de date fals,
// ca sincronizarea să fie testată fără Firestore.
const mem = new Map<string, string>();
vi.mock('../storage', () => ({
  storage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
}));

type RemoteState = { progress: Record<string, unknown>; drill: Record<string, unknown> };
const getMetaDoc = vi.fn<(id: string) => Promise<RemoteState | undefined>>();
const saveMetaDoc = vi.fn<(id: string, value: RemoteState) => Promise<void>>(async () => {});
vi.mock('../db/db', () => ({
  getMetaDoc: (id: string) => getMetaDoc(id),
  saveMetaDoc: (id: string, value: RemoteState) => saveMetaDoc(id, value),
}));

const { syncGrammarState } = await import('./sync');
const { getGrammarProgress, getDrillMemory, saveLessonScore, recordDrillAnswer, drillKey } = await import('./progress');

const lesson = (best: number, lastAt: string) => ({ read: true, best, total: 10, attempts: 1, lastAt });

beforeEach(() => {
  mem.clear();
  getMetaDoc.mockReset();
  saveMetaDoc.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('syncGrammarState', () => {
  it('îmbină starea din cloud cu cea locală și o scrie local', async () => {
    saveLessonScore('articles', 9, 10);
    getMetaDoc.mockResolvedValue({
      progress: { articles: lesson(4, '2026-03-01'), plural: lesson(7, '2026-03-02') },
      drill: {},
    });

    const state = await syncGrammarState();

    expect(state.progress.articles.best).toBe(9); // scorul local, mai bun
    expect(state.progress.plural.best).toBe(7); // lecția existentă doar în cloud
    expect(getGrammarProgress().plural.best).toBe(7); // s-a scris și în oglinda locală
  });

  it('urcă starea locală când în cloud nu există nimic', async () => {
    saveLessonScore('plural', 5, 10);
    getMetaDoc.mockResolvedValue(undefined);

    await syncGrammarState();
    expect(saveMetaDoc).not.toHaveBeenCalled(); // scrierile se grupează

    await vi.advanceTimersByTimeAsync(2000);
    expect(saveMetaDoc).toHaveBeenCalledTimes(1);
    expect(saveMetaDoc.mock.calls[0]).toEqual([
      'grammarCourse',
      { progress: getGrammarProgress(), drill: getDrillMemory() },
    ]);
  });

  it('nu urcă nimic dacă starea îmbinată e identică cu cea din cloud', async () => {
    getMetaDoc.mockResolvedValue({ progress: {}, drill: {} });

    await syncGrammarState();
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveMetaDoc).not.toHaveBeenCalled();
  });

  it('rămâne pe starea locală dacă cloudul nu răspunde', async () => {
    saveLessonScore('articles', 3, 10);
    getMetaDoc.mockRejectedValue(new Error('offline'));

    const state = await syncGrammarState();
    expect(state.progress.articles.best).toBe(3);
  });

  it('grupează scrierile: mai multe răspunsuri la rând înseamnă o singură urcare', async () => {
    getMetaDoc.mockResolvedValue({ progress: {}, drill: {} });
    await syncGrammarState();

    recordDrillAnswer(drillKey('articles', 0), true);
    recordDrillAnswer(drillKey('articles', 1), false);
    recordDrillAnswer(drillKey('plural', 0), true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(saveMetaDoc).toHaveBeenCalledTimes(1);
    expect(Object.keys(saveMetaDoc.mock.calls[0]![1].drill)).toHaveLength(3);
  });

  it('o urcare eșuată nu rupe salvarea locală', async () => {
    getMetaDoc.mockResolvedValue({ progress: {}, drill: {} });
    saveMetaDoc.mockRejectedValueOnce(new Error('offline'));
    await syncGrammarState();

    saveLessonScore('to-be', 8, 10);
    await vi.advanceTimersByTimeAsync(2000);

    expect(getGrammarProgress()['to-be'].best).toBe(8);
  });
});
