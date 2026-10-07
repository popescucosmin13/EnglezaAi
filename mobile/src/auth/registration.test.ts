import { describe, expect, it } from 'vitest';
import { registrationValidationError } from './registration';

const valid = {
  password: 'parola-sigura',
  passwordConfirmation: 'parola-sigura',
  acceptedTerms: true,
  acceptedPrivacy: true,
};

describe('registrationValidationError', () => {
  it('acceptă o înregistrare completă', () => {
    expect(registrationValidationError(valid)).toBe('');
  });

  it('respinge parolele prea scurte', () => {
    expect(registrationValidationError({ ...valid, password: 'scurta', passwordConfirmation: 'scurta' }))
      .toContain('cel puțin 8');
  });

  it('respinge parolele care nu coincid', () => {
    expect(registrationValidationError({ ...valid, passwordConfirmation: 'alta-parola' }))
      .toBe('Parolele nu coincid.');
  });

  it('cere separat ambele acorduri', () => {
    expect(registrationValidationError({ ...valid, acceptedTerms: false }))
      .toContain('Termenii');
    expect(registrationValidationError({ ...valid, acceptedPrivacy: false }))
      .toContain('confidențialitate');
  });
});
