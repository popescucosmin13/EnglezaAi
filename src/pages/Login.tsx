// Existing-account sign-in and password recovery. New accounts belong to mobile.
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import StoreBadges from '../components/StoreBadges';
import './Login.css';

function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Adresă de email invalidă.',
    'auth/user-not-found': 'Nu există cont cu acest email.',
    'auth/wrong-password': 'Parolă greșită.',
    'auth/invalid-credential': 'Email sau parolă greșită.',
    'auth/too-many-requests': 'Prea multe încercări. Încearcă din nou mai târziu.',
    'auth/network-request-failed': 'Fără conexiune la internet. Verifică rețeaua.',
  };
  return messages[code] ?? 'Nu am putut finaliza operațiunea. Încearcă din nou.';
}

export default function Login() {
  const { signIn, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function changeMode() {
    setMode(mode === 'login' ? 'reset' : 'login');
    setMessage('');
    setIsError(false);
    setPassword('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage('');
    setIsError(false);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else {
        await resetPassword(email.trim());
        setMessage('Dacă există un cont cu această adresă, vei primi un email de resetare. Verifică și folderul Spam.');
      }
    } catch (error) {
      setIsError(true);
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page auth-page">
      <div className="auth-shell">
        <a className="auth-brand" href="#/" aria-label="Înapoi la pagina EnglezaAI">
          <span className="auth-brand-icon">
            <Icon name="audio" size={24} />
          </span>
          <span>EnglezaAI</span>
        </a>
        <section className="card auth-card">
          <div className="auth-heading">
            <span className="auth-kicker">{mode === 'reset' ? 'Recuperează accesul' : 'Bine ai revenit'}</span>
            <h1>{mode === 'login' ? 'Autentificare' : 'Resetare parolă'}</h1>
            <p>
              {mode === 'reset'
                ? 'Îți trimitem un link pentru alegerea unei parole noi.'
                : 'Intră cu contul existent și continuă de unde ai rămas.'}
            </p>
          </div>
          {message && (
            <div className={isError ? 'error-banner' : 'info-banner'} role={isError ? 'alert' : 'status'}>
              <Icon name={isError ? 'xCircle' : 'checkCircle'} size={16} /> {message}
            </div>
          )}
          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="nume@exemplu.ro"
                disabled={busy}
              />
            </label>
            {mode === 'login' && (
              <label className="field">
                <span>Parolă</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Parola ta"
                  disabled={busy}
                />
              </label>
            )}
            <button
              type="submit"
              className="btn-primary auth-submit"
              disabled={busy || !email.trim() || (mode === 'login' && password.length < 6)}
            >
              {busy ? 'Se procesează…' : mode === 'login' ? 'Intră în cont' : 'Trimite emailul'}
            </button>
          </form>
          <div className="auth-alternatives">
            <button type="button" className="btn-ghost" disabled={busy} onClick={changeMode}>
              {mode === 'login' ? 'Am uitat parola' : 'Înapoi la autentificare'}
            </button>
          </div>
          <div className="auth-mobile-download">
            <strong>Ești la prima conversație?</strong>
            <p>Descarcă EnglezaAI și creează-ți contul direct în aplicația pentru iPhone sau Android.</p>
            <StoreBadges />
          </div>
        </section>
      </div>
    </main>
  );
}
