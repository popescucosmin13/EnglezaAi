import { PLATFORMS, userPlatform, userClient } from './platforms.js';
import type { AdminUser } from './types';

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function calendarDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export const number = (value: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value);
export const percent = (part: number, total: number) => total > 0 ? Math.round(part / total * 100) : 0;
export const email = (user: AdminUser) => user.auth?.email || user.profile.email || user.uid;
export const name = (user: AdminUser) => user.auth?.displayName || email(user).split('@')[0];
export function activeDay(activity: AdminUser['activity'][number]): boolean {
  return ['appActiveSec', 'speakingSec', 'sessionCount', 'vocabReviews', 'pronPhrases', 'shadowPhrases', 'xp', 'expressionsUsed', 'sentencesRepeated'].some(key => Number(activity[key as keyof typeof activity]) > 0)
    || activity.lessonDone === true || activity.testDone === true;
}
export function summarize(users: AdminUser[], days: number, today: string) {
  const start = shiftDay(today, 1 - days);
  const previousStart = shiftDay(start, -days);
  const series = Array.from({ length: days }, (_, i) => ({ date: shiftDay(start, i), active: 0, sessions: 0, speakingSec: 0, appActiveSec: 0, xp: 0 }));
  const byDay = new Map(series.map(day => [day.date, day]));
  let active = 0, previousActive = 0, previousSessions = 0, previousSpeakingSec = 0;
  let reviews = 0, pronunciation = 0, lessons = 0;
  for (const user of users) {
    let currentSeen = false, previousSeen = false;
    // Firestore has one activity document per date. Dedup protects imported legacy data.
    const activity = new Map(user.activity.filter(a => a.date).map(a => [a.date!, a]));
    for (const [date, a] of activity) {
      const point = byDay.get(date);
      if (point) {
        if (activeDay(a)) { point.active++; currentSeen = true; }
        point.sessions += a.sessionCount || 0;
        point.speakingSec += a.speakingSec || 0;
        point.appActiveSec += a.appActiveSec || 0;
        point.xp += a.xp || 0;
        reviews += a.vocabReviews || 0;
        pronunciation += (a.pronPhrases || 0) + (a.shadowPhrases || 0);
        lessons += a.lessonDone ? 1 : 0;
      } else if (date >= previousStart && date < start) {
        previousSeen ||= activeDay(a);
        previousSessions += a.sessionCount || 0;
        previousSpeakingSec += a.speakingSec || 0;
      }
    }
    if (currentSeen) active++;
    if (previousSeen) previousActive++;
  }
  return {
    series, active, previousActive, previousSessions, previousSpeakingSec, reviews, pronunciation, lessons,
    sessions: series.reduce((sum, day) => sum + day.sessions, 0),
    speakingSec: series.reduce((sum, day) => sum + day.speakingSec, 0),
    appActiveSec: series.reduce((sum, day) => sum + day.appActiveSec, 0),
    xp: series.reduce((sum, day) => sum + day.xp, 0),
    newUsers: users.filter(u => u.auth?.createdAt && calendarDay(new Date(u.auth.createdAt)) >= start && calendarDay(new Date(u.auth.createdAt)) <= today).length,
    errors: users.flatMap(u => u.errors).filter(e => e.at && calendarDay(new Date(e.at)) >= start && calendarDay(new Date(e.at)) <= today).sort((a, b) => b.at.localeCompare(a.at)),
  };
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Prevent spreadsheet formula execution, including formulas hidden behind whitespace.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function usersCsv(users: AdminUser[]): string {
  return '\uFEFF' + [
    ['UID', 'Email', 'Ultima platformă', 'Versiune aplicație', 'Sursa platformei', 'Țară', 'Pro activ', 'Cont', 'Email verificat', 'Nivel', 'Obiectiv', 'XP', 'Streak', 'Ultima activitate', 'Sesiuni (total)', 'Minute vorbite (total)', 'Greșeli', 'Vocabular'],
    ...users.map(u => [u.uid, email(u), PLATFORMS[userPlatform(u)], userClient(u).appVersion, userClient(u).source, userClient(u).country, u.commerce?.isPro == null ? '' : u.commerce.isPro ? 'Da' : 'Nu', u.auth ? u.auth.disabled ? 'Suspendat' : 'Activ' : 'Necunoscut', u.auth ? u.auth.emailVerified ? 'Da' : 'Nu' : '', u.profile.currentLevel, u.profile.mainObjective, u.profile.xp, u.profile.streak, u.profile.lastActiveDay, u.totals?.sessions, u.totals ? Math.round(u.totals.speakingSec / 60) : '', u.totals?.mistakes, u.totals?.vocab]),
  ].map(row => row.map(csvCell).join(',')).join('\r\n');
}
