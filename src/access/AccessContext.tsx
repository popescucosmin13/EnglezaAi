import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getServerAccessInfo, type ServerAccessInfo } from '../api/backend';
import { useAuth } from '../auth/AuthContext';

interface AccessContextValue {
  loading: boolean;
  error: string;
  info: ServerAccessInfo | null;
  plan: ServerAccessInfo['plan'];
  isPro: boolean;
  refresh: () => Promise<void>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, emailVerified } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState<ServerAccessInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !emailVerified) {
      setInfo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setInfo(await getServerAccessInfo());
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setLoading(false);
    }
  }, [emailVerified, user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!user || !emailVerified) return;
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [emailVerified, refresh, user]);

  const value = useMemo<AccessContextValue>(() => ({
    loading,
    error,
    info,
    plan: info?.plan ?? 'free',
    isPro: info?.isPro === true,
    refresh,
  }), [error, info, loading, refresh]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error('useAccess trebuie folosit în interiorul AccessProvider.');
  return context;
}
