import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type NavigationChromeValue = {
  compact: boolean;
  hidden: boolean;
  reportScroll: (offsetY: number) => void;
  reset: () => void;
  setHidden: (hidden: boolean) => void;
};

const defaultValue: NavigationChromeValue = {
  compact: false,
  hidden: false,
  reportScroll: () => {},
  reset: () => {},
  setHidden: () => {},
};

const NavigationChromeContext = createContext<NavigationChromeValue>(defaultValue);

export function NavigationChromeProvider({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState(false);
  const compactRef = useRef(false);

  const setCompactMode = useCallback((next: boolean) => {
    if (compactRef.current === next) return;
    compactRef.current = next;
    setCompact(next);
  }, []);

  const reportScroll = useCallback((offsetY: number) => {
    if (offsetY > 32) setCompactMode(true);
    else if (offsetY < 12) setCompactMode(false);
  }, [setCompactMode]);

  const reset = useCallback(() => setCompactMode(false), [setCompactMode]);
  const value = useMemo(() => ({ compact, hidden, reportScroll, reset, setHidden }), [compact, hidden, reportScroll, reset]);

  return <NavigationChromeContext.Provider value={value}>{children}</NavigationChromeContext.Provider>;
}

export function useNavigationChrome() {
  return useContext(NavigationChromeContext);
}
