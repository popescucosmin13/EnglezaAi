import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { NotificationPermissionsStatus, NotificationResponse } from 'expo-notifications';
import type { ReminderPreferences } from './microlearning/types';
import { saveReminderPreferences } from './microlearning/state';

const CHANNEL_ID = 'learning-reminders';
const REMINDER_SOURCE = 'englezaai-learning-reminder';
let handledResponseKey = '';
type NotificationsModule = typeof import('expo-notifications');
let notificationsPromise: Promise<NotificationsModule> | null = null;

function canLoadNotifications(): boolean {
  // SDK 53+ throws while importing expo-notifications in Expo Go on Android,
  // even when the app only uses local notifications. Development/store builds
  // include the native module and keep the complete reminder behavior.
  return Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());
}

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (!canLoadNotifications()) return null;
  notificationsPromise ??= import('expo-notifications');
  return notificationsPromise;
}

function permissionValue(status: NotificationPermissionsStatus): ReminderPreferences['permission'] {
  if (status.granted || status.status === 'granted') return 'granted';
  if (status.status === 'denied') return 'denied';
  return 'default';
}

export async function configureLearningNotifications(): Promise<void> {
  const notifications = await loadNotifications();
  if (!notifications) return;
  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Rutina de învățare',
      description: 'Reminderul zilnic pentru lecții și recapitulări EnglezaAI.',
      importance: notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      vibrationPattern: [0, 180, 100, 180],
      lightColor: '#5B5BD6',
    });
  }
}

export async function currentNotificationPermission(): Promise<ReminderPreferences['permission']> {
  const notifications = await loadNotifications();
  if (!notifications) return 'unsupported';
  return permissionValue(await notifications.getPermissionsAsync());
}

async function cancelLearningReminders(notifications: NotificationsModule): Promise<void> {
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.source === REMINDER_SOURCE)
      .map((item) => notifications.cancelScheduledNotificationAsync(item.identifier)),
  );
}

export async function applyDailyLearningReminder(
  requested: Pick<ReminderPreferences, 'enabled' | 'hour' | 'minute'>,
): Promise<ReminderPreferences> {
  const notifications = await loadNotifications();
  if (!notifications) {
    const unsupported: ReminderPreferences = { ...requested, enabled: false, permission: 'unsupported' };
    await saveReminderPreferences(unsupported);
    return unsupported;
  }

  await configureLearningNotifications();
  await cancelLearningReminders(notifications);

  let status = await notifications.getPermissionsAsync();
  if (requested.enabled && !status.granted && status.canAskAgain) {
    status = await notifications.requestPermissionsAsync();
  }
  const permission = permissionValue(status);
  const enabled = requested.enabled && permission === 'granted';

  if (enabled) {
    await notifications.scheduleNotificationAsync({
      content: {
        title: '3 minute pentru engleza ta ✨',
        body: 'Lecția și recapitulările de azi sunt pregătite. Continuă de unde ai rămas.',
        data: { source: REMINDER_SOURCE, route: '/learn', mode: 'rescue' },
        sound: 'default',
        color: '#5B5BD6',
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DAILY,
        hour: requested.hour,
        minute: requested.minute,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
  }

  const next: ReminderPreferences = {
    ...requested,
    enabled,
    permission,
    lastScheduledAt: enabled ? new Date().toISOString() : undefined,
  };
  await saveReminderPreferences(next);
  return next;
}

export function subscribeToLearningReminderOpen(onOpen: () => void): () => void {
  if (!canLoadNotifications()) return () => {};
  let active = true;
  let subscription: { remove(): void } | undefined;
  const handle = (response: NotificationResponse | null) => {
    if (!response) return;
    const request = response.notification.request;
    const responseKey = `${request.identifier}:${response.notification.date}`;
    if (request.content.data?.source !== REMINDER_SOURCE || responseKey === handledResponseKey) return;
    handledResponseKey = responseKey;
    onOpen();
  };
  void loadNotifications()
    .then((notifications) => {
      if (!active || !notifications) return;
      subscription = notifications.addNotificationResponseReceivedListener(handle);
      void notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    })
    .catch((error) => console.warn('Ascultarea notificărilor locale nu a putut fi pornită:', error));
  return () => {
    active = false;
    subscription?.remove();
  };
}
