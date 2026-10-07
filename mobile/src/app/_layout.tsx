// Layout rădăcină: bootstrap (storage → config global → profil) + gating-ul din App.tsx web
// (loading → Login → ecran de reîncercare → Onboarding → aplicație).

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, View, Text, type AppStateStatus } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Profile } from '../types';
import { bumpActivity, getProfile, saveProfile } from '../db/db';
import { loadRemoteSettings } from '../settings';
import { initStorage } from '../storage';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { RevenueCatProvider } from '../revenuecat/RevenueCatContext';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import Login from '../pages/Login';
import VerifyEmail from '../pages/VerifyEmail';
import Onboarding from '../pages/Onboarding';
import {
  clearOnboardingDraft,
  hasCompletedOnboardingLocally,
  hasKnownAccount,
  hasOnboardingCompletionEvidence,
  loadOnboardingDraft,
  markKnownAccount,
  markOnboardingCompleted,
  markFirstLessonPending,
  profileFromOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from '../onboarding/draft';
import { Screen, Banner, Button, ButtonRow, Spinner } from '../ui';
import { usePalette } from '../theme';
import { configureLearningNotifications, subscribeToLearningReminderOpen } from '../notifications';
import SubscriptionGate from '../pages/SubscriptionGate';
import Home from '../pages/Home';
import TutorSessionPreview from '../pages/TutorSessionPreview';
import Talk from '../pages/Talk';
import Practice from '../pages/Practice';
import { beginAcquisition, flushAcquisition, trackAcquisition } from '../acquisition/client';
import SettingsRedesign from '../pages/SettingsRedesign';
import FirstLessonNavigation from '../onboarding/FirstLessonNavigation';

/** Fără boundary, orice excepție de randare demontează tot React-ul → ecran gol pe telefon. */
class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Eroare de randare neprinsă:', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Screen>
        <Banner kind="error">
          A apărut o eroare neașteptată în aplicație: {String(this.state.error?.message ?? this.state.error)}
        </Banner>
        <ButtonRow>
          <Button
            title="Înapoi acasă"
            variant="primary"
            onPress={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          />
        </ButtonRow>
      </Screen>
    );
  }
}

function NotificationNavigation() {
  useEffect(
    () => subscribeToLearningReminderOpen(() => router.push({ pathname: '/learn', params: { mode: 'rescue' } })),
    [],
  );
  return null;
}

function AppActiveTime({ children }: { children: ReactNode }) {
  const pending = useRef(0);
  const lastActivity = useRef(Date.now());
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const flush = () => {
      const seconds = pending.current;
      if (seconds <= 0) return;
      pending.current = 0;
      void bumpActivity('appActiveSec', seconds).catch(() => {});
    };
    const tick = setInterval(() => {
      if (appState.current === 'active' && Date.now() - lastActivity.current <= 90_000) pending.current += 5;
    }, 5_000);
    const flushTimer = setInterval(flush, 30_000);
    const subscription = AppState.addEventListener('change', (next) => {
      appState.current = next;
      if (next === 'active') lastActivity.current = Date.now();
      else flush();
    });
    return () => {
      clearInterval(tick);
      clearInterval(flushTimer);
      subscription.remove();
      flush();
    };
  }, []);

  return <View style={{ flex: 1 }} onTouchStart={() => { lastActivity.current = Date.now(); }}>{children}</View>;
}

function Gate() {
  const { user, loading, emailVerified } = useAuth();
  const access = useRevenueCat();
  const p = usePalette();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboardingDraft, setOnboardingDraft] = useState<OnboardingDraft | null>(() => loadOnboardingDraft());
  const [preferLogin, setPreferLogin] = useState(() => hasKnownAccount());
  const [loadError, setLoadError] = useState('');
  // remount-key: ErrorBoundary „Înapoi acasă" remontează tot arborele de navigare
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void flushAcquisition(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void flushAcquisition(); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  useEffect(() => { if (user && emailVerified) trackAcquisition('email_verified'); }, [user, emailVerified]);

  // configul global (modele AI setate din Admin Center) se încarcă înaintea profilului
  const reload = async () => {
    setLoadError('');
    try {
      await loadRemoteSettings();
      // Login/relogin trebuie să confirme starea de onboarding de pe server, nu dintr-un
      // snapshot local rămas de la sesiunea precedentă.
      const nextProfile = await getProfile({ forceServer: true });
      markKnownAccount();
      setPreferLogin(true);
      if (
        !nextProfile.onboarded
        && (hasCompletedOnboardingLocally(user!.uid) || hasOnboardingCompletionEvidence(nextProfile))
      ) {
        // Migrare pentru conturi existente: nu le retrimitem prin onboarding și reparăm
        // flag-ul autoritativ, ca următoarele instalări/update-uri să citească direct `true`.
        const repairedProfile = { ...nextProfile, onboarded: true };
        await saveProfile(repairedProfile);
        markOnboardingCompleted(user!.uid);
        clearOnboardingDraft();
        setOnboardingDraft(null);
        setProfile(repairedProfile);
        return;
      }
      if (!nextProfile.onboarded && onboardingDraft) {
        const completedProfile = profileFromOnboardingDraft(onboardingDraft, nextProfile);
        await saveProfile(completedProfile);
        markFirstLessonPending(user!.uid);
        markOnboardingCompleted(user!.uid);
        clearOnboardingDraft();
        setOnboardingDraft(null);
        setProfile(completedProfile);
        return;
      }
      if (nextProfile.onboarded && onboardingDraft) {
        // Utilizator existent: nu suprascriem niciodată profilul cu draftul anonim.
        clearOnboardingDraft();
        setOnboardingDraft(null);
      }
      if (nextProfile.onboarded) markOnboardingCompleted(user!.uid);
      setProfile(nextProfile);
    } catch (e: any) {
      // profilul nu a putut fi confirmat (server inaccesibil) — mai bine un ecran de reîncercare
      // decât să tratăm un cont vechi drept nou (onboarding + dashboard gol)
      console.warn('Încărcarea profilului a eșuat:', e);
      setLoadError(String(e?.message ?? e));
    }
  };
  useEffect(() => {
    if (user && emailVerified) reload();
    else {
      setProfile(null);
      setLoadError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailVerified, user]);

  function completePreAuthOnboarding(draft: OnboardingDraft) {
    saveOnboardingDraft(draft);
    setOnboardingDraft(draft);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Spinner size="large" />
      </View>
    );
  }
  if (!user) {
    if (onboardingDraft) return <Login initialMode="register" />;
    if (preferLogin) return <Login initialMode="login" onCreateAccount={() => setPreferLogin(false)} />;
    return <Onboarding saveToAccount={false} onDone={completePreAuthOnboarding} onExistingAccount={() => setPreferLogin(true)} />;
  }
  if (!emailVerified) return <VerifyEmail />;
  if (loadError) {
    return (
      <Screen>
        <Banner kind="error">Nu am putut încărca datele contului (probabil probleme de rețea): {loadError}</Banner>
        <ButtonRow>
          <Button title="Reîncearcă" variant="primary" onPress={reload} />
        </ButtonRow>
      </Screen>
    );
  }
  if (!profile || (profile.onboarded && access.loading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Spinner size="large" />
      </View>
    );
  }
  if (!profile.onboarded) return <Onboarding onDone={async () => {
    markFirstLessonPending(user.uid);
    await reload();
  }} />;
  return (
    <AppActiveTime>
      <ErrorBoundary key={resetKey} onReset={() => setResetKey((k) => k + 1)}>
        <NotificationNavigation />
        <FirstLessonNavigation uid={user.uid} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="test" />
          <Stack.Screen name="preferences" />
          <Stack.Screen name="session" />
          <Stack.Screen name="subscription" />
          <Stack.Screen name="quick" />
          <Stack.Screen name="learn" />
          <Stack.Screen name="boss" />
          <Stack.Screen name="story" />
          <Stack.Screen name="voice-challenge" />
          <Stack.Screen name="grammar" />
          <Stack.Screen name="speaking-lab" />
          <Stack.Screen name="admin" />
        </Stack>
      </ErrorBoundary>
    </AppActiveTime>
  );
}

export default function RootLayout() {
  const [storageReady, setStorageReady] = useState(false);
  const p = usePalette();
  const previewPaywall = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('paywallPreview');
  const previewHome = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('homePreview');
  const previewTutor = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('tutorPreview');
  const previewTalk = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('talkPreview');
  const previewPractice = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('practicePreview');
  const previewOnboarding = __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('onboardingPreview');
  const [previewRegistration, setPreviewRegistration] = useState(false);
  const previewSettings = __DEV__
    && Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('settingsPreview');

  useEffect(() => {
    initStorage()
      .catch((e) => console.warn('initStorage a eșuat (continuăm cu cache gol):', e))
      .finally(() => {
        if (!hasKnownAccount()) beginAcquisition();
        setStorageReady(true);
      });
  }, []);

  useEffect(() => {
    void configureLearningNotifications().catch((error) => console.warn('Notificările locale nu au putut fi configurate:', error));
  }, []);

  if (!storageReady) {
    return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <RevenueCatProvider>
          {previewOnboarding
            ? previewRegistration ? <Login initialMode="register" /> : <Onboarding saveToAccount={false} onDone={() => setPreviewRegistration(true)} />
            : previewSettings
            ? <SettingsRedesign preview />
            : previewPractice
            ? <Practice preview />
            : previewTalk
            ? <Talk preview />
            : previewTutor
            ? <TutorSessionPreview />
            : previewHome
              ? <Home preview />
              : previewPaywall
                ? <SubscriptionGate lockedFeature="Conversațiile libere" preview />
                : <Gate />}
        </RevenueCatProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
