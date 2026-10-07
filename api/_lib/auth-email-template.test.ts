import { describe, expect, it } from 'vitest';
import { authEmailTemplate, brandedActionUrl } from './auth-email-template';

describe('brandedActionUrl', () => {
  it('păstrează numai parametrii Firebase necesari și folosește domeniul aplicației', () => {
    const result = new URL(brandedActionUrl(
      'https://demo.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=secret&apiKey=public&ignored=value',
      'https://engleza.example',
    ));
    expect(result.origin).toBe('https://engleza.example');
    expect(result.pathname).toBe('/auth-action');
    expect(result.searchParams.get('mode')).toBe('verifyEmail');
    expect(result.searchParams.get('oobCode')).toBe('secret');
    expect(result.searchParams.get('apiKey')).toBe('public');
    expect(result.searchParams.get('lang')).toBe('ro');
    expect(result.searchParams.has('ignored')).toBe(false);
  });

  it('respinge un link Firebase incomplet', () => {
    expect(() => brandedActionUrl('https://demo.firebaseapp.com/action?mode=verifyEmail', 'https://engleza.example'))
      .toThrow(/incomplet/);
  });
});

describe('authEmailTemplate', () => {
  it('include variante HTML și text și escapează URL-ul', () => {
    const template = authEmailTemplate('verify-email', 'https://example.com/action?a=1&b=2');
    expect(template.subject).toContain('Confirmă');
    expect(template.text).toContain('https://example.com/action?a=1&b=2');
    expect(template.html).toContain('a=1&amp;b=2');
    expect(template.html).not.toContain('a=1&b=2');
  });

  it('folosește mesajul de resetare fără a pretinde că parola a fost deja schimbată', () => {
    const template = authEmailTemplate('password-reset', 'https://example.com/action');
    expect(template.subject).toContain('parolă nouă');
    expect(template.text).toContain('Parola actuală rămâne neschimbată');
  });
});
