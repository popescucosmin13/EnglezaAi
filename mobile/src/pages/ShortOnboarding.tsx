import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ONBOARDING_OPTIONS as OPT } from '../content';
import { getProfile, saveProfile } from '../db/db';
import { loadShortOnboardingProgress, saveShortOnboardingProgress, shortOnboardingDraft, profileFromOnboardingDraft, type OnboardingDraft } from '../onboarding/draft';
import { beginAcquisition, trackAcquisition } from '../acquisition/client';
import { Icon } from '../components/Icon';
import { Banner, Button, Chip, ChipRow, Screen } from '../ui';
import { usePalette } from '../theme';

export default function ShortOnboarding({ onDone, saveToAccount = true, onExistingAccount }: {
  onDone: (draft: OnboardingDraft) => void | Promise<void>;
  saveToAccount?: boolean; onExistingAccount?: () => void;
}) {
  const p = usePalette();
  const [progress, setProgress] = useState(() => saveToAccount ? { objective: '', level: '', step: 0, answer: null as number | null } : loadShortOnboardingProgress());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const { objective, level, step, answer } = progress;
  const beginner = OPT.perceivedLevels.indexOf(level) <= 1;
  const options = beginner ? ['I from Romania.', 'I am from Romania.'] : ['I am agree with you.', 'I agree with you.'];
  useEffect(() => {
    if (saveToAccount) return;
    beginAcquisition();
    if (step === 2) trackAcquisition('demo_view');
    saveShortOnboardingProgress(progress);
  }, [progress, saveToAccount]);

  function next() {
    if (step === 0 && objective) {
      if (!saveToAccount) trackAcquisition('objective_selected');
      setProgress(value => ({ ...value, step: 1 }));
    } else if (step === 1 && level) {
      if (!saveToAccount) trackAcquisition('level_selected');
      setProgress(value => ({ ...value, step: 2 }));
    }
  }
  function chooseAnswer(index: number) {
    if (answer !== null) return;
    setProgress(value => ({ ...value, answer: index }));
    if (!saveToAccount) trackAcquisition('demo_complete');
  }
  async function finish() {
    if (submitting.current || !objective || !level) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      if (!saveToAccount && answer === null) trackAcquisition('demo_skip');
      const draft = shortOnboardingDraft(objective, level);
      if (saveToAccount) await saveProfile(profileFromOnboardingDraft(draft, await getProfile()));
      await onDone(draft);
    } catch { setError('Nu am putut salva preferințele. Încearcă din nou; alegerile tale sunt păstrate.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Screen style={{ paddingTop: 24 }}>
    <View style={styles.shell}>
      <View style={styles.brand}><View style={[styles.brandIcon, { backgroundColor: p.primary }]}><Icon name="audio" size={23} color={p.white} /></View><Text style={[styles.brandName, { color: p.ink }]}>EnglezaAI</Text></View>
      <Text style={[styles.kicker, { color: p.primaryDeep }]}>{step < 2 ? `PLANUL TĂU · ${step + 1} DIN 2` : 'ÎNCEARCĂ UN EXERCIȚIU'}</Text>
      <View style={styles.progress}>{[0, 1].map(index => <View key={index} style={[styles.dot, { backgroundColor: index <= step ? p.primary : p.bgSoft }]} />)}</View>
      <Text accessibilityRole="header" style={[styles.title, { color: p.ink }]}>{step === 0 ? 'Pentru ce vrei să înveți engleză?' : step === 1 ? 'De unde începem?' : 'O explicație mică. Un pas înainte.'}</Text>
      <Text style={[styles.subtitle, { color: p.muted }]}>{step === 0 ? 'Alegem exerciții utile pentru tine. Restul preferințelor le poți schimba mai târziu în Setări.' : step === 1 ? 'Alege ce te descrie acum. Nu este un test și poți ajusta nivelul ulterior.' : 'Alege propoziția corectă și vezi explicația în română. Exercițiul este opțional.'}</Text>
      {step === 0 ? <ChipRow>{OPT.objectives.map(value => <Chip key={value} label={value} selected={objective === value} onPress={() => setProgress(current => ({ ...current, objective: value }))} />)}</ChipRow> : null}
      {step === 1 ? <View style={styles.choices}>{OPT.perceivedLevels.map(value => <Button key={value} title={value} variant={level === value ? 'primary' : 'default'} style={styles.choice} onPress={() => setProgress(current => ({ ...current, level: value, answer: null }))} />)}</View> : null}
      {step === 2 ? <View style={[styles.demo, { backgroundColor: p.card, borderColor: p.border }]}>
        <Text style={[styles.prompt, { color: p.ink }]}>{beginner ? 'Cum spui „Sunt din România”?' : 'Cum spui „Sunt de acord cu tine”?'}</Text>
        <View style={styles.choices}>{options.map((value, index) => <Button key={value} title={value} variant={answer !== null && index === 1 ? 'success' : answer === index ? 'danger' : 'default'} onPress={() => chooseAnswer(index)} disabled={answer !== null} style={[styles.choice, answer !== null && { opacity: 1 }]} textStyle={answer !== null ? { color: p.ink } : undefined} />)}</View>
        {answer !== null ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { backgroundColor: p.successSoft }]}>
          <Text style={[styles.feedbackTitle, { color: p.success }]}>{answer === 1 ? 'Exact!' : 'Aproape! Hai să vedem de ce.'}</Text>
          <Text style={[styles.explanation, { color: p.ink }]}>{beginner ? 'În engleză, propoziția are nevoie de verb: „I am” înseamnă „eu sunt”. Spunem „I am from Romania”.' : '„Agree” este deja un verb și înseamnă „a fi de acord”. Spunem „I agree”, fără „am”.'}</Text>
          <Text style={[styles.translation, { color: p.primaryDeep }]}>{options[1]}{beginner ? ' — Sunt din România.' : ' — Sunt de acord cu tine.'}</Text>
        </View> : null}
      </View> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={styles.actions}>
        {step < 2 ? <Button title={step === 0 ? 'Continuă' : 'Vezi un exercițiu'} variant="primary" disabled={step === 0 ? !objective : !level} onPress={next} /> : <Button title={saveToAccount ? 'Începe să înveți' : answer === null ? 'Continuă direct la cont' : 'Creează contul și continuă'} variant="primary" busy={busy} onPress={() => void finish()} />}
        {step > 0 ? <Button title="Înapoi" variant="ghost" disabled={busy} onPress={() => setProgress(value => ({ ...value, step: value.step - 1 }))} /> : onExistingAccount ? <Button title="Am deja cont" variant="ghost" onPress={onExistingAccount} /> : null}
      </View>
      {step === 2 ? <Text style={[styles.note, { color: p.muted }]}>Contul îți păstrează planul și progresul. Pentru acest exercițiu nu este nevoie de microfon.</Text> : null}
      <Text accessibilityRole="link" onPress={() => void Linking.openURL('http://localhost:3000/privacy.html')} style={[styles.note, { color: p.primaryDeep }]}>Confidențialitate</Text>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  shell: { width: '100%', maxWidth: 480, alignSelf: 'center' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  brandIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, brandName: { fontSize: 22, fontWeight: '800' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 }, progress: { flexDirection: 'row', gap: 7, marginTop: 10, marginBottom: 22 }, dot: { flex: 1, height: 5, borderRadius: 5 },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.6 }, subtitle: { fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 22 },
  choices: { gap: 10 }, choice: { justifyContent: 'flex-start', minHeight: 52 }, demo: { borderWidth: 1, borderRadius: 22, padding: 18 }, prompt: { fontSize: 17, lineHeight: 24, fontWeight: '700', marginBottom: 16 },
  feedback: { padding: 14, borderRadius: 14, marginTop: 16 }, feedbackTitle: { fontSize: 15, fontWeight: '800' }, explanation: { fontSize: 14, lineHeight: 21, marginTop: 7 }, translation: { fontSize: 14, lineHeight: 21, marginTop: 10, fontWeight: '700' },
  actions: { gap: 5, marginTop: 26 }, note: { textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 15 },
});
