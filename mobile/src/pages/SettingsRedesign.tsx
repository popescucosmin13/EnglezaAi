// Setări compacte, organizate pentru mobil: controalele frecvente rămân la un tap,
// iar datele, contul și acțiunile sensibile sunt grupate progresiv.

import { useEffect, useState, type ReactNode } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { Profile, CorrectionMode, Cefr, Session, Mistake, VocabItem, PronunciationResult } from '../types';
import { SESSION_TYPE_LABELS_RO } from '../types';
import {
  defaultProfile,
  exportAll,
  getMistakes,
  getProfile,
  getPronResults,
  getReports,
  getSessions,
  getVocab,
  importAll,
  saveProfile,
  wipeAll,
} from '../db/db';
import { isDue } from '../srs/ladder';
import { useAuth } from '../auth/AuthContext';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import { packageForPlan } from '../revenuecat/model';
import { isAdminUid } from '../admin-config';
import { Icon, type IconName } from '../components/Icon';
import {
  Banner,
  Button,
  ButtonRow,
  Field,
  KvRow,
  Screen,
  Select,
  Sheet,
  Spinner,
  StatGrid,
  StatTile,
  Tiny,
  confirm,
} from '../ui';
import { usePalette, type Palette } from '../theme';
import type { ReminderPreferences } from '../microlearning/types';
import { defaultReminderPreferences, getReminderPreferences } from '../microlearning/state';
import { applyDailyLearningReminder, currentNotificationPermission } from '../notifications';
import { normalizeProgramDuration, PROGRAM_EXTENSION_DAYS } from '../content';

const CEFR_LEVELS: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PUBLIC_WEB_BASE = 'http://localhost:3000';

const CORRECTION_OPTIONS = [
  { value: 'immediate', label: 'Imediată — corectează și repetă' },
  { value: 'discreet', label: 'Discretă — reformulare naturală' },
  { value: 'final', label: 'La final — fără întreruperi' },
];
const ROMANIAN_OPTIONS = [
  { value: 'multa', label: 'Explică-mi în română' },
  { value: 'putina', label: 'Cât mai puțină română' },
];
const SPEED_OPTIONS = [
  { value: 'lent', label: 'Vorbește lent' },
  { value: 'normal', label: 'Vorbește normal' },
  { value: 'provocare', label: 'Provoacă-mă' },
];
const GOAL_OPTIONS = [10, 20, 30, 45, 60].map((value) => ({ value: String(value), label: `${value} minute` }));
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}));
const MINUTE_OPTIONS = [0, 15, 30, 45].map((minute) => ({
  value: String(minute),
  label: String(minute).padStart(2, '0'),
}));

type SettingsTab = 'invatare' | 'date' | 'cont';

export default function SettingsRedesign({
  onProfileChange,
  preview = false,
}: {
  onProfileChange?: () => void;
  preview?: boolean;
}) {
  const p = usePalette();
  const { user, signOutUser, deleteAccount } = useAuth();
  const revenueCat = useRevenueCat();
  const monthlyPackage = packageForPlan(revenueCat.offering, 'monthly');
  const [tab, setTab] = useState<SettingsTab>('invatare');
  const [profile, setProfile] = useState<Profile | null>(() => preview ? settingsPreviewProfile() : null);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [reminder, setReminder] = useState<ReminderPreferences>(() => preview
    ? { ...defaultReminderPreferences(), enabled: true, hour: 19, minute: 0, permission: 'granted' }
    : defaultReminderPreferences());
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderExpanded, setReminderExpanded] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [deleteExpanded, setDeleteExpanded] = useState(false);

  useEffect(() => {
    if (preview) return;
    getProfile().then(setProfile).catch(() => {});
    Promise.all([getReminderPreferences(), currentNotificationPermission()])
      .then(([saved, permission]) => setReminder({ ...saved, permission, enabled: saved.enabled && permission === 'granted' }))
      .catch(() => {});
  }, [preview]);

  async function updateReminder(patch: Partial<Pick<ReminderPreferences, 'enabled' | 'hour' | 'minute'>>) {
    const requested = { ...reminder, ...patch };
    if (preview) {
      setReminder(requested);
      return;
    }
    setReminderBusy(true);
    setMsg('');
    try {
      const next = await applyDailyLearningReminder(requested);
      setReminder(next);
      setMsgError(requested.enabled && !next.enabled);
      setMsg(next.enabled
        ? `Reminder activ zilnic la ${formatReminderTime(next)}.`
        : requested.enabled
          ? `Permisiunea pentru notificări este oprită. O poți activa din setările ${Platform.OS === 'ios' ? 'iPhone-ului' : 'Android'}.`
          : 'Reminderul zilnic a fost dezactivat.');
    } catch (error: any) {
      setMsgError(true);
      setMsg(`Reminderul nu a putut fi actualizat: ${String(error?.message ?? error)}`);
    } finally {
      setReminderBusy(false);
    }
  }

  async function updProfile(patch: Partial<Profile>) {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    if (!preview) await saveProfile(next);
    onProfileChange?.();
  }

  async function doExport() {
    try {
      const json = await exportAll();
      const path = `${FileSystem.cacheDirectory}englezaai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(path, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export backup EnglezaAI' });
      } else {
        setMsgError(false);
        setMsg(`Backup salvat local: ${path}`);
      }
    } catch (error: any) {
      setMsgError(true);
      setMsg(`Export eșuat: ${String(error?.message ?? error)}`);
    }
  }

  async function doImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      await importAll(text);
      setMsgError(false);
      setMsg('Date importate. Repornește aplicația pentru a le vedea peste tot.');
    } catch (error: any) {
      setMsgError(true);
      setMsg(`Import eșuat: ${String(error?.message ?? error)}`);
    }
  }

  async function doWipe() {
    if (!(await confirm('Ștergi TOATE datele (profil, sesiuni, greșeli, vocabular)? Acțiunea e ireversibilă.'))) return;
    await wipeAll();
    setMsgError(false);
    setMsg('Date șterse. Repornește aplicația pentru a relua onboarding-ul.');
  }

  async function doDeleteAccount() {
    if (!accountPassword) {
      setMsgError(true);
      setMsg('Introdu parola contului pentru a confirma ștergerea.');
      return;
    }
    if (!(await confirm('Ștergi definitiv contul și TOATE datele asociate? Acțiunea este ireversibilă.'))) return;
    setDeletingAccount(true);
    setMsg('');
    try {
      await deleteAccount(accountPassword);
    } catch (error: any) {
      const code = String(error?.code ?? '');
      setMsgError(true);
      setMsg(code === 'auth/invalid-credential' || code === 'auth/wrong-password'
        ? 'Parola este incorectă.'
        : `Contul nu a putut fi șters: ${String(error?.message ?? error)}`);
      setDeletingAccount(false);
    }
  }

  async function doRestorePurchases() {
    setMsg('');
    try {
      const restoredPro = await revenueCat.restorePurchases();
      setMsgError(!restoredPro);
      setMsg(restoredPro
        ? 'Achizițiile au fost restaurate și EnglezaAI Pro este activ.'
        : 'Restaurarea s-a încheiat, dar nu am găsit un abonament Pro activ pentru acest cont.');
    } catch (error: any) {
      setMsgError(true);
      setMsg(`Achizițiile nu au putut fi restaurate: ${String(error?.message ?? error)}`);
    }
  }

  async function doOpenCustomerCenter() {
    setMsg('');
    try {
      await revenueCat.presentCustomerCenter();
    } catch (error: any) {
      setMsgError(true);
      setMsg(`Customer Center nu a putut fi deschis: ${String(error?.message ?? error)}`);
    }
  }

  const isPro = preview || revenueCat.isPro;
  const planLabel = preview
    ? 'PRO'
    : revenueCat.loading
      ? '…'
      : revenueCat.plan === 'trial'
        ? 'TRIAL'
        : isPro
          ? 'PRO'
          : 'FREE';

  return (
    <View style={[styles.root, { backgroundColor: p.bg }]}>
      <Screen style={styles.screen}>
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: p.ink }]}>Setări</Text>
          <Icon name="settings" size={31} color={p.primary} strokeWidth={2.2} />
        </View>

      <ProfileSummary profile={profile} planLabel={planLabel} p={p} />

      {msg ? (
        <Banner kind={msgError ? 'error' : 'info'} icon={msgError ? 'xCircle' : 'checkCircle'}>
          {msg}
        </Banner>
      ) : null}

      <SettingsTabs active={tab} onChange={setTab} p={p} />

      {tab === 'invatare' && profile ? (
        <>
          <SettingsCard p={p}>
            <SettingsCardHeader icon="sliders" title="Preferințe de învățare" p={p} />
            <Button title="Personalizează obiectivele și interesele" variant="ghost" icon="target" onPress={() => router.push('/preferences')} style={{ marginBottom: 12 }} />
            <SettingsPickerRow
              icon="message"
              label="Mod de corectare"
              value={correctionLabel(profile.correctionMode)}
              selectedValue={profile.correctionMode}
              options={CORRECTION_OPTIONS}
              onChange={(value) => void updProfile({ correctionMode: value as CorrectionMode })}
              p={p}
            />
            <SettingsPickerRow
              icon="book"
              label="Limba explicațiilor"
              value={profile.romanianHelp === 'multa' ? 'Română' : 'Minimă'}
              selectedValue={profile.romanianHelp}
              options={ROMANIAN_OPTIONS}
              onChange={(value) => void updProfile({ romanianHelp: value as Profile['romanianHelp'] })}
              p={p}
            />
            <SettingsPickerRow
              icon="clock"
              label="Ritmul tutorelui"
              value={speedLabel(profile.aiSpeed)}
              selectedValue={profile.aiSpeed}
              options={SPEED_OPTIONS}
              onChange={(value) => void updProfile({ aiSpeed: value as Profile['aiSpeed'] })}
              p={p}
            />
            <SettingsPickerRow
              icon="target"
              label="Obiectiv zilnic"
              value={`${profile.dailyGoalMinutes} min`}
              selectedValue={String(profile.dailyGoalMinutes)}
              options={GOAL_OPTIONS}
              onChange={(value) => void updProfile({ dailyGoalMinutes: Number(value) })}
              last
              p={p}
            />
          </SettingsCard>

          <SettingsCard p={p}>
            <View style={styles.reminderRow}>
              <Pressable
                onPress={() => setReminderExpanded((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ expanded: reminderExpanded }}
                accessibilityLabel={`Reminder zilnic, ${reminder.enabled ? `activ la ${formatReminderTime(reminder)}` : 'dezactivat'}`}
                style={({ pressed }) => [styles.reminderMain, pressed && styles.pressed]}
              >
                <SettingsIcon name="bell" p={p} />
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowLabelStrong, { color: p.ink }]}>Reminder zilnic</Text>
                  <Text style={[styles.rowValueUnder, { color: p.muted }]}>
                    {reminder.enabled ? `Astăzi la ${formatReminderTime(reminder)}` : 'Dezactivat'}
                  </Text>
                </View>
              </Pressable>
              {reminderBusy ? <Spinner /> : (
                <Switch
                  value={reminder.enabled}
                  onValueChange={(enabled) => void updateReminder({ enabled })}
                  trackColor={{ false: p.borderStrong, true: p.primary }}
                  thumbColor={p.white}
                  ios_backgroundColor={p.borderStrong}
                  accessibilityLabel="Activează reminderul zilnic"
                />
              )}
            </View>
            {reminderExpanded ? (
              <View style={[styles.expandedArea, { borderTopColor: p.border }]}>
                <View style={styles.twoColumns}>
                  <View style={styles.column}>
                    <Select
                      label="Ora"
                      value={String(reminder.hour)}
                      options={HOUR_OPTIONS}
                      onChange={(value) => void updateReminder({ hour: Number(value) })}
                    />
                  </View>
                  <View style={styles.column}>
                    <Select
                      label="Minute"
                      value={String(reminder.minute)}
                      options={MINUTE_OPTIONS}
                      onChange={(value) => void updateReminder({ minute: Number(value) })}
                    />
                  </View>
                </View>
                <Tiny>Ora folosește fusul telefonului. Permisiune: {permissionLabel(reminder.permission)}.</Tiny>
                {reminder.permission === 'denied' ? (
                  <ButtonRow style={{ marginBottom: 0 }}>
                    <Button title="Deschide setările" small onPress={() => void Linking.openSettings()} />
                  </ButtonRow>
                ) : null}
              </View>
            ) : null}
          </SettingsCard>

          <SettingsCard p={p}>
            <SettingsRow
              icon="target"
              label="Nivel și obiectiv"
              value={`${profile.currentLevel} → ${profile.targetLevel}`}
              onPress={() => setProfileExpanded((value) => !value)}
              expanded={profileExpanded}
              stacked
              last
              p={p}
            />
            {profileExpanded ? (
              <View style={[styles.expandedArea, { borderTopColor: p.border }]}>
                <View style={styles.twoColumns}>
                  <View style={styles.column}>
                    <Select
                      label="Nivel curent"
                      value={profile.currentLevel}
                      onChange={(value) => void updProfile({ currentLevel: value as Cefr })}
                      options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))}
                    />
                  </View>
                  <View style={styles.column}>
                    <Select
                      label="Nivel țintă"
                      value={profile.targetLevel}
                      onChange={(value) => void updProfile({ targetLevel: value as Cefr })}
                      options={CEFR_LEVELS.map((level) => ({ value: level, label: level }))}
                    />
                  </View>
                </View>
                <Field
                  label="Data de start (AAAA-LL-ZZ)"
                  value={profile.startDate}
                  onChange={(value) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) void updProfile({ startDate: value });
                    else setProfile({ ...profile, startDate: value });
                  }}
                  placeholder="2026-01-15"
                  keyboardType="numbers-and-punctuation"
                />
                <Tiny>
                  Plan activ: {normalizeProgramDuration(profile.programDurationDays)} de zile · {profile.mainObjective} · {profile.xp} XP
                </Tiny>
                <ButtonRow style={{ marginBottom: 0 }}>
                  <Button
                    title={`Extinde cu ${PROGRAM_EXTENSION_DAYS} de zile`}
                    icon="calendar"
                    small
                    onPress={() => void updProfile({
                      programDurationDays: normalizeProgramDuration(profile.programDurationDays) + PROGRAM_EXTENSION_DAYS,
                    })}
                  />
                  <Button title="Refă testul" icon="graduation" small onPress={() => router.push('/test')} />
                </ButtonRow>
              </View>
            ) : null}
          </SettingsCard>
        </>
      ) : null}

      {tab === 'date' ? (
        <DataTab profile={profile} onExport={doExport} onImport={doImport} onWipe={doWipe} p={p} preview={preview} />
      ) : null}

        {tab === 'cont' ? (
        <>
          <SettingsCard p={p}>
            <SettingsCardHeader icon="star" title="EnglezaAI Pro" p={p} />
            <View style={styles.planBody}>
              <View style={styles.planStatusRow}>
                <Text style={[styles.planLabel, { color: p.ink2 }]}>Plan actual</Text>
                <Text style={[styles.planValue, { color: isPro ? p.success : p.ink }]}>
                  {revenueCat.loading && !preview
                    ? 'Se verifică…'
                    : revenueCat.plan === 'trial'
                      ? 'Trial Pro'
                      : isPro
                        ? 'Pro activ'
                        : 'Free'}
                </Text>
              </View>
              {isPro && revenueCat.expirationDate ? (
                <Tiny>Valabil până la {new Date(revenueCat.expirationDate).toLocaleDateString('ro-RO')}.</Tiny>
              ) : !isPro ? (
                <Tiny>Free include testul inițial și o sesiune zilnică de maximum 5 minute.</Tiny>
              ) : (
                <Tiny>Ai acces la toate modulele EnglezaAI.</Tiny>
              )}
              {monthlyPackage ? <Tiny>Abonament lunar · {monthlyPackage.product.priceString}</Tiny> : null}
              {revenueCat.error ? <Banner kind="warn">{revenueCat.error}</Banner> : null}
              <ButtonRow style={{ marginBottom: 0 }}>
                {!isPro ? (
                  <Button
                    title="Vezi planurile Pro"
                    variant="primary"
                    busy={revenueCat.busy}
                    disabled={!revenueCat.ready}
                    onPress={() => router.push('/subscription')}
                  />
                ) : (
                  <Button
                    title="Gestionează abonamentul"
                    variant="primary"
                    busy={revenueCat.busy}
                    onPress={() => void doOpenCustomerCenter()}
                  />
                )}
                <Button title="Restaurează" busy={revenueCat.busy} disabled={!revenueCat.ready} onPress={() => void doRestorePurchases()} />
                <Button title="Actualizează" variant="ghost" busy={revenueCat.busy} onPress={() => void revenueCat.refreshAccessInfo()} />
              </ButtonRow>
            </View>
          </SettingsCard>

          <SettingsCard p={p}>
            <SettingsCardHeader icon="user" title="Cont" p={p} />
            <View style={styles.accountBody}>
              <Tiny>
                Autentificat ca <Text style={{ fontWeight: '800', color: p.ink }}>{user?.email ?? 'contul tău'}</Text>.
                Progresul este sincronizat pe dispozitivele tale.
              </Tiny>
              <ButtonRow style={{ marginBottom: 0 }}>
                <Button title="Ieși din cont" variant="danger" icon="logout" onPress={() => void signOutUser()} />
              </ButtonRow>
            </View>
          </SettingsCard>

          <SettingsCard p={p}>
            <SettingsRow
              icon="trash"
              label="Ștergerea contului"
              value="Ireversibil"
              tone="danger"
              onPress={() => setDeleteExpanded((value) => !value)}
              expanded={deleteExpanded}
              last
              p={p}
            />
            {deleteExpanded ? (
              <View style={[styles.expandedArea, { borderTopColor: p.border }]}>
                <Tiny>Ștergerea elimină definitiv contul, profilul, sesiunile, greșelile și rapoartele salvate.</Tiny>
                <Field label="Parola contului" value={accountPassword} onChange={setAccountPassword} secure autoComplete="password" />
                <Button title="Șterge definitiv contul" variant="danger" icon="trash" busy={deletingAccount} onPress={() => void doDeleteAccount()} />
              </View>
            ) : null}
          </SettingsCard>

          {isAdminUid(user?.uid) ? (
            <SettingsCard p={p}>
              <SettingsRow icon="shield" label="Admin Center" value="Configurare globală" onPress={() => router.push('/admin')} last p={p} />
            </SettingsCard>
          ) : null}

          <SettingsCard p={p}>
            <SettingsCardHeader icon="shieldCheck" title="Confidențialitate și ajutor" p={p} />
            <SettingsRow icon="shield" label="Politica de confidențialitate" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/privacy.html`)} p={p} />
            <SettingsRow icon="trash" label="Instrucțiuni ștergere cont" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/delete-account.html`)} p={p} />
            <SettingsRow icon="clipboard" label="Termeni de utilizare" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/terms.html`)} p={p} />
            <SettingsRow icon="help" label="Suport" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/support.html`)} last p={p} />
          </SettingsCard>
        </>
        ) : null}
      </Screen>
      {preview ? <PreviewNavigation p={p} /> : null}
    </View>
  );
}

function PreviewNavigation({ p }: { p: Palette }) {
  const items: { label: string; icon: IconName; pro?: boolean; active?: boolean }[] = [
    { label: 'Acasă', icon: 'home' },
    { label: 'Vorbește', icon: 'mic', pro: true },
    { label: 'For You', icon: 'sparkles', pro: true },
    { label: 'Practică', icon: 'puzzle', pro: true },
    { label: 'Progres', icon: 'trending', pro: true },
    { label: 'Setări', icon: 'settings', active: true },
  ];
  return (
    <View style={[styles.previewNavigation, { backgroundColor: p.navBg, borderColor: p.border }]} pointerEvents="none">
      {items.map((item) => (
        <View key={item.label} style={[styles.previewNavigationItem, item.active && { backgroundColor: p.primarySoft }]}>
          <View>
            <Icon name={item.icon} size={21} color={item.active ? p.primary : p.muted} strokeWidth={2.2} />
            {item.pro ? (
              <View style={[styles.previewProBadge, { backgroundColor: p.primary }]}>
                <Text style={styles.previewProText}>PRO</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.previewNavigationLabel, { color: item.active ? p.primary : p.muted }]} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ProfileSummary({ profile, planLabel, p }: { profile: Profile | null; planLabel: string; p: Palette }) {
  return (
    <View style={[styles.profileCard, { backgroundColor: p.card, borderColor: p.border }]}>
      <View style={[styles.avatar, { backgroundColor: p.primarySoft }]}>
        <Icon name="user" size={31} color={p.primary} strokeWidth={2.1} />
      </View>
      <View style={styles.profileCopy}>
        <Text style={[styles.greeting, { color: p.ink }]}>Bună!</Text>
        <View style={styles.levelRow}>
          <View style={[styles.levelPill, { backgroundColor: p.primarySoft }]}>
            <Text style={[styles.levelText, { color: p.primaryDeep }]}>{profile?.currentLevel ?? '—'}</Text>
          </View>
          <Icon name="arrowRight" size={17} color={p.primary} strokeWidth={2.4} />
          <View style={[styles.levelPill, { backgroundColor: p.primarySoft }]}>
            <Text style={[styles.levelText, { color: p.primaryDeep }]}>{profile?.targetLevel ?? '—'}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.planPill, { backgroundColor: p.primarySoft, borderColor: p.borderStrong }]}>
        <Icon name="star" size={18} color={p.primary} strokeWidth={2.3} />
        <Text style={[styles.planPillText, { color: p.primaryDeep }]}>{planLabel}</Text>
      </View>
    </View>
  );
}

function SettingsTabs({ active, onChange, p }: { active: SettingsTab; onChange: (tab: SettingsTab) => void; p: Palette }) {
  const tabs: { key: SettingsTab; label: string; icon: IconName }[] = [
    { key: 'invatare', label: 'Învățare', icon: 'graduation' },
    { key: 'date', label: 'Date', icon: 'calendar' },
    { key: 'cont', label: 'Cont', icon: 'user' },
  ];
  return (
    <View style={[styles.tabs, { backgroundColor: p.card, borderColor: p.border }]}>
      {tabs.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.tab, selected && { backgroundColor: p.primarySoft }, pressed && styles.pressed]}
          >
            <Icon name={item.icon} size={19} color={selected ? p.primary : p.muted} strokeWidth={2.2} />
            <Text style={[styles.tabText, { color: selected ? p.primaryDeep : p.ink2 }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SettingsCard({ children, p, style }: { children: ReactNode; p: Palette; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, style]}>{children}</View>;
}

function SettingsCardHeader({ icon, title, p }: { icon: IconName; title: string; p: Palette }) {
  return (
    <View style={[styles.cardHeader, { borderBottomColor: p.border }]}>
      <Icon name={icon} size={22} color={p.primary} strokeWidth={2.2} />
      <Text style={[styles.cardTitle, { color: p.ink }]}>{title}</Text>
    </View>
  );
}

function SettingsIcon({ name, p, danger }: { name: IconName; p: Palette; danger?: boolean }) {
  return (
    <View style={styles.rowIcon}>
      <Icon name={name} size={19} color={danger ? p.danger : p.primary} strokeWidth={2.2} />
    </View>
  );
}

function SettingsRow({ icon, label, value, onPress, expanded, stacked, last, tone, p }: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  expanded?: boolean;
  stacked?: boolean;
  last?: boolean;
  tone?: 'danger';
  p: Palette;
}) {
  const content = (
    <>
      <SettingsIcon name={icon} p={p} danger={tone === 'danger'} />
      {stacked ? (
        <View style={styles.rowCopy}>
          <Text style={[styles.rowLabelStrong, { color: tone === 'danger' ? p.danger : p.ink }]} numberOfLines={1}>{label}</Text>
          {value ? <Text style={[styles.rowValueUnder, { color: tone === 'danger' ? p.danger : p.primaryDeep }]} numberOfLines={1}>{value}</Text> : null}
        </View>
      ) : (
        <>
          <Text style={[styles.rowLabel, { color: tone === 'danger' ? p.danger : p.ink }]} numberOfLines={2}>{label}</Text>
          {value ? <Text style={[styles.rowValue, { color: tone === 'danger' ? p.danger : p.muted }]} numberOfLines={1}>{value}</Text> : null}
        </>
      )}
      {onPress ? <Icon name={expanded ? 'chevronUp' : 'arrowRight'} size={19} color={p.muted} /> : null}
    </>
  );
  const rowStyle = [styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={expanded == null ? undefined : { expanded }}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function SettingsPickerRow({ icon, label, value, selectedValue, options, onChange, last, p }: {
  icon: IconName;
  label: string;
  value: string;
  selectedValue: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  last?: boolean;
  p: Palette;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsRow icon={icon} label={label} value={value} onPress={() => setOpen(true)} last={last} p={p} />
      <Sheet visible={open} onClose={() => setOpen(false)} maxHeightRatio={0.72}>
        <Text style={[styles.sheetTitle, { color: p.ink }]}>{label}</Text>
        <View style={[styles.sheetOptions, { backgroundColor: p.card, borderColor: p.border }]}>
          {options.map((option, index) => {
            const selected = option.value === selectedValue;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setOpen(false);
                  if (!selected) onChange(option.value);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.sheetOption,
                  index < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border },
                  selected && { backgroundColor: p.primarySoft },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.sheetOptionText, { color: selected ? p.primaryDeep : p.ink }]}>{option.label}</Text>
                {selected ? <Icon name="checkCircle" size={20} color={p.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

interface DataStats {
  sessions: Session[];
  mistakes: Mistake[];
  vocab: VocabItem[];
  pron: PronunciationResult[];
  reportsCount: number;
}

function DataTab({ profile, onExport, onImport, onWipe, p, preview }: {
  profile: Profile | null;
  onExport: () => void;
  onImport: () => void;
  onWipe: () => void;
  p: Palette;
  preview?: boolean;
}) {
  const [stats, setStats] = useState<DataStats | null>(() => preview ? settingsPreviewStats() : null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preview) return;
    Promise.all([getSessions(), getMistakes(), getVocab(), getPronResults(), getReports()])
      .then(([sessions, mistakes, vocab, pron, reports]) => setStats({ sessions, mistakes, vocab, pron, reportsCount: reports.length }))
      .catch(() => setError('Nu am putut încărca datele de progres. Încearcă din nou.'));
  }, [preview]);

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!stats || !profile) {
    return <View style={styles.loadingRow}><Spinner /><Tiny>Se încarcă statisticile…</Tiny></View>;
  }

  const { sessions, mistakes, vocab, pron } = stats;
  const totalMinutes = Math.round(sessions.reduce((sum, session) => sum + session.userSpeakingSec, 0) / 60);
  const totalWords = sessions.reduce((sum, session) => sum + session.wordCount, 0);
  const activeMistakes = mistakes.filter((mistake) => mistake.status !== 'mastered');
  const dueMistakes = activeMistakes.filter((mistake) => isDue(mistake.review));
  const masteredMistakes = mistakes.length - activeMistakes.length;
  const activeVocab = vocab.filter((item) => item.activeScore >= 60);
  const dueVocab = vocab.filter((item) => isDue(item.review));
  const recentPron = pron.slice(-30);
  const avgPron = recentPron.length ? Math.round(recentPron.reduce((sum, result) => sum + result.score, 0) / recentPron.length) : null;
  const last = sessions[sessions.length - 1];
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const programDay = Math.max(1, Math.floor((Date.now() - new Date(profile.startDate).getTime()) / 86400000) + 1);

  return (
    <>
      <Text style={[styles.sectionLabel, { color: p.ink }]}>Progresul tău în cifre</Text>
      <StatGrid>
        <StatTile value={`${profile.currentLevel} → ${profile.targetLevel}`} label="nivel" />
        <StatTile value={profile.xp} label="XP total" />
        <StatTile value={profile.streak} label="zile consecutiv" />
        <StatTile value={Math.min(programDay, programDuration)} label={`ziua din ${programDuration}`} />
      </StatGrid>

      <SettingsCard p={p} style={styles.firstDataCard}>
        <SettingsCardHeader icon="mic" title="Vorbire" p={p} />
        <View style={styles.dataRows}>
          <KvRow k="Sesiuni totale" v={String(sessions.length)} />
          <KvRow k="Minute vorbite" v={String(totalMinutes)} />
          <KvRow k="Cuvinte rostite" v={String(totalWords)} />
          <KvRow k="Ultima sesiune" v={last ? `${last.startedAt.slice(0, 10)} · ${SESSION_TYPE_LABELS_RO[last.type]}` : '—'} last />
        </View>
      </SettingsCard>

      <SettingsCard p={p}>
        <SettingsCardHeader icon="save" title="Memoria de învățare" p={p} />
        <View style={styles.dataRows}>
          <KvRow k="Greșeli active" v={String(activeMistakes.length)} />
          <KvRow k="Greșeli scadente azi" v={String(dueMistakes.length)} />
          <KvRow k="Greșeli stăpânite" v={String(masteredMistakes)} />
          <KvRow k="Vocabular salvat" v={String(vocab.length)} />
          <KvRow k="Expresii active" v={String(activeVocab.length)} />
          <KvRow k="Vocabular scadent" v={String(dueVocab.length)} />
          <KvRow k="Exerciții pronunție" v={String(pron.length)} />
          <KvRow k="Scor mediu pronunție" v={avgPron != null ? `${avgPron}%` : '—'} />
          <KvRow k="Rapoarte săptămânale" v={String(stats.reportsCount)} last />
        </View>
      </SettingsCard>

      <SettingsCard p={p}>
        <SettingsCardHeader icon="shieldCheck" title="Date și siguranță" p={p} />
        <View style={styles.actionBody}>
          <Tiny>Descarcă o copie, restaurează un backup sau șterge toate datele de învățare.</Tiny>
          <ButtonRow style={{ marginBottom: 0 }}>
            <Button title="Export backup" icon="arrowDown" onPress={onExport} />
            <Button title="Import backup" icon="arrowUp" onPress={onImport} />
            <Button title="Șterge tot" variant="danger" icon="trash" onPress={onWipe} />
          </ButtonRow>
        </View>
      </SettingsCard>
    </>
  );
}

function correctionLabel(value: CorrectionMode) {
  if (value === 'immediate') return 'Imediată';
  if (value === 'final') return 'La final';
  return 'Discretă';
}

function speedLabel(value: Profile['aiSpeed']) {
  if (value === 'lent') return 'Lent';
  if (value === 'provocare') return 'Provocare';
  return 'Normal';
}

function permissionLabel(permission: ReminderPreferences['permission']) {
  if (permission === 'granted') return 'acordată';
  if (permission === 'denied') return 'refuzată';
  if (permission === 'unsupported') return 'indisponibilă';
  return 'necerută încă';
}

function formatReminderTime(reminder: Pick<ReminderPreferences, 'hour' | 'minute'>) {
  return `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`;
}

function settingsPreviewProfile(): Profile {
  return {
    ...defaultProfile(),
    onboarded: true,
    testDone: true,
    currentLevel: 'B1',
    targetLevel: 'B2',
    dailyGoalMinutes: 20,
    correctionMode: 'discreet',
    romanianHelp: 'multa',
    aiSpeed: 'normal',
    mainObjective: 'conversație profesională',
    xp: 1840,
  };
}

function settingsPreviewStats(): DataStats {
  return { sessions: [], mistakes: [], vocab: [], pron: [], reportsCount: 0 };
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center' },
  screen: { paddingTop: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pageTitle: { fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: -1 },
  profileCard: { minHeight: 84, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, minWidth: 0, gap: 5 },
  greeting: { fontSize: 20, lineHeight: 23, fontWeight: '850' as any, letterSpacing: -0.3 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelPill: { minWidth: 36, height: 25, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: 14, lineHeight: 17, fontWeight: '850' as any },
  planPill: { minHeight: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  planPillText: { fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 19, padding: 5, gap: 4, marginTop: 14, marginBottom: 16 },
  tab: { flex: 1, minHeight: 44, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6 },
  tabText: { fontSize: 14, lineHeight: 18, fontWeight: '750' as any },
  card: { borderWidth: 1, borderRadius: 21, overflow: 'hidden', marginBottom: 14 },
  cardHeader: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 19, lineHeight: 23, fontWeight: '850' as any, letterSpacing: -0.25 },
  row: { minHeight: 60, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 19, fontWeight: '650' as any },
  rowLabelStrong: { fontSize: 17, lineHeight: 21, fontWeight: '800' },
  rowValue: { maxWidth: 92, fontSize: 14, lineHeight: 18, fontWeight: '650' as any, textAlign: 'right' },
  rowValueUnder: { fontSize: 13.5, lineHeight: 17, fontWeight: '550' as any, marginTop: 2 },
  reminderRow: { minHeight: 72, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reminderMain: { flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  expandedArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 3, paddingBottom: 14 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.68 },
  sheetTitle: { fontSize: 22, lineHeight: 27, fontWeight: '850' as any, marginBottom: 14 },
  sheetOptions: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 10 },
  sheetOption: { minHeight: 56, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetOptionText: { flex: 1, fontSize: 15.5, lineHeight: 20, fontWeight: '600' },
  planBody: { paddingHorizontal: 15, paddingVertical: 14, gap: 8 },
  planStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  planLabel: { fontSize: 15, lineHeight: 19, fontWeight: '600' },
  planValue: { fontSize: 16, lineHeight: 20, fontWeight: '850' as any },
  accountBody: { paddingHorizontal: 15, paddingVertical: 14 },
  dataRows: { paddingHorizontal: 15, paddingVertical: 7 },
  actionBody: { paddingHorizontal: 15, paddingVertical: 14 },
  sectionLabel: { fontSize: 19, lineHeight: 24, fontWeight: '850' as any, letterSpacing: -0.3, marginBottom: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  firstDataCard: { marginTop: 14 },
  previewNavigation: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    height: 64,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  previewNavigationItem: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2 },
  previewNavigationLabel: { fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  previewProBadge: { position: 'absolute', top: -6, right: -17, minWidth: 24, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  previewProText: { color: '#ffffff', fontSize: 6.5, lineHeight: 8, fontWeight: '900' },
});
