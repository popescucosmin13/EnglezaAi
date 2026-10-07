import { FormEvent, useEffect, useMemo, useState } from 'react';
import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase';
import { MIN_PASSWORD_LENGTH } from '../auth/registration';

type ActionMode = 'verifyEmail' | 'resetPassword' | 'recoverEmail';
type ViewState = 'loading' | 'reset-form' | 'success' | 'error';

function friendlyError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'auth/expired-action-code') return 'Linkul a expirat. Solicită un email nou din aplicație.';
  if (code === 'auth/invalid-action-code') return 'Linkul nu mai este valid sau a fost deja folosit.';
  if (code === 'auth/weak-password') return `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
  return 'Nu am putut finaliza acțiunea. Solicită un link nou și încearcă din nou.';
}

export default function AuthAction() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const mode = params.get('mode') as ActionMode | null;
  const code = params.get('oobCode') || '';
  const [view, setView] = useState<ViewState>('loading');
  const [accountEmail, setAccountEmail] = useState('');
  const [message, setMessage] = useState('Verificăm linkul securizat…');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function processAction() {
      if (!code || !mode || !['verifyEmail', 'resetPassword', 'recoverEmail'].includes(mode)) {
        setMessage('Linkul este incomplet. Solicită un email nou din aplicație.');
        setView('error');
        return;
      }
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, code);
          if (!active) return;
          setMessage('Adresa ta de email a fost confirmată. Poți reveni în EnglezaAI.');
          setView('success');
          return;
        }
        if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, code);
          if (!active) return;
          setAccountEmail(email);
          setMessage('Alege o parolă nouă pentru contul tău.');
          setView('reset-form');
          return;
        }

        const info = await checkActionCode(auth, code);
        await applyActionCode(auth, code);
        if (!active) return;
        setAccountEmail(info.data.email || '');
        setMessage('Adresa de email a contului a fost recuperată. Îți recomandăm să resetezi și parola.');
        setView('success');
      } catch (error) {
        if (!active) return;
        setMessage(friendlyError(error));
        setView('error');
      }
    }
    void processAction();
    return () => { active = false; };
  }, [code, mode]);

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`);
      return;
    }
    if (password !== confirmation) {
      setMessage('Parolele nu coincid.');
      return;
    }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, code, password);
      setPassword('');
      setConfirmation('');
      setMessage('Parola a fost schimbată. Te poți autentifica acum în EnglezaAI.');
      setView('success');
    } catch (error) {
      setMessage(friendlyError(error));
      setView('error');
    } finally {
      setSaving(false);
    }
  }

  const title = view === 'loading'
    ? 'Un moment…'
    : view === 'reset-form'
      ? 'Parola ta nouă'
      : view === 'success'
        ? 'Totul este gata.'
        : 'Linkul nu a funcționat.';

  return (
    <main className="auth-action-page">
      <section className="auth-action-card" aria-live="polite">
        <a className="auth-action-brand" href="/" aria-label="EnglezaAI">
          <span className="auth-action-logo">✦</span>
          <span>EnglezaAI</span>
        </a>

        <div className={`auth-action-status is-${view}`}>
          {view === 'loading' ? <span className="spinner" /> : view === 'success' ? '✓' : view === 'error' ? '!' : '•••'}
        </div>
        <p className="auth-action-kicker">Contul tău EnglezaAI</p>
        <h1>{title}</h1>
        <p className="auth-action-message">{message}</p>
        {accountEmail ? <p className="auth-action-email">{accountEmail}</p> : null}

        {view === 'reset-form' ? (
          <form className="auth-action-form" onSubmit={savePassword}>
            <label>
              <span>Parolă nouă</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`Minimum ${MIN_PASSWORD_LENGTH} caractere`}
                required
              />
            </label>
            <label>
              <span>Confirmă parola</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Scrie parola din nou"
                required
              />
            </label>
            <button type="submit" disabled={saving}>{saving ? 'Se salvează…' : 'Salvează parola'}</button>
          </form>
        ) : null}

        {view === 'success' || view === 'error' ? (
          <div className="auth-action-buttons">
            <a className="auth-action-primary" href="englezaai://">Deschide aplicația</a>
            <a className="auth-action-secondary" href="/#/login">Continuă în browser</a>
          </div>
        ) : null}

        <p className="auth-action-help">Ai nevoie de ajutor? Scrie-ne din pagina de suport EnglezaAI.</p>
      </section>
    </main>
  );
}
