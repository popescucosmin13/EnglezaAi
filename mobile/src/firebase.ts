// Inițializare Firebase pentru React Native (Auth cu persistență AsyncStorage + Firestore).

import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-expect-error — exportul există doar în bundle-ul react-native al firebase/auth
// (Metro îl rezolvă prin condiția „react-native" din @firebase/auth); tipurile publicate sunt cele web.
import { getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);

// Pe web Firebase își configurează singur persistența browserului; pe dispozitiv
// folosim AsyncStorage pentru ca sesiunea să supraviețuiască închiderii aplicației.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// Câmpurile opționale (scenarioId, report, levelEstimate...) pot fi undefined — Firestore le refuză altfel.
// Fără persistentLocalCache (IndexedDB nu există în RN); long-polling auto pentru rețele care blochează streaming.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true,
});
