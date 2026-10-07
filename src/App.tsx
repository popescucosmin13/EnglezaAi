import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode, type UIEvent as ReactUIEvent } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import type { Profile } from './types';
import { getProfile, getSessions, bumpActivity } from './db/db';
import { loadRemoteSettings } from './settings';
import { on } from './events';
import { reportError } from './logic/error-tracking';
import { useAuth } from './auth/AuthContext';
import Login from './pages/Login';
import Landing from './pages/Landing';
import VerifyEmail from './pages/VerifyEmail';
import Onboarding from './pages/Onboarding';
import { Icon, type IconName } from './components/Icon';
import { startSmartReminderScheduler } from './notifications';
import { useAccess } from './access/AccessContext';
import ProFeatureGate from './components/ProFeatureGate';

// Doar Login/Onboarding se încarcă imediat (primul ecran posibil); restul paginilor sunt
// în spatele autentificării, deci pot veni la cerere — bundle-ul inițial rămâne mic.
const LevelTest = lazy(() => import('./pages/LevelTest'));
const Home = lazy(() => import('./pages/Home'));
const Talk = lazy(() => import('./pages/Talk'));
const SpeakingLab = lazy(() => import('./pages/SpeakingLab'));
const DailySession = lazy(() => import('./pages/DailySession'));
const QuickSession = lazy(() => import('./pages/QuickSession'));
const Microlearning = lazy(() => import('./pages/Microlearning'));
const ForYou = lazy(() => import('./pages/ForYou'));
const VoiceChallenge = lazy(() => import('./pages/VoiceChallenge'));
const DailyStory = lazy(() => import('./pages/DailyStory'));
const Practice = lazy(() => import('./pages/Practice'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const TutorSessionPreview = lazy(() => import('./pages/TutorSessionPreview'));

function RouteFallback() {
  return (
    <div className="page">
      <p><span className="spinner" /> Se încarcă…</p>
    </div>
  );
}

/** Ecran de încărcare la pornire — niciodată `return null`, care ar arăta fundalul gol
 *  (negru în dark mode) fără niciun indiciu că aplicația chiar pornește. */
function BootScreen() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <p><span className="spinner" /> Se pornește EnglezaAI…</p>
    </div>
  );
}

/** Fără boundary, orice excepție de randare demontează tot React-ul → ecran gol/negru pe telefon. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('Eroare de randare neprinsă:', error);
    reportError(error, 'react-boundary');
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="error-banner">
          A apărut o eroare neașteptată în aplicație: {String(this.state.error?.message ?? this.state.error)}
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>
            Înapoi acasă
          </button>
          <button onClick={() => window.location.reload()}>Reîncarcă aplicația</button>
        </div>
      </div>
    );
  }
}

/**
 * Măsoară timpul activ petrecut în aplicație și-l însumează pe ziua curentă (câmpul appActiveSec).
 * Numără doar cât ecranul e vizibil ȘI a existat interacțiune în ultimele 90s — un telefon lăsat
 * deschis pe masă nu umflă statistica. Scrie în lot la fiecare 30s (increment în Firestore) și la ascundere.
 */
function useAppActiveTime(enabled: boolean) {
  const pending = useRef(0);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const IDLE_MS = 90_000;
    const markActive = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity.current > IDLE_MS) return; // inactiv → nu numărăm
      pending.current += 5;
    }, 5000);

    const flush = () => {
      const delta = pending.current;
      if (delta <= 0) return;
      pending.current = 0;
      void bumpActivity('appActiveSec', delta).catch(() => {});
    };
    const flushTimer = setInterval(flush, 30_000);
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      clearInterval(tick);
      clearInterval(flushTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      events.forEach((e) => window.removeEventListener(e, markActive));
      flush();
    };
  }, [enabled]);
}

const NAV: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'home', label: 'Acasă' },
  { to: '/talk', icon: 'mic', label: 'Vorbește' },
  { to: '/for-you', icon: 'sparkles', label: 'For You' },
  { to: '/practice', icon: 'puzzle', label: 'Practică' },
  { to: '/progress', icon: 'trending', label: 'Progres' },
  { to: '/settings', icon: 'settings', label: 'Setări' },
];

export default function App() {
  const location = useLocation();
  const { user, loading, emailVerified } = useAuth();
  const access = useAccess();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState('');
  const [hasReportBadge, setHasReportBadge] = useState(false);
  const [navigationCompact, setNavigationCompact] = useState(false);

  const handleAppScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.scrollHeight <= target.clientHeight + 1) return;
    if (target.scrollTop > 32) setNavigationCompact(true);
    else if (target.scrollTop < 12) setNavigationCompact(false);
  };

  // cronometrul de timp activ în aplicație — pornește după autentificare + onboarding
  useAppActiveTime(Boolean(user) && emailVerified && Boolean(profile?.onboarded));

  useEffect(() => {
    if (!user || !emailVerified || !profile?.onboarded) return;
    return startSmartReminderScheduler();
  }, [emailVerified, user, profile?.onboarded]);

  // configul global (modele AI setate din Admin Center) se încarcă înaintea profilului
  const reload = () => {
    setLoadError('');
    return loadRemoteSettings()
      // Login/relogin trebuie să confirme starea de onboarding de pe server, nu dintr-un
      // snapshot local rămas de la sesiunea precedentă.
      .then(() => getProfile({ forceServer: true }))
      .then(setProfile)
      .catch((e) => {
        // profilul nu a putut fi confirmat (server inaccesibil) — mai bine un ecran de reîncercare
        // decât să tratăm un cont vechi drept nou (onboarding + dashboard gol)
        console.warn('Încărcarea profilului a eșuat:', e);
        setLoadError(String(e?.message ?? e));
      });
  };
  useEffect(() => {
    if (user && emailVerified) reload();
    else { setProfile(null); setLoadError(''); }
  }, [emailVerified, user]);

  const devForYouPreview = import.meta.env.DEV && window.location.hash.startsWith('#/for-you?preview=1');
  const devHomePreview = import.meta.env.DEV && window.location.hash.includes('homePreview=1');
  const devTutorPreview = import.meta.env.DEV && (window.location.hash.includes('tutorPreview=1') || window.location.search.includes('tutorPreview=1'));
  const devTalkPreview = import.meta.env.DEV && (window.location.hash.includes('talkPreview=1') || window.location.search.includes('talkPreview=1'));
  const devPracticePreview = import.meta.env.DEV && (window.location.hash.includes('practicePreview=1') || window.location.search.includes('practicePreview=1'));
  const devAdminPreview = import.meta.env.DEV && location.pathname === '/admin' && new URLSearchParams(location.search).get('adminPreview') === '1';

  // punct de notificare pe tab-ul „Progres" cât timp există un raport gata, dar nevăzut
  useEffect(() => {
    if (!user) return;
    const check = () => {
      getSessions()
        .then((sessions) => setHasReportBadge(sessions.some((s) => s.reportStatus === 'ready' && !s.reportSeen)))
        .catch(() => {});
    };
    check();
    // re-verificăm și când un raport apare (report-ready) și când e marcat citit (report-seen),
    // altfel bulina roșie rămâne aprinsă până la reîncărcarea aplicației, deși ai citit raportul.
    const offReady = on('engleza-report-ready', check);
    const offSeen = on('engleza-report-seen', check);
    return () => { offReady(); offSeen(); };
  }, [user]);

  if (devForYouPreview && !user) {
    return (
      <div className="app">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}><ForYou /></Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  if (devHomePreview) {
    return (
      <div className={`app has-navigation${navigationCompact ? ' navigation-compact' : ''}`} onScrollCapture={handleAppScroll}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}><Home preview /></Suspense>
        </ErrorBoundary>
        <BottomNav hasReportBadge={false} isPro compact={navigationCompact} onNavigate={() => setNavigationCompact(false)} />
      </div>
    );
  }

  if (devTutorPreview) {
    return (
      <div className="app has-navigation">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}><TutorSessionPreview /></Suspense>
        </ErrorBoundary>
        <BottomNav hasReportBadge={false} isPro />
      </div>
    );
  }

  if (devTalkPreview) {
    return (
      <div className={`app has-navigation talk-preview-dark${navigationCompact ? ' navigation-compact' : ''}`} onScrollCapture={handleAppScroll}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}><Talk preview /></Suspense>
        </ErrorBoundary>
        <BottomNav hasReportBadge={false} isPro compact={navigationCompact} onNavigate={() => setNavigationCompact(false)} />
      </div>
    );
  }

  if (devPracticePreview) {
    return (
      <div className={`app has-navigation talk-preview-dark${navigationCompact ? ' navigation-compact' : ''}`} onScrollCapture={handleAppScroll}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}><Practice preview /></Suspense>
        </ErrorBoundary>
        <BottomNav hasReportBadge={false} isPro compact={navigationCompact} onNavigate={() => setNavigationCompact(false)} />
      </div>
    );
  }

  if (devAdminPreview) return <div className="app admin-app"><ErrorBoundary><Suspense fallback={<RouteFallback />}><Admin /></Suspense></ErrorBoundary></div>;
  if (loading) return <BootScreen />;
  if (!user) {
    if (location.pathname === '/login') return <Login />;
    if (location.pathname === '/register' || location.pathname === '/signup') return <Navigate to="/descarca" replace />;
    return <Landing />;
  }
  if (!emailVerified) return <VerifyEmail />;
  // Admin has its own navigation and data loading, independent of the learning onboarding.
  if (location.pathname === '/admin') return <div className="app admin-app"><ErrorBoundary><Suspense fallback={<RouteFallback />}><Admin /></Suspense></ErrorBoundary></div>;
  if (loadError) {
    return (
      <div className="page">
        <div className="error-banner">
          Nu am putut încărca datele contului (probabil probleme de rețea): {loadError}
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={reload}>Reîncearcă</button>
        </div>
      </div>
    );
  }
  if (!profile) return <BootScreen />;

  if (!profile.onboarded) return <Onboarding onDone={reload} />;

  // După autentificare/înregistrare, ruta publică nu trebuie să lase aplicația pe un ecran gol.
  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/signup') return <Navigate to="/" replace />;
  if (location.pathname === '/descarca') return <Landing />;

  return (
    <div className={`app has-navigation${navigationCompact ? ' navigation-compact' : ''}`} onScrollCapture={handleAppScroll}>
      <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/test" element={profile.testDone && !access.isPro ? <ProFeatureGate feature="Refacerea testului de nivel"><LevelTest onDone={reload} /></ProFeatureGate> : <LevelTest onDone={reload} />} />
        <Route path="/session" element={<DailySession />} />
        <Route path="/quick" element={<ProFeatureGate feature="Sesiunea rapidă"><QuickSession /></ProFeatureGate>} />
        <Route path="/learn" element={<ProFeatureGate feature="Microlearningul adaptiv"><Microlearning /></ProFeatureGate>} />
        <Route path="/for-you" element={<ProFeatureGate feature="Feedul For You"><ForYou /></ProFeatureGate>} />
        <Route path="/boss" element={<ProFeatureGate feature="Boss Battle"><Microlearning defaultMode="boss" /></ProFeatureGate>} />
        <Route path="/voice-challenge" element={<ProFeatureGate feature="Provocarea de 60 de secunde"><VoiceChallenge /></ProFeatureGate>} />
        <Route path="/story" element={<ProFeatureGate feature="Povestea zilei"><DailyStory /></ProFeatureGate>} />
        <Route path="/talk" element={<ProFeatureGate feature="Conversațiile libere"><Talk /></ProFeatureGate>} />
        <Route path="/lab" element={<ProFeatureGate feature="Speaking Lab"><SpeakingLab /></ProFeatureGate>} />
        <Route path="/practice" element={<ProFeatureGate feature="Centrul de practică"><Practice /></ProFeatureGate>} />
        <Route path="/progress" element={<ProFeatureGate feature="Progresul complet"><Progress /></ProFeatureGate>} />
        <Route path="/settings" element={<Settings onProfileChange={reload} />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      <BottomNav hasReportBadge={hasReportBadge} isPro={access.isPro} compact={navigationCompact} onNavigate={() => setNavigationCompact(false)} />
    </div>
  );
}

function BottomNav({ hasReportBadge, isPro, compact = false, onNavigate }: { hasReportBadge: boolean; isPro: boolean; compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav className={`bottom-nav${compact ? ' is-compact' : ''}`} aria-label="Navigare principală">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? 'active' : '')}
          end={item.to === '/'}
          onClick={onNavigate}
        >
          <span className="icon">
            <Icon name={item.icon} size={21} strokeWidth={2.2} />
            {item.to === '/progress' && hasReportBadge && <span className="nav-dot" />}
          </span>
          <span className="nav-label">{item.label}</span>
          {!isPro && ['/talk', '/for-you', '/practice', '/progress'].includes(item.to) ? <small>PRO</small> : null}
        </NavLink>
      ))}
    </nav>
  );
}
