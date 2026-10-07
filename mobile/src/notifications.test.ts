import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saveReminderPreferences: vi.fn(),
}));

vi.mock('expo', () => ({
  isRunningInExpoGo: () => true,
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

vi.mock('expo-notifications', () => {
  throw new Error('expo-notifications must not load in Expo Go on Android');
});

vi.mock('./microlearning/state', () => ({
  saveReminderPreferences: mocks.saveReminderPreferences,
}));

import {
  applyDailyLearningReminder,
  configureLearningNotifications,
  currentNotificationPermission,
  subscribeToLearningReminderOpen,
} from './notifications';

describe('learning notifications in Expo Go on Android', () => {
  it('keeps app startup usable without loading expo-notifications', async () => {
    await expect(configureLearningNotifications()).resolves.toBeUndefined();
    await expect(currentNotificationPermission()).resolves.toBe('unsupported');

    const onOpen = vi.fn();
    const unsubscribe = subscribeToLearningReminderOpen(onOpen);
    unsubscribe();
    expect(onOpen).not.toHaveBeenCalled();

    const preference = await applyDailyLearningReminder({ enabled: true, hour: 19, minute: 30 });
    expect(preference).toEqual({ enabled: false, hour: 19, minute: 30, permission: 'unsupported' });
    expect(mocks.saveReminderPreferences).toHaveBeenCalledWith(preference);
  });
});
