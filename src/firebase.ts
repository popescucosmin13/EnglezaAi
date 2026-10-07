// Inițializare Firebase (Auth + Firestore).
//
// Pachetul complet Firestore (~400KB min) include și utilitarele de lite. Importăm granulat
// DOAR ce folosim efectiv, ca Rollup să taie restul prin tree-shaking. `firebase-admin` nu
// trebuie să apară niciodată aici — cheia privată trăiește exclusiv în funcțiile /api.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Câmpurile opționale (scenarioId, report, levelEstimate...) pot fi undefined — Firestore le refuză altfel.
// Persistență offline (PWA): datele citite rămân în IndexedDB, iar scrierile din offline se sincronizează la reconectare.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
