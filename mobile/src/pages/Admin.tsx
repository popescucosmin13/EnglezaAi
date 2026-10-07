// Admin Center — vizibil doar pentru ADMIN_UIDS (src/admin-config.ts). Portat de pe web.
// Datele altor utilizatori sunt accesibile prin regula isAdmin() din firestore.rules;
// creditele OpenRouter vin prin /api/admin (cheia rămâne pe server).

import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import {
  collection,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db as fs } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import { isAdminUid } from '../admin-config';
import { apiError, apiFetch } from '../api/backend';
import type { Profile, Session, Mistake, DailyActivity } from '../types';
import { SESSION_TYPE_LABELS_RO, CATEGORY_LABELS_RO } from '../types';
import { daysAgoStr } from '../logic/metrics';
import { getSettings, saveSettings, saveRemoteSettings, type AppSettings } from '../settings';
import { chatText } from '../api/openrouter';
import { testGoogleTts } from '../audio/tts';
import { Icon } from '../components/Icon';
import SubscriptionAdminPanel from '../components/SubscriptionAdminPanel';
import { AI_USAGE_EVENT, getAiUsageSummary } from '../logic/ai-usage';
import { on } from '../events';
import { Screen, H1, H2, H3, Card, Banner, Button, ButtonRow, Tiny, Muted, Field, Select, StatGrid, StatTile, Pill, Spinner, confirm } from '../ui';
import { usePalette } from '../theme';

const USER_COLLECTIONS = [
  'sessions', 'mistakes', 'vocab', 'plans', 'pron', 'activity', 'reports', 'tests', 'lessons',
  'situations', 'quizzes', 'meta', 'pronBank', 'wordExplain', 'messageExplain', 'quizCues',
];

interface UserRow {
  uid: string;
  profile: Profile & { email?: string };
  sessions: number;
  minutes: number;
  mistakes: number;
  vocab: number;
}

interface OpenRouterInfo {
  key: { label?: string; usage?: number; limit?: number | null; is_free_tier?: boolean } | null;
  credits: { total_credits?: number; total_usage?: number } | null;
}

interface UserDetail {
  recentSessions: Session[];
  topMistakes: Mistake[];
  weekActivity: DailyActivity[];
}

interface BackendStatus {
  services: { openrouter: boolean; googleAi: boolean; azure: boolean; grammar: boolean; compatibleTts: boolean; revenueCat: boolean };
  server: { firebaseProjectId: string; azureRegion: string; grammarEndpoint: string; uidRestricted: boolean; subscriptionEnforcement: boolean; appUrl: string };
}

function ConfigRow({ label, value, ready, fallback, warning = false }: { label: string; value: string; ready: boolean; fallback?: string; warning?: boolean }) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: p.border,
        borderRadius: 13,
        backgroundColor: p.bgSoft,
        marginVertical: 4,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          marginTop: 4,
          backgroundColor: ready ? p.success : warning ? p.warn : p.danger,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: p.ink }}>{label}</Text>
        <Text style={{ fontSize: 12.5, color: p.ink2, marginVertical: 2 }}>{value}</Text>
        <Text style={{ fontSize: 11, color: p.muted }}>
          {ready ? 'configurat' : warning ? 'protecție recomandată' : fallback ?? 'neconfigurat'}
        </Text>
      </View>
    </View>
  );
}

export default function Admin() {
  const p = usePalette();
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [openRouter, setOpenRouter] = useState<OpenRouterInfo | null>(null);
  const [orError, setOrError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [deleting, setDeleting] = useState('');

  // configurația globală AI/voce (se aplică tuturor utilizatorilor)
  const [s, setS] = useState<AppSettings>(getSettings());
  const [cfgDirty, setCfgDirty] = useState(false);
  const [cfgMsg, setCfgMsg] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [azureBusy, setAzureBusy] = useState(false);
  const [azureMsg, setAzureMsg] = useState('');
  const [googleTtsBusy, setGoogleTtsBusy] = useState(false);
  const [googleTtsMsg, setGoogleTtsMsg] = useState('');
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [statusBusy, setStatusBusy] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [aiUsage, setAiUsage] = useState(() => getAiUsageSummary(7));

  const isAdmin = isAdminUid(user?.uid);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUsers();
    void loadOpenRouter();
    void loadBackendStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    return on(AI_USAGE_EVENT, () => setAiUsage(getAiUsageSummary(7)));
  }, []);

  function upd<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setCfgDirty(true);
    setCfgMsg('');
  }

  async function saveConfig() {
    setCfgMsg('');
    try {
      saveSettings(s); // aplicare imediată pe device-ul adminului
      await saveRemoteSettings(s); // config global — ceilalți îl primesc la următorul refresh/login
      setCfgDirty(false);
      setCfgMsg('Configurația a fost salvată pentru toți utilizatorii.');
    } catch (e: any) {
      setCfgMsg(String(e?.message ?? e));
    }
  }

  async function loadBackendStatus() {
    setStatusBusy(true);
    setStatusError('');
    try {
      const res = await apiFetch('status');
      if (!res.ok) throw await apiError(res, 'Configurația serverului', true);
      setBackendStatus(await res.json());
    } catch (e: any) {
      setStatusError(String(e?.message ?? e));
    } finally {
      setStatusBusy(false);
    }
  }

  async function testKey() {
    setTestBusy(true);
    setCfgMsg('');
    try {
      const r = await chatText([{ role: 'user', content: 'Reply with exactly: OK' }], { feature: 'admin_test', maxTokens: 32 });
      setCfgMsg(r.includes('OK') ? 'Backend-ul OpenRouter funcționează.' : `Răspuns neașteptat: ${r.slice(0, 80)}`);
    } catch (e: any) {
      setCfgMsg(String(e?.message ?? e));
    }
    setTestBusy(false);
  }

  async function testAzure() {
    setAzureBusy(true);
    setAzureMsg('');
    try {
      const res = await apiFetch('azure', { method: 'POST', body: JSON.stringify({ test: true }) });
      if (!res.ok) throw await apiError(res, 'Azure Speech', true);
      setAzureMsg('Backend-ul Azure Speech funcționează.');
    } catch (e: any) {
      setAzureMsg(String(e?.message ?? e));
    }
    setAzureBusy(false);
  }

  async function testGoogleVoice() {
    setGoogleTtsBusy(true);
    setGoogleTtsMsg('');
    try {
      await testGoogleTts();
      setGoogleTtsMsg('Backend-ul funcționează și vocea Google a fost redată.');
    } catch (e: any) {
      setGoogleTtsMsg(String(e?.message ?? e));
    }
    setGoogleTtsBusy(false);
  }

  async function loadUsers() {
    setBusy(true);
    setError('');
    try {
      const snap = await getDocs(collection(fs, 'users'));
      const result: UserRow[] = [];
      for (const d of snap.docs) {
        const uid = d.id;
        const sessCol = collection(fs, 'users', uid, 'sessions');
        // agregate pe server: numărăm și însumăm fără să citim documentele
        const [sess, mist, voc, speak] = await Promise.all([
          getCountFromServer(sessCol),
          getCountFromServer(collection(fs, 'users', uid, 'mistakes')),
          getCountFromServer(collection(fs, 'users', uid, 'vocab')),
          getAggregateFromServer(sessCol, { speakSec: sum('userSpeakingSec') }),
        ]);
        result.push({
          uid,
          profile: d.data() as UserRow['profile'],
          sessions: sess.data().count,
          mistakes: mist.data().count,
          vocab: voc.data().count,
          minutes: Math.round((speak.data().speakSec ?? 0) / 60),
        });
      }
      result.sort((a, b) => (b.profile.lastActiveDay || '').localeCompare(a.profile.lastActiveDay || ''));
      setRows(result);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function loadOpenRouter() {
    setOrError('');
    try {
      const res = await apiFetch('admin', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw await apiError(res, 'Admin', true);
      setOpenRouter(await res.json());
    } catch (e: any) {
      setOrError(String(e?.message ?? e));
    }
  }

  async function toggleDetail(uid: string) {
    if (expanded === uid) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(uid);
    setDetail(null);
    setDetailBusy(true);
    try {
      const [sessSnap, mistSnap, actSnap] = await Promise.all([
        getDocs(query(collection(fs, 'users', uid, 'sessions'), orderBy('startedAt', 'desc'), limit(10))),
        getDocs(query(collection(fs, 'users', uid, 'mistakes'), orderBy('occurrenceCount', 'desc'), limit(10))),
        getDocs(query(collection(fs, 'users', uid, 'activity'), where('date', '>=', daysAgoStr(7)))),
      ]);
      setDetail({
        recentSessions: sessSnap.docs.map((d) => d.data() as Session),
        topMistakes: mistSnap.docs.map((d) => d.data() as Mistake),
        weekActivity: actSnap.docs.map((d) => d.data() as DailyActivity).sort((a, b) => b.date.localeCompare(a.date)),
      });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setDetailBusy(false);
  }

  async function deleteUserData(uid: string) {
    if (uid === user?.uid) return; // propriile date se șterg din Setări → Date
    const target = rows.find((r) => r.uid === uid);
    const label = target?.profile.email || uid;
    if (!(await confirm(`Ștergi TOATE datele utilizatorului ${label}? Acțiunea nu poate fi anulată.`))) return;
    if (!(await confirm('Ești sigur? Sesiunile, greșelile, vocabularul și progresul acestui utilizator dispar definitiv.'))) return;
    setDeleting(uid);
    try {
      const refs = [];
      for (const name of USER_COLLECTIONS) {
        const snap = await getDocs(collection(fs, 'users', uid, name));
        refs.push(...snap.docs.map((d) => d.ref));
      }
      refs.push(doc(fs, 'users', uid));
      // un batch Firestore acceptă max 500 de operații
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(fs);
        for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
        await batch.commit();
      }
      setRows((prev) => prev.filter((r) => r.uid !== uid));
      if (expanded === uid) {
        setExpanded(null);
        setDetail(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setDeleting('');
  }

  if (!isAdmin) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="shieldCheck" size={24} />
          <H1 style={{ marginVertical: 0 }}>Admin Center</H1>
        </View>
        <Banner kind="error">Acest cont nu are drepturi de administrare.</Banner>
        <ButtonRow>
          <Button title="Înapoi acasă" variant="primary" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  const today = daysAgoStr(0);
  const weekAgo = daysAgoStr(7);
  const totals = {
    users: rows.length,
    activeToday: rows.filter((r) => r.profile.lastActiveDay === today).length,
    activeWeek: rows.filter((r) => (r.profile.lastActiveDay || '') >= weekAgo).length,
    sessions: rows.reduce((a, r) => a + r.sessions, 0),
    minutes: rows.reduce((a, r) => a + r.minutes, 0),
  };
  const credits = openRouter?.credits;
  const keyInfo = openRouter?.key;
  const remaining = credits?.total_credits != null && credits?.total_usage != null
    ? credits.total_credits - credits.total_usage
    : null;
  const topUsageFeatures = Object.entries(aiUsage.byFeature)
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .slice(0, 6);

  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildDate = (Constants.expoConfig?.extra as any)?.buildDate ?? '';

  const checkboxRow = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 }}>
      <Switch value={value} onValueChange={onChange} />
      <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>{label}</Text>
    </View>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Icon name="shieldCheck" size={24} />
          <H1 style={{ marginVertical: 0 }}>Admin Center</H1>
        </View>
        <Button
          title="↻"
          small
          onPress={() => {
            void loadUsers();
            void loadOpenRouter();
            setAiUsage(getAiUsageSummary(7));
          }}
          disabled={busy}
        />
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <H2>Credite OpenRouter</H2>
      <Card>
        {orError ? <Banner kind="error">{orError}</Banner> : null}
        {!openRouter && !orError && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <Muted>Se citesc creditele…</Muted>
          </View>
        )}
        {openRouter && (
          <StatGrid>
            <StatTile value={remaining != null ? `$${remaining.toFixed(2)}` : '—'} label="credite rămase" />
            <StatTile value={credits?.total_usage != null ? `$${credits.total_usage.toFixed(2)}` : '—'} label="consum total cont" />
            <StatTile value={keyInfo?.usage != null ? `$${keyInfo.usage.toFixed(2)}` : '—'} label="consum pe cheie" />
            <StatTile value={keyInfo?.limit != null ? `$${keyInfo.limit}` : '∞'} label="limita cheii" />
          </StatGrid>
        )}
      </Card>

      <SubscriptionAdminPanel />

      <H2>Consum AI — ultimele 7 zile pe acest dispozitiv</H2>
      <Card>
        <StatGrid>
          <StatTile value={aiUsage.totalTokens.toLocaleString('ro-RO')} label="tokeni totali" />
          <StatTile value={aiUsage.promptTokens.toLocaleString('ro-RO')} label="tokeni input" />
          <StatTile value={aiUsage.completionTokens.toLocaleString('ro-RO')} label="tokeni output" />
          <StatTile value={aiUsage.cachedTokens.toLocaleString('ro-RO')} label="tokeni din cache" />
          <StatTile value={aiUsage.fallbacks} label="fallback-uri" />
          <StatTile value={aiUsage.retries} label="retry-uri" />
        </StatGrid>
        {topUsageFeatures.length > 0 ? (
          topUsageFeatures.map(([feature, usage], i) => (
            <View
              key={feature}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 9,
                borderBottomWidth: i < topUsageFeatures.length - 1 ? 1 : 0,
                borderBottomColor: p.border,
              }}
            >
              <Text style={{ flex: 1, color: p.ink, fontSize: 14 }}>{feature}</Text>
              <Tiny>
                {usage.totalTokens.toLocaleString('ro-RO')} tokeni · {usage.requests} apeluri
                {usage.fallbacks ? ` · ${usage.fallbacks} fallback` : ''}
              </Tiny>
            </View>
          ))
        ) : (
          <Tiny style={{ marginTop: 8 }}>Nu există încă apeluri măsurate pe acest dispozitiv. Contorizarea începe cu următorul apel AI.</Tiny>
        )}
        <Tiny style={{ marginTop: 6 }}>Nu sunt salvate prompturi sau conversații în această telemetrie; numai totaluri tehnice returnate de furnizor.</Tiny>
      </Card>

      <H2>Configurație AI & Voce — globală</H2>
      <Card>
        <Tiny>
          Modificările se aplică <Text style={{ fontWeight: '700' }}>tuturor utilizatorilor</Text> (config/app în Firestore);
          ei le primesc la următoarea deschidere a aplicației. Cheile API rămân doar în Vercel.
        </Tiny>
        {cfgMsg ? <Banner kind="info">{cfgMsg}</Banner> : null}
        <Field label="Model conversație (top — profesorul)" value={s.chatModel} onChange={(v) => upd('chatModel', v.trim())} autoCapitalize="none" />
        <Field label="Model utilitar (economic — rezumate, analiză, traduceri, fișe)" value={s.utilityModel} onChange={(v) => upd('utilityModel', v.trim())} autoCapitalize="none" />
        <Field
          label="Model gratuit (:free — sarcini de fundal; gol = dezactivat, eșecurile cad pe modelul utilitar)"
          value={s.freeModel}
          onChange={(v) => upd('freeModel', v.trim())}
          placeholder="ex: meta-llama/llama-3.3-70b-instruct (gol = dezactivat)"
          autoCapitalize="none"
        />
        <Field label="Model transcriere (cu input audio)" value={s.sttModel} onChange={(v) => upd('sttModel', v.trim())} autoCapitalize="none" />
        <Select
          label="Speech-to-Text"
          value={s.sttProvider}
          onChange={(v) => upd('sttProvider', v as AppSettings['sttProvider'])}
          options={[
            { value: 'openrouter', label: 'OpenRouter (fidel, păstrează greșelile)' },
            { value: 'webspeech', label: 'Web Speech (doar pe web; pe telefon se folosește tot cloud-ul)' },
          ]}
        />
        <Select
          label="Text-to-Speech"
          value={s.ttsProvider}
          onChange={(v) => upd('ttsProvider', v as AppSettings['ttsProvider'])}
          options={[
            { value: 'browser', label: 'Vocea de sistem (gratuit)' },
            { value: 'google-ai', label: 'Google AI Studio TTS (română naturală, free tier)' },
            { value: 'openai-compatible', label: 'API OpenAI-compatibil' },
          ]}
        />
        {s.ttsProvider === 'google-ai' && (
          <>
            <Field label="Model TTS Google" value={s.googleTtsModel} onChange={(v) => upd('googleTtsModel', v.trim())} autoCapitalize="none" />
            <Select
              label="Voce Google"
              value={s.googleTtsVoice}
              onChange={(v) => upd('googleTtsVoice', v)}
              options={[
                { value: 'Kore', label: 'Kore — feminină, calmă' },
                { value: 'Aoede', label: 'Aoede — feminină, naturală' },
                { value: 'Leda', label: 'Leda — feminină, caldă' },
                { value: 'Zephyr', label: 'Zephyr — feminină, luminoasă' },
                { value: 'Sulafat', label: 'Sulafat — feminină, matură' },
                { value: 'Charon', label: 'Charon — masculină, calmă' },
                { value: 'Puck', label: 'Puck — masculină, energică' },
                { value: 'Orus', label: 'Orus — masculină, fermă' },
              ]}
            />
            {checkboxRow('Pe desktop, Google doar pentru română; engleza rămâne gratuită local', s.googleTtsRomanianOnly, (v) => upd('googleTtsRomanianOnly', v))}
            {checkboxRow('Pe telefon, Google și pentru engleză (voce mai naturală, consum mai mare)', s.googleTtsMobileEnglish, (v) => upd('googleTtsMobileEnglish', v))}
          </>
        )}
        {s.ttsProvider === 'openai-compatible' && (
          <>
            <Field label="Model TTS" value={s.ttsModel} onChange={(v) => upd('ttsModel', v.trim())} autoCapitalize="none" />
            <Field label="Voce TTS" value={s.ttsVoice} onChange={(v) => upd('ttsVoice', v.trim())} autoCapitalize="none" />
          </>
        )}
        <ButtonRow style={{ marginBottom: 0 }}>
          <Button
            title={cfgDirty ? 'Salvează pentru toți' : 'Salvat'}
            variant="primary"
            icon={cfgDirty ? 'save' : 'check'}
            onPress={saveConfig}
            disabled={!cfgDirty}
          />
          <Button title={testBusy ? 'Se testează…' : 'Testează AI'} busy={testBusy} onPress={testKey} disabled={testBusy || cfgDirty} />
          <Button
            title={googleTtsBusy ? 'Se generează…' : 'Testează vocea'}
            icon={googleTtsBusy ? undefined : 'volume'}
            busy={googleTtsBusy}
            onPress={testGoogleVoice}
            disabled={googleTtsBusy || cfgDirty}
          />
          <Button title={azureBusy ? 'Se testează…' : 'Testează Azure'} busy={azureBusy} onPress={testAzure} disabled={azureBusy} />
        </ButtonRow>
        {googleTtsMsg ? <Tiny style={{ marginTop: 6 }}>{googleTtsMsg}</Tiny> : null}
        {azureMsg ? <Tiny style={{ marginTop: 6 }}>{azureMsg}</Tiny> : null}
      </Card>

      <H2>Starea serviciilor</H2>
      <Card>
        {statusBusy && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <Tiny>Se citește configurația din Vercel…</Tiny>
          </View>
        )}
        {statusError ? <Banner kind="error">{statusError}</Banner> : null}
        {backendStatus && (
          <>
            <ConfigRow label="OpenRouter" value={s.chatModel} ready={backendStatus.services.openrouter} />
            <ConfigRow label="Model utilitar" value={s.utilityModel} ready={backendStatus.services.openrouter} />
            <ConfigRow
              label="Model gratuit"
              value={s.freeModel || 'dezactivat — se folosește modelul utilitar'}
              ready={backendStatus.services.openrouter}
              fallback="fallback automat pe modelul utilitar"
            />
            <ConfigRow
              label="Transcriere"
              value={s.sttModel}
              ready={backendStatus.services.openrouter}
            />
            <ConfigRow label="Analiză gramatică" value="Evaluator AI în batch + LanguageTool automat" ready={backendStatus.services.openrouter && backendStatus.services.grammar} />
            <ConfigRow
              label="Voce"
              value={
                s.ttsProvider === 'google-ai'
                  ? `Google ${s.googleTtsModel} · ${s.googleTtsVoice}${s.googleTtsMobileEnglish ? ' · engleză automată pe telefon' : ''}`
                  : s.ttsProvider === 'browser'
                    ? 'Vocea de sistem'
                    : `${s.ttsModel} · ${s.ttsVoice}`
              }
              ready={s.ttsProvider === 'browser' || (s.ttsProvider === 'google-ai' ? backendStatus.services.googleAi : backendStatus.services.compatibleTts)}
            />
            <ConfigRow label="Pronunție" value={`Azure · ${backendStatus.server.azureRegion}`} ready={backendStatus.services.azure} fallback="fallback STT-diff" />
            <ConfigRow label="Gramatică" value={backendStatus.server.grammarEndpoint} ready={backendStatus.services.grammar} />
            <ConfigRow label="Firebase" value={backendStatus.server.firebaseProjectId} ready={backendStatus.server.firebaseProjectId !== 'neconfigurat'} />
            <ConfigRow label="RevenueCat Admin" value="clienți, abonamente, achiziții și venituri" ready={backendStatus.services.revenueCat} fallback="configurează cheia secretă v2 numai în Vercel" />
            <ConfigRow label="Acces API" value={backendStatus.server.uidRestricted ? 'Doar UID-ul permis' : 'Orice cont Firebase autentificat'} ready />
            <ConfigRow label="Protecție Pro server-side" value={backendStatus.server.subscriptionEnforcement ? 'entitlement RevenueCat obligatoriu pentru API-urile AI' : 'dezactivată'} ready={backendStatus.server.subscriptionEnforcement} fallback="activează înainte de lansarea production" />
            <ConfigRow label="Domeniu backend" value={backendStatus.server.appUrl} ready />
            <Tiny style={{ marginVertical: 6 }}>Cheile sunt afișate numai ca „configurat/neconfigurat”; valorile lor nu părăsesc Vercel.</Tiny>
          </>
        )}
        <ButtonRow style={{ marginBottom: 0 }}>
          <Button title={statusBusy ? 'Se verifică…' : '↻ Reîncarcă configurația'} busy={statusBusy} onPress={loadBackendStatus} disabled={statusBusy} />
        </ButtonRow>
      </Card>

      <H2>Aplicația</H2>
      <Tiny>
        Versiune <Text style={{ fontWeight: '700' }}>v{appVersion}</Text>
        {buildDate ? ` · build ${buildDate}` : ''} · nativ (Expo)
      </Tiny>
      <StatGrid>
        <StatTile value={totals.users} label="utilizatori" />
        <StatTile value={totals.activeToday} label="activi azi" />
        <StatTile value={totals.activeWeek} label="activi (7 zile)" />
        <StatTile value={totals.sessions} label="sesiuni totale" />
        <StatTile value={totals.minutes} label="minute vorbite" />
      </StatGrid>

      <H2>Utilizatori</H2>
      {busy && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <Muted>Se încarcă utilizatorii…</Muted>
        </View>
      )}
      {rows.map((r) => (
        <Card key={r.uid}>
          <Pressable onPress={() => void toggleDetail(r.uid)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontWeight: '700', color: p.ink, flexShrink: 1 }}>{r.profile.email || r.uid}</Text>
                {r.uid === user?.uid && <Pill kind="badge">tu</Pill>}
              </View>
              <Tiny>
                {r.profile.currentLevel} → {r.profile.targetLevel} · {r.profile.xp ?? 0} XP · streak {r.profile.streak ?? 0} ·
                activ ultima dată: {r.profile.lastActiveDay || 'niciodată'}
              </Tiny>
              <Tiny>
                {r.sessions} sesiuni · {r.minutes} min vorbite · {r.mistakes} greșeli în hartă · {r.vocab} cuvinte
                {!r.profile.onboarded ? ' · ⚠ onboarding neterminat' : ''}
                {r.profile.onboarded && !r.profile.testDone ? ' · test de nivel nefăcut' : ''}
              </Tiny>
            </View>
            <Icon name={expanded === r.uid ? 'chevronUp' : 'chevronDown'} size={17} color={p.muted} />
          </Pressable>

          {expanded === r.uid && (
            <View style={{ marginTop: 10 }}>
              {detailBusy && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Spinner />
                  <Tiny>Se încarcă detaliile…</Tiny>
                </View>
              )}
              {detail && (
                <>
                  <Tiny>
                    UID: {r.uid} · obiectiv: {r.profile.mainObjective} · început: {r.profile.startDate}
                  </Tiny>
                  <H3>Ultimele sesiuni</H3>
                  {detail.recentSessions.length === 0 && <Tiny>Nicio sesiune încă.</Tiny>}
                  {detail.recentSessions.map((sess) => (
                    <View key={sess.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <Text style={{ flex: 1, color: p.ink, fontSize: 13.5 }}>
                        {sess.startedAt.slice(0, 10)} · {SESSION_TYPE_LABELS_RO[sess.type] ?? sess.type}
                        {sess.scenarioTitle ? ` · ${sess.scenarioTitle}` : ''}
                      </Text>
                      <Tiny>
                        {Math.round(sess.durationSec / 60)} min · {sess.errorCount} greșeli
                      </Tiny>
                    </View>
                  ))}
                  <H3>Greșeli frecvente</H3>
                  {detail.topMistakes.length === 0 && <Tiny>Nimic în harta greșelilor.</Tiny>}
                  {detail.topMistakes.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <Text style={{ flex: 1, color: p.ink, fontSize: 13.5 }}>
                        „{m.original.slice(0, 60)}” → „{m.corrected.slice(0, 60)}”
                      </Text>
                      <Tiny>
                        {CATEGORY_LABELS_RO[m.category] ?? m.category} · {m.occurrenceCount}x · {m.status}
                      </Tiny>
                    </View>
                  ))}
                  <H3>Activitate (7 zile)</H3>
                  {detail.weekActivity.length === 0 && <Tiny>Nicio activitate în ultima săptămână.</Tiny>}
                  {detail.weekActivity.map((a) => (
                    <View key={a.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <Text style={{ flex: 1, color: p.ink, fontSize: 13.5 }}>{a.date}</Text>
                      <Tiny>
                        {Math.round(a.speakingSec / 60)} min · {a.sessionCount} sesiuni · {a.xp} XP{a.lessonDone ? ' · lecție ✓' : ''}
                      </Tiny>
                    </View>
                  ))}
                  {r.uid !== user?.uid && (
                    <ButtonRow style={{ marginTop: 10, marginBottom: 0 }}>
                      <Button
                        title={deleting === r.uid ? 'Se șterge…' : 'Șterge toate datele utilizatorului'}
                        variant="danger"
                        icon={deleting === r.uid ? undefined : 'trash'}
                        busy={deleting === r.uid}
                        onPress={() => void deleteUserData(r.uid)}
                        disabled={deleting === r.uid}
                      />
                    </ButtonRow>
                  )}
                </>
              )}
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}
