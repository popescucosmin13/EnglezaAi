import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { trackAcquisition } from '../acquisition/client';
import { Icon } from '../components/Icon';
import { Banner, Button, Screen } from '../ui';
import { usePalette } from '../theme';

function verificationErrorMessage(error: any): string {
  const code = error?.code ?? '';
  if (code === 'auth/too-many-requests') return 'Ai solicitat prea multe mesaje. Așteaptă câteva minute și încearcă din nou.';
  if (code === 'auth/network-request-failed') return 'Nu avem conexiune la internet. Verifică rețeaua și încearcă din nou.';
  return 'Nu am putut verifica starea adresei. Încearcă din nou.';
}

export default function VerifyEmail() {
  const p = usePalette();
  const {
    user,
    verificationEmailSentAt,
    verificationEmailSending,
    verificationEmailError,
    refreshEmailVerification,
    resendVerificationEmail,
    signOutUser,
  } = useAuth();
  useEffect(() => { trackAcquisition('email_verification_view'); }, [user?.uid, verificationEmailSending]);
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
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
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check(false);
    });
    return () => subscription.remove();
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

  const steps = [
    'Deschide mesajul primit de la EnglezaAI.',
    'Apasă butonul „Confirmă adresa”.',
    'Revino aici și continuă în aplicație.',
  ];

  return (
    <Screen style={{ paddingTop: 38 }}>
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
        <View style={[styles.icon, { backgroundColor: p.primarySoft }]}>
          <Icon name="shieldCheck" size={34} color={p.primaryDeep} />
        </View>
        <Text style={[styles.kicker, { color: p.primaryDeep }]}>ÎNCĂ UN PAS</Text>
        <Text style={[styles.title, { color: p.ink }]}>Confirmă adresa de email</Text>
        <Text style={[styles.subtitle, { color: p.muted }]}>{verificationEmailSending ? 'Trimitem mesajul de confirmare la' : verificationEmailSentAt ? 'Am trimis un mesaj la' : 'Adresa pe care trebuie să o confirmi'}</Text>
        <Text style={[styles.email, { color: p.ink }]}>{user?.email}</Text>

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={[styles.stepNumber, { backgroundColor: p.primarySoft }]}>
                <Text style={{ color: p.primaryDeep, fontSize: 12, fontWeight: '800' }}>{index + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: p.ink2 }]}>{step}</Text>
            </View>
          ))}
        </View>

        {error ? <Banner kind="error" icon="xCircle">{error}</Banner> : null}
        {!error && verificationEmailError ? <Banner kind="error" icon="xCircle">{verificationEmailError}</Banner> : null}
        {message ? <Banner kind="info" icon="checkCircle">{message}</Banner> : null}

        <Button
          title={checking ? 'Se verifică…' : 'Am confirmat emailul'}
          variant="primary"
          onPress={() => void check()}
          busy={checking}
          style={styles.button}
        />
        <Button
          title={verificationEmailSending || resending ? 'Se trimite…' : secondsUntilResend > 0 ? `Retrimite în ${secondsUntilResend}s` : verificationEmailSentAt ? 'Retrimite emailul' : 'Trimite emailul'}
          onPress={() => void resend()}
          busy={resending || verificationEmailSending}
          disabled={secondsUntilResend > 0}
          style={styles.button}
        />
        <Button title="Folosește altă adresă" variant="ghost" onPress={() => void signOutUser()} style={styles.button} />
        <Text style={[styles.help, { color: p.muted }]}>Nu găsești mesajul? Verifică folderul Spam sau retrimite-l după un minut.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 430, width: '100%', alignSelf: 'center', borderWidth: 1, borderRadius: 24, padding: 22 },
  icon: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 15 },
  kicker: { textAlign: 'center', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { textAlign: 'center', fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6, marginTop: 3 },
  subtitle: { textAlign: 'center', fontSize: 14, marginTop: 7 },
  email: { textAlign: 'center', fontSize: 15, fontWeight: '700', marginTop: 4 },
  steps: { gap: 10, marginVertical: 22 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  button: { marginTop: 9 },
  help: { textAlign: 'center', fontSize: 12, lineHeight: 17, marginTop: 16 },
});
