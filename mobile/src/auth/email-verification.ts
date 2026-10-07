// Cont tehnic reutilizabil oferit exclusiv echipelor App Store / Google Play Review.
// UID-ul nu acordă drepturi de administrator și nu trebuie înlocuit cu o verificare după email.
export const EMAIL_VERIFICATION_BYPASS_UIDS = [
  'demo-review-uid',
] as const;

export function hasEmailVerificationBypass(uid: string | null | undefined): boolean {
  return Boolean(uid && (EMAIL_VERIFICATION_BYPASS_UIDS as readonly string[]).includes(uid));
}
