import { clientObservation } from './client-observation';
// Context de autentificare Firebase (email + parolă).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getIdToken,
  reauthenticateWithCredential,
  reload as reloadUser,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { setCurrentUid } from './uid';
import { wipeAll } from '../db/db';
import { hasEmailVerificationBypass } from './email-verification';
import { API_BASE } from '../api/api-base';
import { forgetAccountAcquisition } from '../acquisition/deletion';

async function requestAuthEmail(action: 'verify-email' | 'password-reset', email?: string): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (action === 'verify-email') {
    const current = auth.currentUser;
    if (!current) throw new Error('Nu există un cont autentificat.');
    headers.set('Authorization', `Bearer ${await current.getIdToken()}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/auth-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...(email ? { email } : {}) }),
    });
  } catch {
    const error = new Error('Fără conexiune la serviciul de email.') as Error & { code?: string };
    error.code = 'auth/network-request-failed';
    throw error;
  }
  if (response.ok) return;
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  const error = new Error(payload?.error || 'Emailul nu a putut fi trimis.') as Error & { code?: string };
  if (response.status === 429) error.code = 'auth/too-many-requests';
  throw error;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  verificationEmailSentAt: number | null;
  signIn: (email: string, password: string) => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  resendVerificationEmail: () => Promise<void>;
  signOutUser: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationEmailSentAt, setVerificationEmailSentAt] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      const hasVerificationAccess = u?.emailVerified === true || hasEmailVerificationBypass(u?.uid);
      setCurrentUid(u ? u.uid : null);
      setUser(u);
      setEmailVerified(hasVerificationAccess);
      if (!u) setVerificationEmailSentAt(null);
      setLoading(false);
      // emailul intră în profil ca Admin Center să poată identifica utilizatorii
      // numai după verificare, ca un cont cu adresă inventată să nu poată inițializa profilul.
      if (u?.email && hasVerificationAccess) {
        void setDoc(doc(db, 'users', u.uid), { email: u.email, ...clientObservation() }, { merge: true }).catch(() => { /* neblocant */ });
      }
    });
    return unsub;
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    emailVerified,
    verificationEmailSentAt,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    refreshEmailVerification: async () => {
      const current = auth.currentUser;
      if (!current) return false;
      await reloadUser(current);
      const verified = current.emailVerified === true || hasEmailVerificationBypass(current.uid);
      if (verified) {
        // Forțăm un token nou, astfel încât regulile Firestore și API-ul să vadă
        // imediat claim-ul email_verified, fără relogare.
        await getIdToken(current, true);
        if (current.email) {
          void setDoc(doc(db, 'users', current.uid), { email: current.email, ...clientObservation() }, { merge: true }).catch(() => {});
        }
      }
      setEmailVerified(verified);
      return verified;
    },
    resendVerificationEmail: async () => {
      const current = auth.currentUser;
      if (!current) throw new Error('Nu există un cont autentificat.');
      await reloadUser(current);
      if (current.emailVerified || hasEmailVerificationBypass(current.uid)) {
        await getIdToken(current, true);
        setEmailVerified(true);
        return;
      }
      await requestAuthEmail('verify-email');
      setVerificationEmailSentAt(Date.now());
    },
    signOutUser: async () => {
      await fbSignOut(auth);
    },
    deleteAccount: async (password) => {
      const current = auth.currentUser;
      if (!current?.email) throw new Error('Nu există un cont autentificat cu email.');
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
      await forgetAccountAcquisition(API_BASE, await current.getIdToken());
      // Ștergem mai întâi datele protejate de regulile Firestore, apoi contul Auth.
      // Reautentificarea de mai sus previne situația în care datele dispar, dar Auth refuză ștergerea.
      await wipeAll();
      await deleteUser(current);
    },
    resetPassword: async (email) => {
      await requestAuthEmail('password-reset', email);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth trebuie folosit în interiorul AuthProvider');
  return ctx;
}
