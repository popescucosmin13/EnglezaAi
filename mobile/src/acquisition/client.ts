import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { auth } from '../firebase';
import { storage } from '../storage';
import { API_BASE } from '../api/api-base';
import { ACQUISITION_STORAGE_KEY, createAcquisitionTracker } from './tracker';
import { forgetAccountAcquisition } from './deletion';
import { AUTHENTICATED_ACQUISITION_EVENTS, type AcquisitionEventName, type AcquisitionError } from './model';

// Development previews exercise the UI without writing measurements to production.
const enabled = (typeof __DEV__ === 'undefined' || !__DEV__) && process.env.EXPO_PUBLIC_APP_ENV === 'production';
const tracker = createAcquisitionTracker(storage, async (state, events) => {
  if (!enabled) return true;
  const requiresAuth = events.some(event => (AUTHENTICATED_ACQUISITION_EVENTS as readonly string[]).includes(event.name));
  if (requiresAuth && (!auth.currentUser || auth.currentUser.uid !== state.ownerUid)) return false;
  const token = requiresAuth ? await auth.currentUser!.getIdToken() : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${API_BASE}/api/acquisition`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ journeyId: state.id, platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web', version: Constants.nativeAppVersion || Constants.expoConfig?.version || 'unknown', events }),
    });
    return response.ok;
  } finally { clearTimeout(timeout); }
});
let scheduled: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (scheduled) return;
  scheduled = setTimeout(() => { scheduled = null; void tracker.flush(); }, 500);
}
export function beginAcquisition() { if (enabled) { tracker.begin(); schedule(); } }
export function trackAcquisition(name: AcquisitionEventName, code?: AcquisitionError) {
  if (enabled) { tracker.track(name, code, auth.currentUser?.uid); schedule(); }
}
export function flushAcquisition() { return tracker.flush(); }
export async function forgetAcquisition() {
  const state = tracker.read();
  if (!auth.currentUser) return;
  const token = await auth.currentUser.getIdToken();
  await forgetAccountAcquisition(API_BASE, token, state?.ownerUid === auth.currentUser.uid ? state.id : undefined);
  if (state?.ownerUid === auth.currentUser.uid) storage.removeItem(ACQUISITION_STORAGE_KEY);
}
