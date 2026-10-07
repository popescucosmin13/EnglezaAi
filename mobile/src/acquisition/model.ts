export const ACQUISITION_FLOW = 'short-v1';
export const ACQUISITION_EVENTS = [
  'first_open', 'objective_selected', 'level_selected', 'demo_view', 'demo_complete',
  'demo_skip', 'signup_view', 'signup_attempt', 'signup_error', 'sign_up',
  'email_verification_view', 'email_verified', 'lesson_started',
] as const;
export type AcquisitionEventName = typeof ACQUISITION_EVENTS[number];
export const ACQUISITION_ERRORS = [
  'invalid_email', 'weak_password', 'password_mismatch', 'terms_required', 'privacy_required',
  'email_in_use', 'network', 'too_many_requests', 'email_delivery', 'unknown',
] as const;
export type AcquisitionError = typeof ACQUISITION_ERRORS[number];
export interface AcquisitionEvent { name: AcquisitionEventName; code?: AcquisitionError }
export interface AcquisitionBucket {
  date: string; platform: 'android' | 'ios' | 'web';
  counts: Partial<Record<AcquisitionEventName, number>>;
  errors: Partial<Record<AcquisitionError, number>>;
}
export interface AcquisitionReport { from: string; to: string; flow: string; buckets: AcquisitionBucket[] }
export const AUTHENTICATED_ACQUISITION_EVENTS = ['sign_up', 'email_verification_view', 'email_verified', 'lesson_started'] as const;
export const acquisitionEventKey = (event: AcquisitionEvent) => event.name === 'signup_error' ? `${event.name}:${event.code || 'unknown'}` : event.name;
export function acquisitionErrorCode(error: unknown): AcquisitionError {
  const code = (error as { code?: string } | null)?.code;
  const codes: Record<string, AcquisitionError> = {
    'auth/invalid-email': 'invalid_email', 'auth/weak-password': 'weak_password',
    'auth/email-already-in-use': 'email_in_use', 'auth/network-request-failed': 'network',
    'auth/too-many-requests': 'too_many_requests', 'auth/email-delivery-failed': 'email_delivery',
  };
  return codes[code || ''] || 'unknown';
}
