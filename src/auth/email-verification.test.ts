import { describe, expect, it } from 'vitest';
import { hasEmailVerificationBypass } from './email-verification';

describe('hasEmailVerificationBypass', () => {
  it('permite numai contul dedicat review-ului magazinelor', () => {
    expect(hasEmailVerificationBypass('demo-review-uid')).toBe(true);
    expect(hasEmailVerificationBypass('alt-utilizator')).toBe(false);
    expect(hasEmailVerificationBypass(null)).toBe(false);
  });
});
