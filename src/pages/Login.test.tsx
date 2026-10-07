import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signIn: vi.fn(), resetPassword: vi.fn() }) }));

import Login from './Login';
import { APP_STORES } from '../config/stores';

describe('Web sign-in after moving registration to mobile', () => {
  it('keeps existing-account sign-in and recovery available, without a registration form', () => {
    const html = renderToStaticMarkup(<Login />);
    expect(html).toContain('Intră în cont');
    expect(html).toContain('Am uitat parola');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).not.toContain('new-password');
    expect(html).not.toContain('Confirmă parola');
    expect(html).not.toContain('#/register');
    expect(html.match(/<form/g)).toHaveLength(1);
  });

  it('gives new visitors a direct download link for each mobile platform', () => {
    const html = renderToStaticMarkup(<Login />);
    expect(html).toContain(APP_STORES.apple);
    expect(html).toContain(APP_STORES.google.replaceAll('&', '&amp;'));
    expect(html).toContain('creează-ți contul direct în aplicația');
  });
});
