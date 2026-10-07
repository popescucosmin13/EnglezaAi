// Onboarding (§6): 7 pași, ~5-8 minute, un pas pe ecran — portat de pe web.

import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { CorrectionMode, Profile } from '../types';
import { getProfile, saveProfile } from '../db/db';
import { ONBOARDING_OPTIONS as OPT } from '../content';
import { profileFromOnboardingDraft, type OnboardingDraft } from '../onboarding/draft';
import { Icon, type IconName } from '../components/Icon';
import { Screen, H1, H3, Muted, Chip, ChipRow, Button, ButtonRow } from '../ui';
import { usePalette } from '../theme';

const STEPS = 7;
export { default } from './ShortOnboarding';

export function LearningPreferences({
  onDone,
  saveToAccount = true,
  onExistingAccount,
  initialProfile,
}: {
  onDone: (draft: OnboardingDraft) => void | Promise<void>;
  saveToAccount?: boolean;
  onExistingAccount?: () => void;
  initialProfile?: Profile;
}) {
  const p = usePalette();
  const [step, setStep] = useState(0);
  const [native, setNative] = useState(initialProfile?.nativeLanguage || 'română');
  const [objective, setObjective] = useState(initialProfile?.mainObjective || '');
  const [perceived, setPerceived] = useState(initialProfile?.perceivedLevel || '');
  const [time, setTime] = useState(initialProfile?.dailyGoalMinutes || 10);
  const [temporal, setTemporal] = useState(initialProfile?.temporalObjective || 'progres general');
  const [interests, setInterests] = useState<string[]>(initialProfile?.interests || []);
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>(initialProfile?.correctionMode || 'immediate');
  const [roHelp, setRoHelp] = useState<'multa' | 'putina'>(initialProfile?.romanianHelp || 'multa');
  const [speed, setSpeed] = useState<'lent' | 'normal' | 'provocare'>(initialProfile?.aiSpeed || 'normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canNext = [
    true,
    objective !== '',
    perceived !== '',
    true,
    temporal !== '',
    interests.length > 0,
    true,
  ][step];

  async function finish() {
    const draft: OnboardingDraft = {
      nativeLanguage: native,
      mainObjective: objective,
      perceivedLevel: perceived,
      dailyGoalMinutes: time,
      temporalObjective: temporal,
      interests,
      correctionMode,
      romanianHelp: roHelp,
      aiSpeed: speed,
    };
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (saveToAccount) {
        const base = await getProfile();
        await saveProfile(base.onboarded ? { ...base, ...draft } : profileFromOnboardingDraft(draft, base));
      }
      await onDone(draft);
    } catch { setError('Nu am putut salva preferințele. Încearcă din nou.'); }
    finally { setBusy(false); }
  }

  const chip = (value: string, selected: boolean, onPress: () => void) => (
    <Chip key={value} label={value} selected={selected} onPress={onPress} />
  );

  const title = (icon: IconName, text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={24} color={p.ink} />
      <H1 style={{ marginVertical: 0, flexShrink: 1 }}>{text}</H1>
    </View>
  );

  let body: ReactNode = null;
  if (step === 0)
    body = (
      <>
        {title('user', 'Bine ai venit!')}
        <Muted>Care e limba ta maternă? Explicațiile vor fi în limba ta, practica în engleză.</Muted>
        <ChipRow>{['română', 'engleză', 'spaniolă', 'italiană'].map((l) => chip(l, native === l, () => setNative(l)))}</ChipRow>
      </>
    );
  if (step === 1)
    body = (
      <>
        {title('target', 'Scopul tău principal')}
        <Muted>Lecțiile se construiesc din viața și obiectivele tale.</Muted>
        <ChipRow>{OPT.objectives.map((o) => chip(o, objective === o, () => setObjective(o)))}</ChipRow>
      </>
    );
  if (step === 2)
    body = (
      <>
        {title('barChart', 'Cum îți evaluezi engleza?')}
        <Muted>Răspunsul nu înlocuiește testul de nivel — doar ne orientează.</Muted>
        <ChipRow>{OPT.perceivedLevels.map((l) => chip(l, perceived === l, () => setPerceived(l)))}</ChipRow>
      </>
    );
  if (step === 3)
    body = (
      <>
        {title('clock', 'Cât timp ai pe zi?')}
        <ChipRow>{OPT.times.map((t) => chip(`${t} minute`, time === t, () => setTime(t)))}</ChipRow>
      </>
    );
  if (step === 4)
    body = (
      <>
        {title('calendar', 'Obiectivul tău temporal')}
        <ChipRow>{OPT.temporalObjectives.map((o) => chip(o, temporal === o, () => setTemporal(o)))}</ChipRow>
      </>
    );
  if (step === 5)
    body = (
      <>
        {title('lightbulb', 'Ce te interesează?')}
        <Muted>Alege oricâte — conversațiile vor fi pe aceste subiecte.</Muted>
        <ChipRow>
          {OPT.interests.map((i) =>
            chip(i, interests.includes(i), () =>
              setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))
            )
          )}
        </ChipRow>
      </>
    );
  if (step === 6)
    body = (
      <>
        {title('sliders', 'Cum să te corectez?')}
        <ChipRow>
          {chip('corectează-mă imediat', correctionMode === 'immediate', () => setCorrectionMode('immediate'))}
          {chip('corectează-mă discret', correctionMode === 'discreet', () => setCorrectionMode('discreet'))}
          {chip('corectează-mă la final', correctionMode === 'final', () => setCorrectionMode('final'))}
        </ChipRow>
        <H3>Română în explicații?</H3>
        <ChipRow>
          {chip('explică-mi în română', roHelp === 'multa', () => setRoHelp('multa'))}
          {chip('cât mai puțină română', roHelp === 'putina', () => setRoHelp('putina'))}
        </ChipRow>
        <H3>Ritmul AI-ului</H3>
        <ChipRow>
          {chip('vorbește lent', speed === 'lent', () => setSpeed('lent'))}
          {chip('vorbește normal', speed === 'normal', () => setSpeed('normal'))}
          {chip('provoacă-mă', speed === 'provocare', () => setSpeed('provocare'))}
        </ChipRow>
      </>
    );

  return (
    <Screen style={{ paddingTop: 24 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 22 }}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: i <= step ? p.grad : p.bgSoft }}
          />
        ))}
      </View>

      <View style={{ flex: 1 }}>{body}</View>

      {error ? <Muted>{error}</Muted> : null}
      <ButtonRow style={{ justifyContent: 'space-between', marginTop: 24 }}>
        {step === 0 && onExistingAccount ? (
          <Button title="Am deja cont" variant="ghost" onPress={onExistingAccount} />
        ) : (
          <Button title="← Înapoi" variant="ghost" onPress={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy} />
        )}
        {step < STEPS - 1 ? (
          <Button title="Continuă →" variant="primary" onPress={() => setStep((s) => s + 1)} disabled={!canNext} />
        ) : (
          <Button title="Salvează preferințele" variant="primary" icon="graduation" busy={busy} onPress={() => void finish()} />
        )}
      </ButtonRow>
    </Screen>
  );
}
