import { afterEach, describe, expect, it } from 'vitest';
import { hasEmailVerificationBypass } from './auth';

const previousBypassUids = process.env.EMAIL_VERIFICATION_BYPASS_UIDS;

afterEach(() => {
  if (previousBypassUids === undefined) delete process.env.EMAIL_VERIFICATION_BYPASS_UIDS;
  else process.env.EMAIL_VERIFICATION_BYPASS_UIDS = previousBypassUids;
});

describe('hasEmailVerificationBypass', () => {
  it('permite contul Google Play Review implicit', () => {
    delete process.env.EMAIL_VERIFICATION_BYPASS_UIDS;
    expect(hasEmailVerificationBypass('demo-review-uid')).toBe(true);
    expect(hasEmailVerificationBypass('alt-utilizator')).toBe(false);
  });

  it('acceptă o listă configurată în mediul serverului', () => {
    process.env.EMAIL_VERIFICATION_BYPASS_UIDS = 'review-1, review-2';
    expect(hasEmailVerificationBypass('review-2')).toBe(true);
    expect(hasEmailVerificationBypass('demo-review-uid')).toBe(false);
  });
});
