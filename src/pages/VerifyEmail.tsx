import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';

function verificationErrorMessage(error: any): string {
  const code = error?.code ?? '';
  if (code === 'auth/too-many-requests') return 'Ai solicitat prea multe mesaje. Așteaptă câteva minute și încearcă din nou.';
  if (code === 'auth/network-request-failed') return 'Nu avem conexiune la internet. Verifică rețeaua și încearcă din nou.';
  return 'Nu am putut verifica starea adresei. Încearcă din nou.';
}

export default function VerifyEmail() {
  const {
    user,
    verificationEmailSentAt,
    refreshEmailVerification,
    resendVerificationEmail,
    signOutUser,
  } = useAuth();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const secondsUntilResend = verificationEmailSentAt
    ? Math.max(0, 60 - Math.floor((now - verificationEmailSentAt) / 1000))
    : 0;

  useEffect(() => {
    if (!secondsUntilResend) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [secondsUntilResend]);

  const check = useCallback(async (announce = true) => {
    setChecking(true);
    setError('');
    try {
      const verified = await refreshEmailVerification();
      if (!verified && announce) setMessage('Adresa nu este confirmată încă. Deschide linkul din email, apoi încearcă din nou.');
    } catch (nextError) {
      if (announce) setError(verificationErrorMessage(nextError));
    } finally {
      setChecking(false);
    }
  }, [refreshEmailVerification]);

  useEffect(() => {
    const onFocus = () => void check(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);

  async function resend() {
    setResending(true);
    setError('');
    setMessage('');
    try {
      await resendVerificationEmail();
      setNow(Date.now());
      setMessage('Am trimis un email nou de verificare. Verifică și folderul Spam.');
    } catch (nextError) {
      setError(verificationErrorMessage(nextError));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="page auth-page verify-email-page">
      <section className="card auth-card verify-email-card">
        <div className="verify-email-icon"><Icon name="shieldCheck" size={34} /></div>
        <div className="auth-heading">
          <span className="auth-kicker">Încă un pas</span>
          <h1>Confirmă adresa de email</h1>
          <p>Am trimis un mesaj la</p>
          <strong className="verify-email-address">{user?.email}</strong>
        </div>

        <div className="verify-email-steps">
          <div><span>1</span><p>Deschide mesajul primit de la EnglezaAI.</p></div>
          <div><span>2</span><p>Apasă butonul „Confirmă adresa”.</p></div>
          <div><span>3</span><p>Revino aici și continuă în aplicație.</p></div>
        </div>

        {error && <div className="error-banner" role="alert"><Icon name="xCircle" size={16} /> {error}</div>}
        {message && <div className="info-banner" role="status"><Icon name="checkCircle" size={16} /> {message}</div>}

        <button type="button" className="btn-primary auth-submit" onClick={() => void check()} disabled={checking}>
          {checking ? 'Se verifică…' : 'Am confirmat emailul'}
        </button>
        <button type="button" onClick={() => void resend()} disabled={resending || secondsUntilResend > 0}>
          {resending ? 'Se retrimite…' : secondsUntilResend > 0 ? `Retrimite în ${secondsUntilResend}s` : 'Retrimite emailul'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => void signOutUser()}>Folosește altă adresă</button>

        <p className="verify-email-help">Nu găsești mesajul? Verifică folderul Spam sau retrimite-l după un minut.</p>
      </section>
    </main>
  );
}
