import { todayStr } from './db/db';
import { getDueOverview, getReminderPreferences, saveReminderPreferences } from './microlearning/state';
import type { DueOverview, ReminderPreferences } from './microlearning/types';

const LAST_SHOWN_KEY = 'engleza-smart-reminder-last-shown';

export function notificationSupport(): { supported: boolean; reason: string } {
  if (!('Notification' in window)) return { supported: false, reason: 'Browserul nu oferă notificări.' };
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'Service worker indisponibil.' };
  if (!window.isSecureContext) return { supported: false, reason: 'Notificările necesită HTTPS sau localhost.' };
  return { supported: true, reason: '' };
}

export async function requestReminderPermission(): Promise<NotificationPermission> {
  const support = notificationSupport();
  if (!support.supported) throw new Error(support.reason);
  return Notification.requestPermission();
}

function reminderMessage(due: DueOverview): { title: string; body: string } {
  if (due.mistakes > 0) {
    return {
      title: `${due.mistakes} ${due.mistakes === 1 ? 'greșeală revine' : 'greșeli revin'} azi`,
      body: `Repară-le împreună cu celelalte elemente în aproximativ ${Math.max(1, Math.ceil(due.estimatedSeconds / 60))} minute.`,
    };
  }
  if (due.total > 0) {
    return {
      title: `${due.total} ${due.total === 1 ? 'expresie este' : 'expresii sunt'} pe cale să fie uitate`,
      body: `Salvează-le în aproximativ ${Math.max(1, Math.ceil(due.estimatedSeconds / 60))} minute.`,
    };
  }
  return { title: 'Engleza ta este la zi', body: 'Ai 3 minute? Învață o expresie nouă și folosește-o imediat.' };
}

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.ready;
  if (!registration.active) throw new Error('Service worker-ul nu este încă activ. Reîncarcă aplicația și încearcă din nou.');
  return registration;
}

export async function syncReminderWithWorker(preferences: ReminderPreferences, due: DueOverview): Promise<void> {
  if (!notificationSupport().supported) return;
  const registration = await activeRegistration();
  const message = reminderMessage(due);
  registration.active?.postMessage({
    type: 'SCHEDULE_REMINDER',
    payload: { ...preferences, dueCount: due.total, message, updatedAt: new Date().toISOString() },
  });
  const periodicSync = (registration as ServiceWorkerRegistration & {
    periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> };
  }).periodicSync;
  if (preferences.enabled && periodicSync) {
    await periodicSync.register('engleza-smart-reminder', { minInterval: 12 * 60 * 60 * 1000 }).catch(() => {});
  }
}

export async function showReminderNow(due?: DueOverview): Promise<void> {
  const support = notificationSupport();
  if (!support.supported) throw new Error(support.reason);
  if (Notification.permission !== 'granted') throw new Error('Permisiunea pentru notificări nu este acordată.');
  const overview = due ?? await getDueOverview();
  const message = reminderMessage(overview);
  const registration = await activeRegistration();
  await registration.showNotification(message.title, {
    body: message.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'engleza-smart-reminder',
    renotify: false,
    data: { url: '/#/learn?mode=rescue' },
  } as NotificationOptions);
}

function millisecondsUntil(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

export async function configureReminder(preferences: ReminderPreferences): Promise<void> {
  const due = await getDueOverview();
  await saveReminderPreferences({ ...preferences, lastScheduledAt: new Date().toISOString() });
  await syncReminderWithWorker(preferences, due);
}

export function startSmartReminderScheduler(): () => void {
  let timeout = 0;
  let cancelled = false;
  const schedule = async () => {
    const preferences = await getReminderPreferences().catch(() => null);
    if (cancelled || !preferences?.enabled || preferences.permission !== 'granted') return;
    const due = await getDueOverview().catch(() => null);
    if (!due || cancelled) return;
    await syncReminderWithWorker(preferences, due).catch(() => {});

    const now = new Date();
    const afterPreferredTime = now.getHours() > preferences.hour
      || (now.getHours() === preferences.hour && now.getMinutes() >= preferences.minute);
    if (afterPreferredTime && localStorage.getItem(LAST_SHOWN_KEY) !== todayStr()) {
      await showReminderNow(due).then(() => localStorage.setItem(LAST_SHOWN_KEY, todayStr())).catch(() => {});
    }
    timeout = window.setTimeout(async () => {
      if (localStorage.getItem(LAST_SHOWN_KEY) !== todayStr()) {
        await showReminderNow(due).then(() => localStorage.setItem(LAST_SHOWN_KEY, todayStr())).catch(() => {});
      }
      if (!cancelled) void schedule();
    }, millisecondsUntil(preferences.hour, preferences.minute));
  };
  void schedule();
  return () => { cancelled = true; window.clearTimeout(timeout); };
}
