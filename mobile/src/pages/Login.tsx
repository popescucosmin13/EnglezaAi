// Autentificare: login / înregistrare / resetare parolă (Firebase Auth).

import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { beginAcquisition, trackAcquisition } from '../acquisition/client';
import { acquisitionErrorCode } from '../acquisition/model';
import { useAuth } from '../auth/AuthContext';
import {
  MIN_PASSWORD_LENGTH,
  PRIVACY_VERSION,
  TERMS_VERSION,
  registrationValidationError,
} from '../auth/registration';
import { Icon } from '../components/Icon';
import { Screen, H1, Banner, Button, ButtonRow, Field } from '../ui';
import { usePalette } from '../theme';

const PUBLIC_WEB_BASE = 'http://localhost:3000';

function authErrorMessage(e: any): string {
  const code = e?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'Adresă de email invalidă.',
    'auth/user-not-found': 'Nu există cont cu acest email.',
    'auth/wrong-password': 'Parolă greșită.',
    'auth/invalid-credential': 'Email sau parolă greșită.',
    'auth/email-already-in-use': 'Există deja un cont cu acest email.',
    'auth/weak-password': `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`,
    'auth/too-many-requests': 'Prea multe încercări. Încearcă din nou mai târziu.',
    'auth/network-request-failed': 'Fără conexiune la internet. Verifică rețeaua.',
  };
  return map[code] ?? 'Nu am putut finaliza autentificarea. Încearcă din nou.';
}

type Mode = 'login' | 'register' | 'reset';

function ConsentRow({
  checked,
  onChange,
  prefix,
  linkLabel,
  url,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  prefix: string;
  linkLabel: string;
  url: string;
}) {
  const p = usePalette();
  return (
    <View style={styles.consentRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${prefix} ${linkLabel}`}
        onPress={() => onChange(!checked)}
        hitSlop={6}
        style={[
          styles.checkbox,
          { borderColor: checked ? p.primary : p.border, backgroundColor: checked ? p.primary : p.card },
        ]}
      >
        {checked ? <Icon name="check" size={14} color={p.white} strokeWidth={3} /> : null}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.consentText, { color: p.ink2 }]}>{prefix}</Text>
        <Text
          accessibilityRole="link"
          onPress={() => void Linking.openURL(url)}
          style={[styles.consentLink, { color: p.primaryDeep }]}
        >
          {linkLabel}
        </Text>
      </View>
    </View>
  );
}

export default function Login({ initialMode = 'login', onCreateAccount }: { initialMode?: 'login' | 'register'; onCreateAccount?: () => void }) {
  const { signIn, signUp, resetPassword } = useAuth();
  const p = usePalette();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const submitting = useRef(false);
  useEffect(() => { if (mode === 'register') { beginAcquisition(); trackAcquisition('signup_view'); } }, [mode]);

  const registrationError = registrationValidationError({
    password,
    passwordConfirmation,
    acceptedTerms,
    acceptedPrivacy,
  });

  function changeMode(nextMode: Mode) {
    if (nextMode === 'register' && onCreateAccount) { onCreateAccount(); return; }
    setMode(nextMode);
    setMsg('');
    setMsgError(false);
    setPassword('');
    setPasswordConfirmation('');
    setAcceptedTerms(false);
    setAcceptedPrivacy(false);
  }

  async function submit() {
    if (submitting.current) return;
    setMsg('');
    setMsgError(false);
    if (mode === 'register' && registrationError) {
      trackAcquisition('signup_error', password.length < MIN_PASSWORD_LENGTH ? 'weak_password' : password !== passwordConfirmation ? 'password_mismatch' : !acceptedTerms ? 'terms_required' : 'privacy_required');
      setMsgError(true);
      setMsg(registrationError);
      return;
    }

    submitting.current = true; setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else if (mode === 'register') {
        trackAcquisition('signup_attempt');
        await signUp(email.trim(), password, {
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        });
      } else {
        await resetPassword(email.trim());
        setMsg('Email de resetare trimis. Verifică-ți inboxul.');
      }
    } catch (error: any) {
      if (mode === 'register') trackAcquisition('signup_error', acquisitionErrorCode(error));
      setMsgError(true);
      setMsg(authErrorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const title = mode === 'login' ? 'Autentificare' : mode === 'register' ? 'Creează contul' : 'Resetare parolă';
  const subtitle = mode === 'register'
    ? 'Contul îți salvează progresul și îl sincronizează pe toate dispozitivele.'
    : mode === 'reset'
      ? 'Îți trimitem un link sigur pentru alegerea unei parole noi.'
      : 'Continuă de unde ai rămas în planul tău de engleză.';
  const submitDisabled = busy
    || !email.trim()
    || (mode !== 'reset' && !password);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen style={{ paddingTop: 24 }}>
      <View style={styles.shell}>
        <View style={styles.brand}>
          <View style={[styles.brandIcon, { backgroundColor: p.primary }]}>
            <Icon name="audio" size={23} color={p.white} />
          </View>
          <Text style={[styles.brandText, { color: p.ink }]}>EnglezaAI</Text>
        </View>

        <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
          {initialMode === 'register' && mode === 'register' ? (
            <Banner kind="info" icon="checkCircle">
              Planul tău este gata. Creează contul și începe prima lecție.
            </Banner>
          ) : null}

          <Text style={[styles.kicker, { color: p.primaryDeep }]}>
            {mode === 'register' ? 'ÎNCEPE PROGRESUL TĂU' : mode === 'reset' ? 'RECUPEREAZĂ ACCESUL' : 'BINE AI REVENIT'}
          </Text>
          <H1 style={styles.title}>{title}</H1>
          <Text style={[styles.subtitle, { color: p.muted }]}>{subtitle}</Text>

          {msg ? (
            <Banner kind={msgError ? 'error' : 'info'} icon={msgError ? 'xCircle' : 'checkCircle'}>
              {msg}
            </Banner>
          ) : null}

          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="nume@exemplu.ro"
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
          />
          {mode !== 'reset' ? (
            <Field
              label="Parolă"
              value={password}
              onChange={setPassword}
              placeholder={mode === 'register' ? `Minimum ${MIN_PASSWORD_LENGTH} caractere` : 'Parola ta'}
              secure
              autoComplete={mode === 'login' ? 'password' : 'new-password'}
            />
          ) : null}

          {mode === 'register' ? (
            <>
              <Field
                label="Confirmă parola"
                value={passwordConfirmation}
                onChange={setPasswordConfirmation}
                placeholder="Scrie din nou parola"
                secure
                autoComplete="new-password"
              />
              {passwordConfirmation ? (
                <View style={styles.passwordHint}>
                  <Icon
                    name={password === passwordConfirmation ? 'checkCircle' : 'xCircle'}
                    size={14}
                    color={password === passwordConfirmation ? p.success : p.danger}
                  />
                  <Text style={{ color: password === passwordConfirmation ? p.success : p.danger, fontSize: 12.5, fontWeight: '600' }}>
                    {password === passwordConfirmation ? 'Parolele coincid' : 'Parolele nu coincid'}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.consents, { backgroundColor: p.bgSoft, borderColor: p.border }]}>
                <ConsentRow
                  checked={acceptedTerms}
                  onChange={setAcceptedTerms}
                  prefix="Am citit și accept"
                  linkLabel="Termenii de utilizare"
                  url={`${PUBLIC_WEB_BASE}/terms.html`}
                />
                <ConsentRow
                  checked={acceptedPrivacy}
                  onChange={setAcceptedPrivacy}
                  prefix="Am citit și confirm"
                  linkLabel="Politica de confidențialitate"
                  url={`${PUBLIC_WEB_BASE}/privacy.html`}
                />
              </View>
            </>
          ) : null}

          <Button
            title={busy ? 'Se procesează…' : mode === 'login' ? 'Intră în cont' : mode === 'register' ? 'Creează contul' : 'Trimite emailul'}
            variant="primary"
            onPress={submit}
            disabled={submitDisabled}
            busy={busy}
            style={{ marginTop: 8 }}
          />
          <ButtonRow style={[styles.alternatives, { borderTopColor: p.border }]}>
            {mode !== 'login' ? <Button title="Am deja cont" variant="ghost" small onPress={() => changeMode('login')} /> : null}
            {mode !== 'register' ? <Button title="Creează cont" variant="ghost" small onPress={() => changeMode('register')} /> : null}
            {mode !== 'reset' ? <Button title="Am uitat parola" variant="ghost" small onPress={() => changeMode('reset')} /> : null}
          </ButtonRow>
        </View>
      </View>
    </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: { maxWidth: 430, width: '100%', alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  brandIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20 },
  kicker: { textAlign: 'center', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { textAlign: 'center', fontSize: 26, lineHeight: 32, marginTop: 3, marginBottom: 5 },
  subtitle: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginBottom: 7 },
  passwordHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 8, marginLeft: 2 },
  consents: { gap: 13, borderWidth: 1, borderRadius: 15, padding: 14, marginVertical: 10 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { fontSize: 12.5, lineHeight: 17 },
  consentLink: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', textDecorationLine: 'underline' },
  alternatives: { justifyContent: 'center', marginBottom: 0, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
