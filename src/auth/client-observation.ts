import { serverTimestamp } from 'firebase/firestore';

export function clientObservation() {
  return { lastPlatform: 'web', lastSeenAt: serverTimestamp(), appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '', appBuild: '', osVersion: '' };
}
