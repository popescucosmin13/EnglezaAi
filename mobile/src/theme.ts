// Design tokens portate din styles/global.css (web) — indigo/violet, light + dark automat.

import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

export interface Palette {
  bg: string;
  bgSoft: string;
  card: string;
  border: string;
  borderStrong: string;
  ink: string;
  ink2: string;
  muted: string;
  primary: string;
  primaryDeep: string;
  primarySoft: string;
  violet: string;
  /** Culoare de rezervă pentru suprafețe; butoanele principale folosesc gradient nativ. */
  grad: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnInk: string;
  warnSoft: string;
  tipBg: string;
  navBg: string;
  white: string;
}

export const LIGHT: Palette = {
  bg: '#f5f6fb',
  bgSoft: '#eaecf7',
  card: '#ffffff',
  border: '#e4e6f2',
  borderStrong: '#cdd2f0',
  ink: '#1a1d33',
  ink2: '#525a78',
  muted: '#5d6480',
  primary: '#5b5bd6',
  primaryDeep: '#4338ca',
  primarySoft: '#eef0ff',
  violet: '#8b5cf6',
  grad: '#6366f1',
  success: '#0e9f5f',
  successSoft: '#e5f7ee',
  danger: '#e11d48',
  dangerSoft: '#fdecef',
  warn: '#d97706',
  warnInk: '#b45309',
  warnSoft: '#fdf3e0',
  tipBg: '#fff8dd',
  navBg: 'rgba(255, 255, 255, 0.96)',
  white: '#ffffff',
};

export const DARK: Palette = {
  bg: '#0f1118',
  bgSoft: '#1a1d2a',
  card: '#171a26',
  border: '#272b3d',
  borderStrong: '#3a4060',
  ink: '#eaecf8',
  ink2: '#a9afca',
  muted: '#8a90ac',
  primary: '#8285f4',
  primaryDeep: '#a5b4fc',
  primarySoft: 'rgba(99, 102, 241, 0.16)',
  violet: '#8b5cf6',
  grad: '#6165e8',
  success: '#34d399',
  successSoft: 'rgba(16, 185, 129, 0.14)',
  danger: '#fb7185',
  dangerSoft: 'rgba(244, 63, 94, 0.14)',
  warn: '#fbbf24',
  warnInk: '#fbbf24',
  warnSoft: 'rgba(245, 158, 11, 0.13)',
  tipBg: '#2b2712',
  navBg: 'rgba(23, 26, 38, 0.96)',
  white: '#ffffff',
};

export const RADIUS = 18;
export const RADIUS_SM = 13;

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK : LIGHT;
}

/** Stiluri dependente de temă, memoizate: const s = useThemedStyles(makeStyles). */
export function useThemedStyles<T>(factory: (p: Palette) => T): T {
  const p = usePalette();
  return useMemo(() => factory(p), [p, factory]);
}
