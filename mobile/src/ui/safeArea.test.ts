import { describe, expect, it } from 'vitest';
import { resolveScreenTopPadding } from './safeArea';

describe('resolveScreenTopPadding', () => {
  it('keeps Home and Login below an iPhone notch', () => {
    expect(resolveScreenTopPadding(47, 18)).toBe(53);
    expect(resolveScreenTopPadding(47, 34)).toBe(53);
  });

  it('preserves a larger spacing requested by an individual screen', () => {
    expect(resolveScreenTopPadding(47, 60)).toBe(60);
  });

  it('keeps the existing default on devices without a top inset', () => {
    expect(resolveScreenTopPadding(0)).toBe(14);
    expect(resolveScreenTopPadding(0, 34)).toBe(34);
  });
});
