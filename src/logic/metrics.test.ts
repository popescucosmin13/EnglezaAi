// Teste pentru indicatorii de progres real (§25) și misiuni (§24).

import { describe, it, expect } from 'vitest';
import type { Session, VocabItem, DailyActivity, Mistake } from '../types';
import { todayStr } from '../srs/ladder';
import {
  daysAgoStr,
  isoWeekId,
  computeIndicators,
  dayTrend,
  dailyMissionProgress,
  weeklyMissionProgress,
  newlyCompletedMissions,
  buildWeeklyStats,
} from './metrics';

function emptyActivity(date: string): DailyActivity {
  return {
    date,
    speakingSec: 0,
    appActiveSec: 0,
    sessionCount: 0,
    vocabReviews: 0,
    pronPhrases: 0,
    shadowPhrases: 0,
    lessonDone: false,
    expressionsUsed: 0,
    sentencesRepeated: 0,
    noRomanianConvo: false,
    oldMistakeFixed: false,
    noHelpConvo: false,
    testDone: false,
    xp: 0,
  };
}

function session(partial: Partial<Session>): Session {
  return {
    id: 's1',
    type: 'free',
    startedAt: `${todayStr()}T10:00:00.000Z`,
    durationSec: 300,
    userSpeakingSec: 0,
    wordCount: 0,
    uniqueWords: 0,
    errorCount: 0,
    highSeverityCount: 0,
    turns: [],
    ...partial,
  };
}

function vocabItem(partial: Partial<VocabItem>): VocabItem {
  return {
    id: 'v1',
    word: 'get along',
    translation: 'a se înțelege',
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

describe('daysAgoStr', () => {
  it('0 zile în urmă este azi', () => {
    expect(daysAgoStr(0)).toBe(todayStr());
  });
  it('rezultatul este strict anterior pentru n > 0', () => {
    expect(daysAgoStr(7) < todayStr()).toBe(true);
  });
});

describe('isoWeekId', () => {
  it('calculează săptămâna ISO corect la granițele de an', () => {
    // 1 ian 2026 e joi → prima săptămână ISO a lui 2026
    expect(isoWeekId(new Date(2026, 0, 1))).toBe('2026-W01');
    // 1 ian 2021 e vineri → aparține ultimei săptămâni ISO din 2020 (W53)
    expect(isoWeekId(new Date(2021, 0, 1))).toBe('2020-W53');
  });
  it('are formatul YYYY-Wnn', () => {
    expect(isoWeekId()).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('computeIndicators', () => {
  const sessions = [
    session({ id: 'a', startedAt: '2026-07-10T10:00:00.000Z', userSpeakingSec: 120, wordCount: 200, errorCount: 10, avgHesitationMs: 1000 }),
    session({ id: 'b', startedAt: '2026-07-14T10:00:00.000Z', userSpeakingSec: 60, wordCount: 100, errorCount: 5, type: 'nohelp' }),
  ];
  const vocab = [vocabItem({ id: 'v1', activeScore: 70 }), vocabItem({ id: 'v2', activeScore: 50 })];

  it('agregă minute, cuvinte/min, greșeli/100 și pauza medie', () => {
    const ind = computeIndicators(sessions, vocab);
    expect(ind.minutesSpoken).toBe(3);
    expect(ind.wordsPerMinute).toBe(100); // 300 cuvinte / 3 minute
    expect(ind.errorsPer100).toBe(5); // 15 erori / 300 cuvinte
    expect(ind.avgPauseSec).toBe(1); // singura sesiune cu ezitare măsurată
    expect(ind.activeExpressions).toBe(1); // doar activeScore >= 60
    expect(ind.noHelpConvos).toBe(1);
    expect(ind.sessionsCount).toBe(2);
  });

  it('filtrează după sinceDate', () => {
    const ind = computeIndicators(sessions, vocab, '2026-07-12');
    expect(ind.sessionsCount).toBe(1);
    expect(ind.minutesSpoken).toBe(1);
  });

  it('nu împarte la zero pe liste goale', () => {
    const ind = computeIndicators([], []);
    expect(ind.wordsPerMinute).toBeNull();
    expect(ind.errorsPer100).toBeNull();
    expect(ind.avgPauseSec).toBeNull();
    expect(ind.minutesSpoken).toBe(0);
  });
});

describe('dayTrend', () => {
  it('agregă sesiunile din aceeași zi și sortează cronologic', () => {
    const t = dayTrend([
      session({ id: 'a', startedAt: '2026-07-10T09:00:00.000Z', userSpeakingSec: 60, wordCount: 100, errorCount: 4 }),
      session({ id: 'b', startedAt: '2026-07-10T18:00:00.000Z', userSpeakingSec: 60, wordCount: 100, errorCount: 6 }),
      session({ id: 'c', startedAt: '2026-07-08T10:00:00.000Z', userSpeakingSec: 120, wordCount: 300, errorCount: 3 }),
    ]);
    expect(t.map((d) => d.date)).toEqual(['2026-07-08', '2026-07-10']);
    expect(t[1].errorsPer100).toBe(5); // 10 erori / 200 cuvinte
    expect(t[1].minutes).toBe(2);
  });

  it('păstrează doar ultimele N zile', () => {
    const sessions = Array.from({ length: 20 }, (_, i) =>
      session({ id: `s${i}`, startedAt: `2026-06-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`, wordCount: 10, errorCount: 1 })
    );
    expect(dayTrend(sessions, 14)).toHaveLength(14);
  });
});

describe('progresul misiunilor', () => {
  it('dailyMissionProgress derivă din activitatea zilei', () => {
    const a: DailyActivity = {
      date: todayStr(), speakingSec: 660, appActiveSec: 0, sessionCount: 2, vocabReviews: 0, pronPhrases: 0,
      shadowPhrases: 0, lessonDone: false, expressionsUsed: 4, sentencesRepeated: 6,
      noRomanianConvo: true, oldMistakeFixed: false, noHelpConvo: false, testDone: false, xp: 0,
    };
    expect(dailyMissionProgress(a)).toEqual({ speak10: 11, expr3: 4, repeat5: 6, noro: 1, oldfix: 0 });
  });

  it('weeklyMissionProgress numără doar ultimele 7 zile', () => {
    const recent: DailyActivity = { ...emptyActivity(todayStr()), speakingSec: 1200 };
    const old: DailyActivity = { ...emptyActivity('2020-01-01'), speakingSec: 60000 };
    const weekSessions = [
      session({ id: 'a', type: 'roleplay' }),
      session({ id: 'b', type: 'professional' }),
      session({ id: 'c', type: 'free' }),
    ];
    const w = weeklyMissionProgress([recent, old], weekSessions, [vocabItem({ activeScore: 80 })]);
    expect(w.w_min100).toBe(20); // doar activitatea recentă
    expect(w.w_conv5).toBe(3);
    expect(w.w_sim2).toBe(2); // roleplay + professional
    expect(w.w_expr20).toBe(1);
    expect(w.w_test1).toBe(0);
  });

  it('newlyCompletedMissions premiază doar misiunile terminate și neplătite', () => {
    const missions = [
      { id: 'a', target: 10, xp: 30 },
      { id: 'b', target: 3, xp: 20 },
      { id: 'c', target: 1, xp: 25 },
    ];
    const progress = { a: 12, b: 3, c: 0 };
    expect(newlyCompletedMissions(missions, progress, ['a']).map((m) => m.id)).toEqual(['b']);
    expect(newlyCompletedMissions(missions, progress, []).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('buildWeeklyStats — atribuirea aparițiilor pe perioade', () => {
  function mistakeWith(partial: Partial<Mistake>): Mistake {
    return {
      id: 'm1',
      original: 'I have 30 years',
      corrected: 'I am 30 years old',
      category: 'unnatural_phrasing',
      severity: 'medium',
      explanationRo: '',
      firstSeenAt: '2026-05-01T10:00:00.000Z',
      lastSeenAt: '2026-05-01T10:00:00.000Z',
      occurrenceCount: 1,
      status: 'new',
      review: { step: 0, nextReviewAt: todayStr(), correctUses: 0, failures: 0 },
      ...partial,
    };
  }

  it('cu istoric per apariție, doar evenimentele din săptămână sunt „recente"', () => {
    const oldDate = '2026-05-01T10:00:00.000Z';
    const m = mistakeWith({
      occurrenceCount: 5,
      lastSeenAt: `${todayStr()}T10:00:00.000Z`,
      occurrences: [oldDate, oldDate, oldDate, oldDate, `${todayStr()}T10:00:00.000Z`],
    });
    const stats = buildWeeklyStats([], [m], []);
    expect(stats).toContain('1 recente / 4 mai vechi');
  });

  it('fără istoric (date vechi), doar ultima apariție e considerată recentă', () => {
    const m = mistakeWith({ occurrenceCount: 5, lastSeenAt: `${todayStr()}T10:00:00.000Z`, occurrences: undefined });
    const stats = buildWeeklyStats([], [m], []);
    expect(stats).toContain('1 recente / 4 mai vechi');
  });
});
