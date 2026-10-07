// Indicatorii de progres real (§25) + agregări pentru rapoarte (§26) și misiuni (§24).

import type { Session, Mistake, DailyActivity, VocabItem } from '../types';
import { CATEGORY_LABELS_RO } from '../types';
import { todayStr } from '../srs/ladder';

export function daysAgoStr(n: number): string {
  return todayStr(new Date(Date.now() - n * 86400000));
}

export function isoWeekId(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export interface Indicators {
  minutesSpoken: number;
  wordsPerMinute: number | null;
  avgPauseSec: number | null;
  errorsPer100: number | null;
  activeExpressions: number;
  noHelpConvos: number;
  sessionsCount: number;
}

export function computeIndicators(sessions: Session[], vocab: VocabItem[], sinceDate?: string): Indicators {
  const list = sinceDate ? sessions.filter((s) => s.startedAt.slice(0, 10) >= sinceDate) : sessions;
  const speakSec = list.reduce((a, s) => a + s.userSpeakingSec, 0);
  const words = list.reduce((a, s) => a + s.wordCount, 0);
  const errors = list.reduce((a, s) => a + s.errorCount, 0);
  const pauses = list.map((s) => s.avgHesitationMs).filter((h): h is number => h != null);
  return {
    minutesSpoken: Math.round(speakSec / 60),
    wordsPerMinute: speakSec > 60 ? Math.round(words / (speakSec / 60)) : null,
    avgPauseSec: pauses.length ? Math.round((pauses.reduce((a, b) => a + b, 0) / pauses.length / 1000) * 10) / 10 : null,
    errorsPer100: words > 0 ? Math.round((errors / words) * 1000) / 10 : null,
    activeExpressions: vocab.filter((v) => v.activeScore >= 60).length,
    noHelpConvos: list.filter((s) => s.type === 'nohelp' || s.type === 'exam').length,
    sessionsCount: list.length,
  };
}

export function dayTrend(sessions: Session[], days = 14): { date: string; errorsPer100: number | null; minutes: number }[] {
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const d = s.startedAt.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const out: { date: string; errorsPer100: number | null; minutes: number }[] = [];
  for (const [date, list] of byDay) {
    const words = list.reduce((a, s) => a + s.wordCount, 0);
    const errors = list.reduce((a, s) => a + s.errorCount, 0);
    out.push({
      date,
      errorsPer100: words > 0 ? Math.round((errors / words) * 1000) / 10 : null,
      minutes: Math.round(list.reduce((a, s) => a + s.userSpeakingSec, 0) / 60),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}

/** Rezumat text pentru promptul raportului săptămânal (§26). */
export function buildWeeklyStats(sessions: Session[], mistakes: Mistake[], vocab: VocabItem[]): string {
  const since = daysAgoStr(7);
  const prevSince = daysAgoStr(14);
  const cur = computeIndicators(sessions, vocab, since);
  const prevSessions = sessions.filter((s) => s.startedAt.slice(0, 10) >= prevSince && s.startedAt.slice(0, 10) < since);
  const prev = computeIndicators(prevSessions, vocab);
  const catCounts = new Map<string, { recent: number; older: number }>();
  for (const m of mistakes) {
    const label = CATEGORY_LABELS_RO[m.category];
    const c = catCounts.get(label) ?? { recent: 0, older: 0 };
    if (m.occurrences && m.occurrences.length > 0) {
      // istoric per apariție: fiecare eveniment intră în perioada lui reală
      const recent = m.occurrences.filter((d) => d.slice(0, 10) >= since).length;
      c.recent += recent;
      c.older += Math.max(0, m.occurrenceCount - recent);
    } else if (m.lastSeenAt.slice(0, 10) >= since) {
      // date vechi fără istoric: doar ultima apariție e sigur recentă
      c.recent += 1;
      c.older += m.occurrenceCount - 1;
    } else {
      c.older += m.occurrenceCount;
    }
    catCounts.set(label, c);
  }
  const catLines = [...catCounts.entries()]
    .sort((a, b) => b[1].recent - a[1].recent)
    .map(([label, c]) => `  - ${label}: ${c.recent} recente / ${c.older} mai vechi`)
    .join('\n');
  const persistent = mistakes.filter((m) => m.status === 'reappeared' || (m.occurrenceCount >= 3 && m.status !== 'mastered'));
  const newExpr = vocab.filter((v) => v.createdAt.slice(0, 10) >= since);
  return `Săptămâna curentă: ${cur.minutesSpoken} minute vorbite, ${cur.sessionsCount} sesiuni, ${cur.errorsPer100 ?? 'n/a'} greșeli/100 cuvinte, pauza medie ${cur.avgPauseSec ?? 'n/a'}s, ${cur.wordsPerMinute ?? 'n/a'} cuvinte/min.
Săptămâna trecută: ${prev.minutesSpoken} minute, ${prev.errorsPer100 ?? 'n/a'} greșeli/100, pauza medie ${prev.avgPauseSec ?? 'n/a'}s.
Greșeli pe categorii:
${catLines || '  (nimic)'}
Greșeli persistente/reapărute: ${persistent.slice(0, 8).map((m) => `"${m.original.slice(0, 40)}" (${CATEGORY_LABELS_RO[m.category]}, ${m.occurrenceCount}x)`).join('; ') || 'niciuna'}
Expresii noi salvate: ${newExpr.slice(0, 15).map((v) => v.word).join(', ') || 'niciuna'}
Expresii active (folosite spontan): ${vocab.filter((v) => v.usedSpontaneously).length}`;
}

// ---------- Progresul misiunilor (§24), derivat din activitate ----------
export function dailyMissionProgress(a: DailyActivity): Record<string, number> {
  return {
    speak10: Math.round(a.speakingSec / 60),
    expr3: a.expressionsUsed,
    repeat5: a.sentencesRepeated,
    noro: a.noRomanianConvo ? 1 : 0,
    oldfix: a.oldMistakeFixed ? 1 : 0,
  };
}

/** Misiunile abia terminate care nu au primit încă XP-ul lor. */
export function newlyCompletedMissions<T extends { id: string; target: number }>(
  missions: T[],
  progress: Record<string, number>,
  alreadyAwarded: string[]
): T[] {
  return missions.filter((m) => (progress[m.id] ?? 0) >= m.target && !alreadyAwarded.includes(m.id));
}

export function weeklyMissionProgress(acts: DailyActivity[], sessions: Session[], vocab: VocabItem[]): Record<string, number> {
  const since = daysAgoStr(7);
  const week = acts.filter((a) => a.date >= since);
  const weekSessions = sessions.filter((s) => s.startedAt.slice(0, 10) >= since);
  return {
    w_min100: Math.round(week.reduce((a, b) => a + b.speakingSec, 0) / 60),
    w_conv5: weekSessions.length,
    w_sim2: weekSessions.filter((s) => s.type === 'professional' || s.type === 'roleplay' || s.type === 'exam').length,
    w_expr20: vocab.filter((v) => v.activeScore >= 60).length,
    w_test1: week.filter((a) => a.testDone).length,
  };
}
