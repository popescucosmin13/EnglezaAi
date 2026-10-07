export const TERMS_VERSION = '2026-08-17';
export const PRIVACY_VERSION = '2026-09-28';
export const MIN_PASSWORD_LENGTH = 8;

export interface RegistrationConsent {
  termsVersion: string;
  privacyVersion: string;
}

export function registrationValidationError({
  password,
  passwordConfirmation,
  acceptedTerms,
  acceptedPrivacy,
}: {
  password: string;
  passwordConfirmation: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
}): string {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
  }
  if (password !== passwordConfirmation) return 'Parolele nu coincid.';
  if (!acceptedTerms) return 'Trebuie să accepți Termenii de utilizare.';
  if (!acceptedPrivacy) return 'Trebuie să confirmi Politica de confidențialitate.';
  return '';
}
