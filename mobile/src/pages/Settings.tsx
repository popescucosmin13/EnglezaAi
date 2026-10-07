// Setări pe taburi: Învățare (preferințe + profil), Date (statistici + export/import/ștergere §34), Cont.
// Configurația AI/voce/backend s-a mutat în Admin Center (doar admin) și se aplică global. Portat de pe web.

import { useEffect, useState } from 'react';
import { Linking, Platform, View, Text } from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { Profile, CorrectionMode, Cefr, Session, Mistake, VocabItem, PronunciationResult } from '../types';
import { SESSION_TYPE_LABELS_RO } from '../types';
import { getProfile, saveProfile, exportAll, importAll, wipeAll, getSessions, getMistakes, getVocab, getPronResults, getReports } from '../db/db';
import { isDue } from '../srs/ladder';
import { useAuth } from '../auth/AuthContext';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import { packageForPlan } from '../revenuecat/model';
import { isAdminUid } from '../admin-config';
import { Icon } from '../components/Icon';
import { Screen, H1, H2, Card, Banner, Button, ButtonRow, Field, Select, StatGrid, StatTile, KvRow, TabsBar, Tiny, Muted, Spinner, confirm } from '../ui';
import { usePalette } from '../theme';
import type { ReminderPreferences } from '../microlearning/types';
import { defaultReminderPreferences, getReminderPreferences } from '../microlearning/state';
import { applyDailyLearningReminder, currentNotificationPermission } from '../notifications';
import { normalizeProgramDuration, PROGRAM_EXTENSION_DAYS } from '../content';

const CEFR_LEVELS: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PUBLIC_WEB_BASE = 'http://localhost:3000';

type SettingsTab = 'invatare' | 'date' | 'cont';

export default function Settings({ onProfileChange }: { onProfileChange?: () => void }) {
  const p = usePalette();
  const { user, signOutUser, deleteAccount } = useAuth();
  const revenueCat = useRevenueCat();
  const monthlyPackage = packageForPlan(revenueCat.offering, 'monthly');
  const [tab, setTab] = useState<SettingsTab>('invatare');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [reminder, setReminder] = useState<ReminderPreferences>(() => defaultReminderPreferences());
  const [reminderBusy, setReminderBusy] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {});
    Promise.all([getReminderPreferences(), currentNotificationPermission()])
      .then(([saved, permission]) => setReminder({ ...saved, permission, enabled: saved.enabled && permission === 'granted' }))
      .catch(() => {});
  }, []);

  async function updateReminder(patch: Partial<Pick<ReminderPreferences, 'enabled' | 'hour' | 'minute'>>) {
    const requested = { ...reminder, ...patch };
    setReminderBusy(true);
    setMsg('');
    try {
      const next = await applyDailyLearningReminder(requested);
      setReminder(next);
      setMsgError(requested.enabled && !next.enabled);
      setMsg(next.enabled
        ? `Reminder activ zilnic la ${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}.`
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
    await saveProfile(next);
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
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Export eșuat: ${String(e?.message ?? e)}`);
    }
  }

  async function doImport() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      await importAll(text);
      setMsgError(false);
      setMsg('Date importate. Repornește aplicația pentru a le vedea peste tot.');
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Import eșuat: ${String(e?.message ?? e)}`);
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
    } catch (e: any) {
      const code = String(e?.code ?? '');
      setMsgError(true);
      setMsg(code === 'auth/invalid-credential' || code === 'auth/wrong-password'
        ? 'Parola este incorectă.'
        : `Contul nu a putut fi șters: ${String(e?.message ?? e)}`);
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
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Achizițiile nu au putut fi restaurate: ${String(e?.message ?? e)}`);
    }
  }

  async function doOpenCustomerCenter() {
    setMsg('');
    try {
      await revenueCat.presentCustomerCenter();
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Customer Center nu a putut fi deschis: ${String(e?.message ?? e)}`);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="settings" size={24} />
        <H1 style={{ marginVertical: 0 }}>Setări</H1>
      </View>
      {msg ? (
        <Banner kind={msgError ? 'error' : 'info'} icon={msgError ? 'xCircle' : 'checkCircle'}>
          {msg}
        </Banner>
      ) : null}

      <TabsBar
        tabs={[
          { key: 'invatare', label: 'Învățare' },
          { key: 'date', label: 'Date' },
          { key: 'cont', label: 'Cont' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as SettingsTab)}
      />

      {tab === 'invatare' && profile && (
        <>
          <H2>Preferințe de învățare</H2>
          <Card>
            <Select
              label="Mod de corectare"
              value={profile.correctionMode}
              onChange={(v) => updProfile({ correctionMode: v as CorrectionMode })}
              options={[
                { value: 'immediate', label: 'Imediată — „Small correction… please repeat"' },
                { value: 'discreet', label: 'Discretă — reformulare naturală în răspuns' },
                { value: 'final', label: 'La final — conversația nu e întreruptă' },
              ]}
            />
            <Select
              label="Română în explicații"
              value={profile.romanianHelp}
              onChange={(v) => updProfile({ romanianHelp: v as any })}
              options={[
                { value: 'multa', label: 'Explică-mi în română' },
                { value: 'putina', label: 'Cât mai puțină română' },
              ]}
            />
            <Select
              label="Ritmul tutorelui"
              value={profile.aiSpeed}
              onChange={(v) => updProfile({ aiSpeed: v as any })}
              options={[
                { value: 'lent', label: 'Vorbește lent' },
                { value: 'normal', label: 'Vorbește normal' },
                { value: 'provocare', label: 'Provoacă-mă' },
              ]}
            />
            <Select
              label="Obiectiv zilnic (minute)"
              value={String(profile.dailyGoalMinutes)}
              onChange={(v) => updProfile({ dailyGoalMinutes: Number(v) })}
              options={[10, 20, 30, 45, 60].map((t) => ({ value: String(t), label: `${t} minute` }))}
            />
          </Card>

          <H2>Reminder zilnic</H2>
          <Card>
            <Muted>Primești un singur reminder local pentru lecția și recapitulările zilei. Ora folosește fusul orar al telefonului.</Muted>
            <Select
              label="Ora"
              value={String(reminder.hour)}
              onChange={(value) => void updateReminder({ hour: Number(value) })}
              options={Array.from({ length: 17 }, (_, index) => index + 6).map((hour) => ({ value: String(hour), label: `${String(hour).padStart(2, '0')}:00` }))}
            />
            <Select
              label="Minute"
              value={String(reminder.minute)}
              onChange={(value) => void updateReminder({ minute: Number(value) })}
              options={[0, 15, 30, 45].map((minute) => ({ value: String(minute), label: String(minute).padStart(2, '0') }))}
            />
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button
                title={reminder.enabled ? 'Dezactivează reminderul' : 'Activează reminderul'}
                variant={reminder.enabled ? 'default' : 'primary'}
                icon={reminder.enabled ? 'ban' : 'bell'}
                busy={reminderBusy}
                onPress={() => void updateReminder({ enabled: !reminder.enabled })}
              />
              {reminder.permission === 'denied' ? <Button title="Deschide setările" onPress={() => void Linking.openSettings()} /> : null}
            </ButtonRow>
            <Tiny>Permisiune: {reminder.permission === 'granted' ? 'acordată' : reminder.permission === 'denied' ? 'refuzată' : reminder.permission === 'unsupported' ? 'indisponibilă' : 'necerută încă'}</Tiny>
          </Card>

          <H2>Profil</H2>
          <Card>
            <Select
              label="Nivel curent (se actualizează automat pe mai multe sesiuni)"
              value={profile.currentLevel}
              onChange={(v) => updProfile({ currentLevel: v as Cefr })}
              options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))}
            />
            <Select
              label="Nivel țintă"
              value={profile.targetLevel}
              onChange={(v) => updProfile({ targetLevel: v as Cefr })}
              options={CEFR_LEVELS.map((l) => ({ value: l, label: l }))}
            />
            <Field
              label="Data de start a programului (format AAAA-LL-ZZ)"
              value={profile.startDate}
              onChange={(v) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(v)) void updProfile({ startDate: v });
                else setProfile({ ...profile, startDate: v });
              }}
              placeholder="2026-01-15"
              keyboardType="numbers-and-punctuation"
            />
            <Tiny>
              Plan activ: {normalizeProgramDuration(profile.programDurationDays)} de zile. Îl poți prelungi fără să pierzi progresul.
            </Tiny>
            <ButtonRow>
              <Button
                title={`Extinde cu ${PROGRAM_EXTENSION_DAYS} de zile`}
                icon="calendar"
                onPress={() => void updProfile({ programDurationDays: normalizeProgramDuration(profile.programDurationDays) + PROGRAM_EXTENSION_DAYS })}
              />
            </ButtonRow>
            <Tiny>
              Obiectiv: {profile.mainObjective} · interese: {profile.interests.join(', ')} · XP: {profile.xp}
            </Tiny>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Refă testul de nivel" icon="graduation" onPress={() => router.push('/test')} />
            </ButtonRow>
          </Card>
        </>
      )}

      {tab === 'date' && <DataTab profile={profile} onExport={doExport} onImport={doImport} onWipe={doWipe} />}

      {tab === 'cont' && (
        <>
          <H2>EnglezaAI Pro</H2>
          <Card>
            <KvRow
              k="Plan actual"
              v={revenueCat.loading
                ? 'Se verifică…'
                : revenueCat.plan === 'trial'
                  ? 'Trial Pro'
                  : revenueCat.plan === 'admin'
                    ? 'Pro · Admin'
                    : revenueCat.plan === 'pro'
                      ? 'Pro activ'
                      : 'Free'}
            />
            {revenueCat.isPro ? (
              <>
                <KvRow
                  k="Valabilitate"
                  v={revenueCat.expirationDate
                    ? new Date(revenueCat.expirationDate).toLocaleDateString('ro-RO')
                    : 'Acces permanent'}
                  last
                />
              </>
            ) : null}
            {revenueCat.plan === 'free' ? (
              <Tiny style={{ marginTop: 8 }}>
                Free include testul inițial și o singură sesiune zilnică de maximum 5 minute. Celelalte module necesită Pro.
              </Tiny>
            ) : null}
            {monthlyPackage ? (
              <Tiny style={{ marginTop: 8 }}>
                Abonament lunar disponibil · {monthlyPackage.product.priceString}
              </Tiny>
            ) : (
              <Tiny style={{ marginTop: 8 }}>
                Planul lunar nu este disponibil momentan. Încearcă din nou puțin mai târziu.
              </Tiny>
            )}
            {revenueCat.error ? <Banner kind="warn">{revenueCat.error}</Banner> : null}
            <ButtonRow style={{ marginBottom: 0 }}>
              {!revenueCat.isPro ? (
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
              <Button
                title="Restaurează achizițiile"
                busy={revenueCat.busy}
                disabled={!revenueCat.ready}
                onPress={() => void doRestorePurchases()}
              />
              <Button
                title="Actualizează planul"
                variant="ghost"
                busy={revenueCat.busy}
                onPress={() => void revenueCat.refreshAccessInfo()}
              />
            </ButtonRow>
          </Card>
          <H2>Cont</H2>
          <Card>
            <Tiny>
              Autentificat ca <Text style={{ fontWeight: '700' }}>{user?.email}</Text>. Progresul tău este salvat în
              siguranță și disponibil pe toate dispozitivele tale.
            </Tiny>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Ieși din cont" variant="danger" icon="logout" onPress={() => void signOutUser()} />
            </ButtonRow>
          </Card>
          <H2>Ștergerea contului</H2>
          <Card>
            <Tiny>
              Ștergerea elimină definitiv contul, profilul, sesiunile, greșelile, vocabularul și rapoartele salvate.
            </Tiny>
            <Field
              label="Parola contului"
              value={accountPassword}
              onChange={setAccountPassword}
              secure
              autoComplete="password"
            />
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button
                title="Șterge definitiv contul"
                variant="danger"
                icon="trash"
                busy={deletingAccount}
                onPress={() => void doDeleteAccount()}
              />
            </ButtonRow>
          </Card>
          {isAdminUid(user?.uid) && (
            <>
              <H2>Administrare</H2>
              <Card>
                <Tiny>Doar contul tău vede această secțiune.</Tiny>
                <ButtonRow style={{ marginBottom: 0 }}>
                  <Button title="Deschide Admin Center" variant="primary" icon="shield" onPress={() => router.push('/admin')} />
                </ButtonRow>
              </Card>
            </>
          )}
          <H2>Confidențialitate</H2>
          <Card>
            <Tiny>
              Progresul tău este sincronizat în siguranță. Înregistrările audio sunt folosite numai pentru transcriere
              și evaluare și nu sunt păstrate.
            </Tiny>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Politica de confidențialitate" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/privacy.html`)} />
              <Button title="Instrucțiuni ștergere cont" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/delete-account.html`)} />
              <Button title="Termeni de utilizare" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/terms.html`)} />
              <Button title="Suport" onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/support.html`)} />
            </ButtonRow>
          </Card>
        </>
      )}
    </Screen>
  );
}

// ---------- Tabul „Date": statistici utile + backup ----------

interface DataStats {
  sessions: Session[];
  mistakes: Mistake[];
  vocab: VocabItem[];
  pron: PronunciationResult[];
  reportsCount: number;
}

function DataTab({ profile, onExport, onImport, onWipe }: {
  profile: Profile | null;
  onExport: () => void;
  onImport: () => void;
  onWipe: () => void;
}) {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSessions(), getMistakes(), getVocab(), getPronResults(), getReports()])
      .then(([sessions, mistakes, vocab, pron, reports]) =>
        setStats({ sessions, mistakes, vocab, pron, reportsCount: reports.length })
      )
      .catch(() => setError('Nu am putut încărca datele de progres. Încearcă din nou.'));
  }, []);

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!stats || !profile) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <Spinner />
        <Tiny>Se încarcă statisticile…</Tiny>
      </View>
    );
  }

  const { sessions, mistakes, vocab, pron } = stats;
  const totalMinutes = Math.round(sessions.reduce((a, s) => a + s.userSpeakingSec, 0) / 60);
  const totalWords = sessions.reduce((a, s) => a + s.wordCount, 0);
  const activeMistakes = mistakes.filter((m) => m.status !== 'mastered');
  const dueMistakes = activeMistakes.filter((m) => isDue(m.review));
  const masteredMistakes = mistakes.length - activeMistakes.length;
  const activeVocab = vocab.filter((v) => v.activeScore >= 60);
  const dueVocab = vocab.filter((v) => isDue(v.review));
  const recentPron = pron.slice(-30);
  const avgPron = recentPron.length ? Math.round(recentPron.reduce((a, r) => a + r.score, 0) / recentPron.length) : null;
  const last = sessions[sessions.length - 1];
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const programDay = Math.max(1, Math.floor((Date.now() - new Date(profile.startDate).getTime()) / 86400000) + 1);

  return (
    <>
      <H2>Progresul tău în cifre</H2>
      <StatGrid>
        <StatTile value={profile.currentLevel} label={`nivel curent → ${profile.targetLevel}`} />
        <StatTile value={profile.xp} label="XP total" />
        <StatTile value={profile.streak} label="zile streak" />
        <StatTile value={Math.min(programDay, programDuration)} label={`ziua din programul de ${programDuration}`} />
      </StatGrid>

      <H2>Vorbire</H2>
      <Card>
        <KvRow k="Sesiuni totale" v={String(sessions.length)} />
        <KvRow k="Minute vorbite (total)" v={String(totalMinutes)} />
        <KvRow k="Cuvinte rostite (total)" v={String(totalWords)} />
        <KvRow k="Ultima sesiune" v={last ? `${last.startedAt.slice(0, 10)} · ${SESSION_TYPE_LABELS_RO[last.type]}` : '—'} last />
      </Card>

      <H2>Memoria de învățare</H2>
      <Card>
        <KvRow k="Greșeli urmărite (active)" v={String(activeMistakes.length)} />
        <KvRow k="Greșeli scadente azi la repetare" v={String(dueMistakes.length)} />
        <KvRow k="Greșeli stăpânite" v={String(masteredMistakes)} />
        <KvRow k="Vocabular salvat" v={String(vocab.length)} />
        <KvRow k="Expresii active (folosite spontan)" v={String(activeVocab.length)} />
        <KvRow k="Vocabular scadent la repetare" v={String(dueVocab.length)} />
        <KvRow k="Exerciții de pronunție" v={String(pron.length)} />
        <KvRow k="Scor mediu pronunție (ultimele 30)" v={avgPron != null ? `${avgPron}%` : '—'} />
        <KvRow k="Rapoarte săptămânale" v={String(stats.reportsCount)} last />
      </Card>

      <H2>Date și siguranță</H2>
      <Card>
        <Tiny>
          Progresul tău este păstrat în siguranță. Poți descărca o copie, restaura un backup sau șterge toate datele de
          învățare.
        </Tiny>
        <ButtonRow style={{ marginBottom: 0 }}>
          <Button title="Export backup" icon="arrowDown" onPress={onExport} />
          <Button title="Import backup" icon="arrowUp" onPress={onImport} />
          <Button title="Șterge tot" variant="danger" icon="trash" onPress={onWipe} />
        </ButtonRow>
      </Card>
    </>
  );
}
