import type { DimensionValue } from 'react-native';

/**
 * Păstrează spațierea cerută de ecran, dar nu permite conținutului să intre
 * sub status bar, Dynamic Island sau notch. Valoarea implicită de 14 px este
 * aceeași spațiere folosită anterior pe dispozitivele fără inset superior.
 */
export function resolveScreenTopPadding(
  safeAreaTop: number,
  requestedPaddingTop?: DimensionValue
): number {
  const minimumSafePadding = Math.max(safeAreaTop, 8) + 6;
  return typeof requestedPaddingTop === 'number' && Number.isFinite(requestedPaddingTop)
    ? Math.max(minimumSafePadding, requestedPaddingTop)
    : minimumSafePadding;
}
