import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { serverTimestamp } from 'firebase/firestore';

export function clientObservation() {
  return {
    lastPlatform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    lastSeenAt: serverTimestamp(), appVersion: Constants.nativeAppVersion || Constants.expoConfig?.version || '',
    appBuild: Constants.nativeBuildVersion || '', osVersion: String(Platform.Version || ''),
  };
}
