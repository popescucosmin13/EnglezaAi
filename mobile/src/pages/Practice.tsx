// Practică: harta greșelilor (§14), vocabular activ/pasiv (§15), microlecții (§17), pronunție (§18).
// Portat de pe web: Recorder nativ (WAV direct — fără conversie), confirmări native, Sheet-uri.

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { Mistake, MistakeDeepDive, VocabItem, Profile, Microlesson, PronunciationResult } from '../types';
import { CATEGORY_LABELS_RO, STATUS_LABELS_RO, vocabStage, PIPELINE_STAGES_RO, emptyPipeline } from '../types';
import {
  getMistakes,
  defaultProfile,
  deleteMistake,
  getVocab,
  saveVocab,
  getProfile,
  getCachedLesson,
  cacheLesson,
  savePronResult,
  getPronResults,
  newId,
  todayStr,
  bumpActivity,
  updateActivity,
  addXp,
} from '../db/db';
import { isDue, applyReview } from '../srs/ladder';
import { reviewMistake, prioritizeMistakes, dedupeMistakes, markVocabUse, dominantCategory, containsExpression, markMistakePipeline, ensureMistakePromptRo, ensureMistakeDeepDive, ensureTransferTest, evaluateTransfer, evaluateReviewAnswer } from '../logic/engine';
import { GRAMMAR_CURRICULUM, MINIMAL_PAIRS, WORD_STRESS, RHYTHM_SENTENCES } from '../content';
import { getPersonalizedPhrasesDetailed, weakSounds, SOUND_LABELS, type PronPhrase, type PhraseSource } from '../logic/pron';
import { mistakeDisplay } from '../logic/mistake-quality';
import { chatJson } from '../api/openrouter';
import { buildMicrolessonPrompt, isMicrolessonShape } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { assessWithAzure, sttDiffAssessment, type PronAssessment } from '../api/azure';
import { hasOpenRouterKey } from '../settings';
import { BarChart } from '../components/Charts';
import { Icon, type IconName } from '../components/Icon';
import { TappableText } from '../components/TappableText';
import {
  Screen,
  H1,
  H2,
  H3,
  Card,
  Banner,
  Button,
  ButtonRow,
  Chip,
  ChipRow,
  Tiny,
  Muted,
  P,
  Bar,
  Pill,
  StatGrid,
  StatTile,
  Spinner,
  Field,
  TabsBar,
  Sheet,
  IconButton,
  confirm,
} from '../ui';
import { usePalette } from '../theme';

type Tab = 'mistakes' | 'vocab' | 'grammar' | 'pron' | 'listening';
type PracticeTabKey = Tab | 'course';

const PRACTICE_TABS: { key: PracticeTabKey; label: string; icon: IconName }[] = [
  { key: 'mistakes', label: 'Greșeli', icon: 'message' },
  { key: 'vocab', label: 'Vocabular', icon: 'book' },
  { key: 'course', label: 'Curs', icon: 'graduation' },
  { key: 'grammar', label: 'Gramatică', icon: 'clipboard' },
  { key: 'pron', label: 'Pronunție', icon: 'audio' },
  { key: 'listening', label: 'Ascultare', icon: 'headphones' },
];

type PracticeSummary = {
  mistakesDue: number;
  vocabDue: number;
  weakSoundCount: number;
};

const EMPTY_PRACTICE_SUMMARY: PracticeSummary = { mistakesDue: 0, vocabDue: 0, weakSoundCount: 0 };

/** Etichetă mică de scor pe cuvânt (ws-good / ws-mid / ws-bad de pe web). */
function ScoreTag({ label, tone }: { label: string; tone: 'good' | 'mid' | 'bad' }) {
  const p = usePalette();
  const map = {
    good: { bg: p.successSoft, fg: p.success },
    mid: { bg: p.warnSoft, fg: p.warnInk },
    bad: { bg: p.dangerSoft, fg: p.danger },
  } as const;
  const c = map[tone];
  return (
    <View style={{ paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.bg }}>
      <Text style={{ fontWeight: '600', fontSize: 14, color: c.fg }}>{label}</Text>
    </View>
  );
}

export default function Practice({ preview = false }: { preview?: boolean }) {
  const [tab, setTab] = useState<Tab>('mistakes');
  const [profile, setProfile] = useState<Profile | null>(() => preview ? { ...defaultProfile(), onboarded: true, testDone: true, dailyGoalMinutes: 12 } : null);
  const [summary, setSummary] = useState<PracticeSummary>(() => preview ? { mistakesDue: 5, vocabDue: 8, weakSoundCount: 3 } : EMPTY_PRACTICE_SUMMARY);
  const [loadError, setLoadError] = useState('');

  function load() {
    if (preview) return;
    setLoadError('');
    getProfile().then(setProfile).catch((e) => setLoadError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    Promise.all([getMistakes(), getVocab(), weakSounds()])
      .then(([mistakes, vocab, sounds]) => {
        if (cancelled) return;
        setSummary({
          mistakesDue: dedupeMistakes(mistakes).filter((m) => m.status !== 'mastered' && isDue(m.review)).length,
          vocabDue: vocab.filter((v) => isDue(v.review)).length,
          weakSoundCount: sounds.length,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [preview]);

  if (!profile) {
    return (
      <Screen>
        {loadError ? (
          <>
            <Banner kind="error">Nu am putut încărca profilul: {loadError}</Banner>
            <ButtonRow>
              <Button title="Reîncearcă" onPress={load} />
            </ButtonRow>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            <Spinner />
            <Muted>Se încarcă…</Muted>
          </View>
        )}
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mic" size={25} />
        </View>
        <View>
          <H1 style={{ marginVertical: 0, fontSize: 29, letterSpacing: -1.1 }}>Practică</H1>
          <Muted>Planul tău de practică</Muted>
        </View>
      </View>

      <PracticeTabs active={tab} onSelect={(key) => { if (key === 'course') router.push('/grammar'); else setTab(key); }} />

      {tab === 'mistakes' && (
        <>
          <PracticeDashboard
            summary={summary}
            dailyGoalMinutes={profile.dailyGoalMinutes}
            onSelect={setTab}
            onOpenLab={() => router.push('/speaking-lab')}
          />
          <MistakesTab preview={preview} />
        </>
      )}
      {tab === 'vocab' && <><PracticeModuleIntro tab="vocab" summary={summary} /><VocabTab preview={preview} /></>}
      {tab === 'grammar' && <><PracticeModuleIntro tab="grammar" summary={summary} /><GrammarTab profile={profile} /></>}
      {tab === 'pron' && <><PracticeModuleIntro tab="pron" summary={summary} /><PronTab /></>}
      {tab === 'listening' && <><PracticeModuleIntro tab="listening" summary={summary} /><ListeningTab /></>}
    </Screen>
  );
}

function PracticeTabs({ active, onSelect }: { active: PracticeTabKey; onSelect: (key: PracticeTabKey) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', marginHorizontal: -2, marginBottom: 13, paddingVertical: 5 }}>
        {PRACTICE_TABS.map((item) => {
          const selected = item.key === active;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: 52,
                paddingHorizontal: 2,
                paddingVertical: 5,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: selected ? p.primary : 'transparent',
                backgroundColor: selected ? p.primarySoft : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 3,
                opacity: pressed ? 0.72 : 1,
              })}
            >
              <Icon name={item.icon} size={16} color={selected ? p.primaryDeep : p.muted} />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={{ color: selected ? p.primaryDeep : p.muted, fontSize: 9.4, lineHeight: 12, fontWeight: '700', letterSpacing: -0.15 }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
    </View>
  );
}

function PracticeDashboard({
  summary,
  dailyGoalMinutes,
  onSelect,
  onOpenLab,
}: {
  summary: PracticeSummary;
  dailyGoalMinutes: number;
  onSelect: (tab: Tab) => void;
  onOpenLab: () => void;
}) {
  const p = usePalette();
  const priorities = [
    { tab: 'mistakes' as const, icon: 'triangleAlert' as const, title: 'Greșeli de reparat', subtitle: 'Recapitulare țintită', value: summary.mistakesDue },
    { tab: 'vocab' as const, icon: 'book' as const, title: 'Vocabular de activat', subtitle: 'Cuvinte de folosit azi', value: summary.vocabDue },
    { tab: 'pron' as const, icon: 'audio' as const, title: 'Pronunție', subtitle: 'Sunete de exersat', value: summary.weakSoundCount },
  ];
  const activityCount = priorities.filter((item) => item.value > 0).length;
  const workload = summary.mistakesDue + summary.vocabDue + summary.weakSoundCount;
  const workloadRatio = Math.max(0.18, Math.min(0.72, workload * 0.04));

  return (
    <>
      <Card style={{ borderColor: p.borderStrong, borderRadius: 22, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: p.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: p.ink, fontSize: 24, lineHeight: 27, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{dailyGoalMinutes || 12}</Text>
            <Tiny>min</Tiny>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ color: p.ink, fontSize: 18, fontWeight: '800' }}>{activityCount || 3} activități azi</Text>
            <Bar ratio={workloadRatio} />
            <Tiny>{workload > 0 ? 'Plan adaptat progresului tău' : 'Ești la zi — poți consolida ce ai învățat'}</Tiny>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="target" size={19} color={p.primary} />
          </View>
        </View>
      </Card>

      <H2>Priorități pentru azi</H2>
      <View style={{ overflow: 'hidden', borderWidth: 1, borderColor: p.borderStrong, borderRadius: 22, backgroundColor: p.card }}>
        {priorities.map((item, index) => (
          <Pressable
            key={item.tab}
            onPress={() => onSelect(item.tab)}
            style={({ pressed }) => ({
              minHeight: 94,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 13,
              borderBottomWidth: index === priorities.length - 1 ? 0 : 1,
              borderBottomColor: p.border,
              backgroundColor: pressed ? p.primarySoft : 'transparent',
            })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: p.borderStrong, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={item.icon} size={21} color={p.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.ink, fontSize: 15.5, fontWeight: '800' }}>{item.title}</Text>
              <Tiny>{item.subtitle}</Tiny>
              <Bar ratio={Math.max(0.1, Math.min(1, item.value * 0.12))} style={{ marginTop: 9, height: 5 }} />
            </View>
            <Text style={{ minWidth: 22, color: p.violet, fontSize: 20, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] }}>{item.value}</Text>
            <Icon name="arrowUpRight" size={16} color={p.muted} />
          </Pressable>
        ))}
      </View>

      <Card onPress={() => onSelect('mistakes')} style={{ borderColor: p.borderStrong, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: p.borderStrong, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="trending" size={20} color={p.primary} />
          </View>
          <View style={{ flex: 1 }}><Text style={{ color: p.ink, fontWeight: '800', fontSize: 15 }}>Harta personală a greșelilor</Text><Tiny>Vezi tiparele care se repetă</Tiny></View>
          <Icon name="arrowUpRight" size={17} color={p.muted} />
        </View>
      </Card>

      <Pressable onPress={onOpenLab} style={({ pressed }) => ({ marginVertical: 10, borderRadius: 22, overflow: 'hidden', opacity: pressed ? 0.86 : 1 })}>
        <LinearGradient colors={[p.primary, p.violet]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ minHeight: 88, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(15,17,24,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="flask" size={23} color={p.white} />
          </View>
          <View style={{ flex: 1 }}><Text style={{ color: p.white, fontWeight: '800', fontSize: 16 }}>Speaking Lab</Text><Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 12.5, lineHeight: 18 }}>Scene ghidate, pronunție și conversație</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' }}><Text style={{ color: p.white, fontSize: 12.5, fontWeight: '800' }}>Deschide</Text><Icon name="arrowUpRight" size={15} color={p.white} /></View>
        </LinearGradient>
      </Pressable>
    </>
  );
}

function PracticeModuleIntro({ tab, summary }: { tab: Exclude<Tab, 'mistakes'>; summary: PracticeSummary }) {
  const p = usePalette();
  const content: Record<Exclude<Tab, 'mistakes'>, { icon: IconName; eyebrow: string; title: string; subtitle: string; value: string }> = {
    vocab: { icon: 'book', eyebrow: 'ACTIVEAZĂ', title: 'Vocabular', subtitle: 'Recunoaște, pronunță și folosește cuvintele în contexte noi.', value: `${summary.vocabDue} de repetat` },
    grammar: { icon: 'clipboard', eyebrow: 'CLARIFICĂ', title: 'Gramatică', subtitle: 'Lecții recomandate din greșelile și nivelul tău actual.', value: 'Personalizat' },
    pron: { icon: 'audio', eyebrow: 'ROSTEȘTE', title: 'Pronunție', subtitle: 'Lucrează sunetele, accentul, ritmul și fluența.', value: `${summary.weakSoundCount} sunete` },
    listening: { icon: 'headphones', eyebrow: 'ÎNȚELEGE', title: 'Ascultare', subtitle: 'Ascultă fără text, reconstruiește și verifică fiecare cuvânt.', value: 'Scară ghidată' },
  };
  const item = content[tab];
  return (
    <Card style={{ borderColor: p.borderStrong, borderRadius: 22, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: p.borderStrong, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={item.icon} size={21} color={p.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.primaryDeep, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.1 }}>{item.eyebrow}</Text>
          <Text style={{ color: p.ink, fontSize: 16.5, fontWeight: '800' }}>{item.title}</Text>
          <Tiny>{item.subtitle}</Tiny>
        </View>
        <View style={{ paddingVertical: 6, paddingHorizontal: 9, borderRadius: 99, backgroundColor: p.primarySoft }}><Text style={{ color: p.primaryDeep, fontSize: 10.5, fontWeight: '800' }}>{item.value}</Text></View>
      </View>
    </Card>
  );
}

// ============ Harta greșelilor + review (§14) ============
function MistakesTab({ preview = false }: { preview?: boolean }) {
  const p = usePalette();
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [queue, setQueue] = useState<Mistake[]>([]);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<{ wrong: string; correct: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [transferFor, setTransferFor] = useState<Mistake | null>(null);
  const recorder = useRef(new Recorder());

  const load = async () => {
    const all = await getMistakes();
    setMistakes(all);
    setQueue(prioritizeMistakes(all.filter((m) => isDue(m.review) && m.status !== 'mastered')));
  };
  useEffect(() => {
    if (preview) return;
    void load();
  }, [preview]);

  const card = queue[0];
  const cardDisplay = card ? mistakeDisplay(card) : null;

  // Sarcina în română: nu trebuie să-ți amintești contextul — traduci propoziția afișată.
  const [promptRo, setPromptRo] = useState<string | null>(null);
  // Mini-lecția „de ce greșesc aici" + ratingul amânat cât rulează testul de transfer.
  const [deepDive, setDeepDive] = useState<MistakeDeepDive | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [pendingRate, setPendingRate] = useState<{ ok: boolean; fast: boolean } | null>(null);
  useEffect(() => {
    setPromptRo(null);
    setDeepDive(null);
    setDeepBusy(false);
    setPendingRate(null);
    if (!card) return;
    let cancelled = false;
    ensureMistakePromptRo(card).then((pr) => {
      if (!cancelled && pr) setPromptRo(pr);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  function normalize(s: string) {
    return s.toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ').trim();
  }

  async function check() {
    if (!card) return;
    // Acceptă fragmentul corectat, propoziția completă sau o propoziție care conține corectura.
    const targets = [card.correctFragment, card.corrected].filter((t): t is string => Boolean(t));
    const frag = card.correctFragment ? normalize(card.correctFragment) : '';
    setReviewErrors([]);
    if (answer.trim()) {
      const a = normalize(answer);
      const cheapPass = targets.some((t) => a === normalize(t)) || (frag.length > 0 && a.includes(frag));
      // Fragmentul lipsește (sau n-avem AI): verdict determinist, fără apel. Dacă pare corect,
      // confirmăm cu AI că nu mai sunt alte greșeli în propoziție (§ „corect doar dacă e curat").
      if (!cheapPass || !hasOpenRouterKey()) {
        setVerdict(cheapPass);
      } else {
        setChecking(true);
        try {
          const profile = await getProfile();
          const ev = await evaluateReviewAnswer(profile, card, answer, cheapPass);
          setVerdict(ev.verdict);
          setReviewErrors(ev.otherErrors);
        } finally {
          setChecking(false);
        }
      }
    }
    setRevealed(true);
    // etapa „explicată": utilizatorul vede acum corectura + explicația
    void markMistakePipeline(card, 'explained');
  }

  async function completeRate(ok: boolean, fast = false) {
    if (!card) return;
    if (ok && verdict === true) await markMistakePipeline(card, 'repeatedOk'); // a produs efectiv forma corectă
    await reviewMistake(card, ok ? (fast ? 'fast' : 'good') : 'fail');
    if (ok) await updateActivity({ oldMistakeFixed: true });
    setQueue((q) => q.slice(1));
    setAnswer('');
    setRevealed(false);
    setVerdict(null);
    setReviewErrors([]);
    setTransferFor(null);
    setPendingRate(null);
    void load();
  }

  async function rate(ok: boolean, fast = false) {
    if (!card) return;
    // Învățare, nu bifare: după un răspuns bun, regula se aplică imediat într-un context nou.
    // Rulează o singură dată per greșeală (până trece), apoi reviews-urile revin la ritmul normal.
    if (ok && !card.pipeline?.usedInNewContext && !transferFor && hasOpenRouterKey()) {
      setPendingRate({ ok, fast });
      setTransferFor(card);
      return;
    }
    await completeRate(ok, fast);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setAnswer(text);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  /** Corecturile absurde (nume „corectate", termeni schimbați) se pot elimina definitiv. */
  async function removeMistake(m: Mistake) {
    const ok = await confirm(
      `Ștergi definitiv această greșeală?\n„${m.originalFragment ?? m.original}" → „${m.correctFragment ?? m.corrected}"`
    );
    if (!ok) return;
    await deleteMistake(m.id).catch(() => {});
    setQueue((q) => q.filter((x) => x.id !== m.id));
    void load();
  }

  const catCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const m of mistakes) {
    catCounts.set(CATEGORY_LABELS_RO[m.category], (catCounts.get(CATEGORY_LABELS_RO[m.category]) ?? 0) + m.occurrenceCount);
    statusCounts.set(m.status, (statusCounts.get(m.status) ?? 0) + 1);
  }

  const pipelineLine = (m: Mistake) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 }}>
      {PIPELINE_STAGES_RO.map(({ key, label }) => {
        const pipe = m.pipeline ?? emptyPipeline();
        const done = key === 'spontaneousUses' ? pipe.spontaneousUses >= 3 : pipe[key];
        const text = key === 'spontaneousUses' && pipe.spontaneousUses > 0 && pipe.spontaneousUses < 3 ? `spontan ${pipe.spontaneousUses}/3` : label;
        return (
          <Tiny key={key} style={{ opacity: done ? 1 : 0.45, marginRight: 6 }}>
            {done ? '✓' : '○'} {text}
          </Tiny>
        );
      })}
    </View>
  );

  return (
    <>
      {card ? (
        <Card>
          {promptRo ? (
            <>
              <Tiny>De repetat azi: {queue.length} · spune în engleză:</Tiny>
              <Text style={{ fontSize: 17.5, fontWeight: '600', color: p.ink, marginVertical: 6 }}>„{promptRo}"</Text>
              <Tiny style={{ color: p.danger }}>Atunci ai spus: „{cardDisplay?.wrong ?? card.original}"</Tiny>
            </>
          ) : (
            <>
              <Tiny>De repetat azi: {queue.length} · spune/scrie varianta corectă:</Tiny>
              <Text style={{ fontSize: 17.5, color: p.danger, marginVertical: 6 }}>„{cardDisplay?.wrong ?? card.original}"</Text>
            </>
          )}
          {!revealed ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Field value={answer} onChange={setAnswer} placeholder="Varianta corectă…" editable={!checking} />
                </View>
                <Button title="" icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'default'} onPress={mic} disabled={checking} />
              </View>
              {checking ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <Spinner />
                  <Muted>Se verifică răspunsul…</Muted>
                </View>
              ) : (
                <ButtonRow style={{ marginBottom: 0 }}>
                  <Button title="Verifică" variant="primary" onPress={check} />
                </ButtonRow>
              )}
            </>
          ) : (
            <>
              {verdict != null && (
                <Text style={{ color: verdict ? p.success : p.danger, fontWeight: '700', fontSize: 15.5 }}>
                  {verdict ? '✓ Corect!' : reviewErrors.length > 0 ? '✗ Aproape — regula e bună, dar mai ai greșeli:' : '✗ Nu chiar.'}
                </Text>
              )}
              {reviewErrors.length > 0 && (
                <View style={{ borderRadius: 12, padding: 10, marginVertical: 6, backgroundColor: p.dangerSoft }}>
                  {reviewErrors.map((e, i) => (
                    <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginVertical: 2 }}>
                      <Tiny style={{ color: p.danger }}>{e.wrong} → </Tiny>
                      <TappableText text={e.correct} color={p.ink} style={{ fontSize: 13, lineHeight: 18, fontWeight: '700' }} />
                    </View>
                  ))}
                </View>
              )}
              <TappableText
                text={cardDisplay?.right ?? card.corrected}
                sentence={card.corrected}
                color={p.success}
                style={{ fontWeight: '600', fontSize: 17, marginVertical: 4 }}
              />
              {cardDisplay?.contextRight ? (
                <TappableText prefix="În propoziție: " text={cardDisplay.contextRight} color={p.ink2} style={{ fontSize: 14.5, lineHeight: 21 }} />
              ) : null}
              {card.naturalVersion && card.naturalVersion !== cardDisplay?.contextRight ? (
                <TappableText prefix="Natural: " text={card.naturalVersion} color={p.ink2} style={{ fontSize: 14.5, lineHeight: 21 }} />
              ) : null}
              <Tiny style={{ marginTop: 4 }}>{card.explanationRo}</Tiny>
              {!deepDive && hasOpenRouterKey() && (
                <Button
                  title={deepBusy ? 'Se pregătește…' : 'De ce greșesc aici? Explică-mi regula'}
                  variant="ghost"
                  icon={deepBusy ? undefined : 'lightbulb'}
                  busy={deepBusy}
                  disabled={deepBusy}
                  style={{ alignSelf: 'flex-start' }}
                  onPress={async () => {
                    setDeepBusy(true);
                    const d = await ensureMistakeDeepDive(card).catch(() => undefined);
                    setDeepBusy(false);
                    if (d) setDeepDive(d);
                  }}
                />
              )}
              {deepDive && (
                <View style={{ borderRadius: 13, paddingVertical: 11, paddingHorizontal: 14, marginVertical: 8, backgroundColor: p.primarySoft }}>
                  <Text style={{ color: p.primaryDeep, fontSize: 14, marginVertical: 2 }}>
                    <Text style={{ fontWeight: '700' }}>Regula: </Text>
                    {deepDive.ruleRo}
                  </Text>
                  <Text style={{ color: p.primaryDeep, fontSize: 14, marginVertical: 2 }}>
                    <Text style={{ fontWeight: '700' }}>De ce o greșești: </Text>
                    {deepDive.interferenceRo}
                  </Text>
                  {deepDive.examples.map((ex, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 3 }}>
                      <Tiny style={{ flexShrink: 1 }}>
                        • <Text style={{ fontWeight: '700' }}>{ex.en}</Text> — {ex.ro}
                      </Tiny>
                      <IconButton icon="volume" size={14} color={p.primary} onPress={() => void speak(ex.en, 0.92)} />
                    </View>
                  ))}
                </View>
              )}
              {/* Drumul greșelii spre stăpânire — repetarea e doar prima etapă, nu scopul. */}
              {pipelineLine(card)}
              {!transferFor && (
                <ButtonRow style={{ marginBottom: 0 }}>
                  <Button title="N-am știut" variant="danger" onPress={() => void rate(false)} />
                  <Button title="Am știut" onPress={() => void rate(true)} />
                  <Button title="Ușor" variant="success" onPress={() => void rate(true, true)} />
                </ButtonRow>
              )}
              {transferFor && (
                <TransferTest
                  mistake={transferFor}
                  onDone={() => {
                    const pr = pendingRate;
                    void completeRate(pr?.ok ?? true, pr?.fast ?? false);
                  }}
                />
              )}
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Muted>Nimic de repetat acum — greșelile revin după scara: 1, 3, 7, 14, 30, 60 de zile.</Muted>
        </Card>
      )}

      <H2>Harta personală a greșelilor</H2>
      <Card>
        <BarChart items={[...catCounts.entries()].map(([label, value]) => ({ label, value }))} />
      </Card>
      <ChipRow>
        {(['new', 'learning', 'improving', 'almost', 'mastered', 'reappeared'] as const).map((s) => (
          <Chip key={s} label={`${STATUS_LABELS_RO[s]}: ${statusCounts.get(s) ?? 0}`} selected={s === 'mastered'} />
        ))}
      </ChipRow>
      {mistakes
        .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
        .slice(0, 20)
        .map((m) => {
          const d = mistakeDisplay(m);
          return (
            <Card key={m.id} style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>
                  <Text style={{ color: p.danger, textDecorationLine: 'line-through' }}>{d.wrong}</Text>{' '}
                  <Text style={{ color: p.success, fontWeight: '600' }}>{d.right}</Text>
                </Text>
                <IconButton icon="trash" size={15} color={p.muted} onPress={() => void removeMistake(m)} />
              </View>
              {d.contextRight ? <Tiny style={{ opacity: 0.7, marginTop: 2 }}>În propoziție: {d.contextRight}</Tiny> : null}
              <Tiny>
                {CATEGORY_LABELS_RO[m.category]} · {m.occurrenceCount}x · {STATUS_LABELS_RO[m.status]} · {m.review.correctUses}{' '}
                utilizări corecte{m.disputed ? ' · contestată' : ''}
              </Tiny>
              {pipelineLine(m)}
            </Card>
          );
        })}
    </>
  );
}

/** Test de transfer (§P1): aceeași regulă gramaticală, într-un context complet nou. */
function TransferTest({ mistake, onDone }: { mistake: Mistake; onDone: (passed: boolean) => void }) {
  const p = usePalette();
  const [exercise, setExercise] = useState<{ situationRo: string; expectedEn: string; keyWords: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [outcome, setOutcome] = useState<'pass' | 'partial' | 'fail' | null>(null);
  const [otherErrors, setOtherErrors] = useState<{ wrong: string; correct: string }[]>([]);
  const [note, setNote] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const recorder = useRef(new Recorder());

  useEffect(() => {
    (async () => {
      setBusy(true);
      setError('');
      try {
        const profile = await getProfile();
        // reutilizat din greșeală dacă a mai fost generat (§ optimizare tokeni); regenerăm
        // doar la reîncercare explicită după o eroare (attempt > 0), nu la fiecare revenire SRS.
        const ex = await ensureTransferTest(profile, mistake, attempt > 0);
        if (!ex) throw new Error('Exercițiul nu a putut fi generat.');
        setExercise(ex);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mistake.id, attempt]);

  async function submit(text: string) {
    if (!exercise || !text.trim() || evaluating) return;
    setAnswer(text);
    setEvaluating(true);
    try {
      // Evaluare onestă: regula exersată e judecată separat de restul propoziției (§ credit doar dacă e curat).
      const profile = await getProfile();
      const ev = await evaluateTransfer(profile, mistake, exercise, text);
      setOtherErrors(ev.otherErrors);
      setNote(ev.noteRo);
      if (ev.ruleApplied && ev.otherErrors.length === 0) {
        setOutcome('pass');
        await markMistakePipeline(mistake, 'usedInNewContext');
        await addXp(12);
      } else {
        // regula aplicată dar cu alte greșeli = „partial" (fără credit); regula ratată = „fail"
        setOutcome(ev.ruleApplied ? 'partial' : 'fail');
      }
    } finally {
      setEvaluating(false);
    }
  }

  function retry() {
    setOutcome(null);
    setAnswer('');
    setOtherErrors([]);
    setNote('');
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        await submit(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: p.primary, marginTop: 8 }}>
      <Pill kind="badge">Test de transfer</Pill>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {busy && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
          <Spinner />
          <Muted>Se pregătește exercițiul…</Muted>
        </View>
      )}
      {!busy && !exercise && (
        <ButtonRow style={{ marginBottom: 0 }}>
          <Button title="Reîncearcă" icon="rotate" onPress={() => setAttempt((n) => n + 1)} />
          <Button title="Renunț" variant="ghost" onPress={() => onDone(false)} />
        </ButtonRow>
      )}
      {exercise && outcome == null && (
        <>
          <P style={{ marginVertical: 6 }}>{exercise.situationRo}</P>
          <Tiny>Spune sau scrie propoziția în engleză — aceeași regulă, context nou.</Tiny>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Field value={answer} onChange={setAnswer} placeholder="Propoziția ta în engleză…" editable={!evaluating} />
            </View>
            <Button title="" icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'default'} onPress={mic} disabled={evaluating} />
          </View>
          {evaluating ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
              <Spinner />
              <Muted>Se verifică răspunsul…</Muted>
            </View>
          ) : (
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Verifică" variant="primary" onPress={() => void submit(answer)} disabled={!answer.trim()} />
              <Button title="Renunț" variant="ghost" onPress={() => onDone(false)} />
            </ButtonRow>
          )}
        </>
      )}
      {exercise && outcome != null && (
        <>
          <Text style={{ color: outcome === 'pass' ? p.success : outcome === 'partial' ? p.warnInk : p.danger, fontWeight: '700', fontSize: 15.5, marginVertical: 4 }}>
            {outcome === 'pass'
              ? '✓ Transfer reușit! Regula funcționează și în context nou. +12 XP'
              : outcome === 'partial'
                ? '✓ Ai aplicat regula — dar mai sunt greșeli de corectat:'
                : '✗ Regula nu a fost aplicată corect.'}
          </Text>
          {note ? <Tiny>{note}</Tiny> : null}
          {otherErrors.length > 0 && (
            <View style={{ borderRadius: 12, padding: 10, marginVertical: 6, backgroundColor: p.dangerSoft }}>
              {otherErrors.map((e, i) => (
                <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginVertical: 2 }}>
                  <Tiny style={{ color: p.danger }}>{e.wrong} → </Tiny>
                  <TappableText text={e.correct} color={p.ink} style={{ fontSize: 13, lineHeight: 18, fontWeight: '700' }} />
                </View>
              ))}
            </View>
          )}
          <Tiny>Ai spus: „{answer}"</Tiny>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <TappableText prefix="Un răspuns bun: " text={exercise.expectedEn} style={{ fontSize: 13, lineHeight: 18, fontWeight: '700', flexShrink: 1 }} />
            <IconButton icon="volume" size={15} color={p.primary} onPress={() => void speak(exercise.expectedEn, 0.92)} />
          </View>
          <ButtonRow style={{ marginBottom: 0 }}>
            <Button title="Continuă" variant="primary" onPress={() => onDone(outcome === 'pass')} />
            {outcome !== 'pass' && <Button title="Mai încearcă" onPress={retry} />}
          </ButtonRow>
        </>
      )}
    </Card>
  );
}

// ============ Vocabular (§15) ============
function VocabTab({ preview = false }: { preview?: boolean }) {
  const p = usePalette();
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [queue, setQueue] = useState<VocabItem[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [sentence, setSentence] = useState('');
  const [recording, setRecording] = useState(false);
  const [pronRecording, setPronRecording] = useState(false);
  const [useResult, setUseResult] = useState<string | null>(null);
  const [detail, setDetail] = useState<VocabItem | null>(null);
  const recorder = useRef(new Recorder());

  const load = async () => {
    const all = await getVocab();
    setVocab(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setQueue(all.filter((v) => isDue(v.review)));
  };
  useEffect(() => {
    if (preview) return;
    void load();
  }, [preview]);

  const card = queue[0];

  async function rate(ok: boolean) {
    if (!card) return;
    card.review = applyReview(card.review, ok ? 'good' : 'fail');
    if (ok) card.passiveScore = Math.min(100, card.passiveScore + 10);
    await saveVocab(card);
    await bumpActivity('vocabReviews', 1);
    await addXp(ok ? 4 : 1);
    setQueue((q) => q.slice(1));
    setRevealed(false);
    setSentence('');
    setPronRecording(false);
    setUseResult(null);
    void load();
  }

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();

  /** Pasul 3 din activare (§15): folosește cuvântul într-o propoziție proprie, cu voce. */
  async function useInSentence() {
    if (!card) return;
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setSentence(text);
        // verificare riguroasă: expresia întreagă, pe cuvinte complete, minimum 4 cuvinte,
        // și nu exemplul afișat repetat papagalicește
        if (!containsExpression(text, card.word)) {
          setUseResult('Propoziția nu conține cuvântul întreg — mai încearcă.');
        } else if (text.trim().split(/\s+/).length < 4) {
          setUseResult('Prea scurt — spune o propoziție completă (minimum 4 cuvinte).');
        } else if (card.example && normalize(text) === normalize(card.example)) {
          setUseResult('Ai repetat exemplul — construiește o propoziție proprie.');
        } else if (card.usedInSentence && card.personalExample && normalize(text) === normalize(card.personalExample)) {
          setUseResult('Ai spus aceeași propoziție ca data trecută — pentru „context nou" folosește cuvântul într-o situație diferită.');
        } else {
          card.personalExample = text;
          await markVocabUse(card, card.usedInSentence ? 'usedInNewContext' : 'usedInSentence');
          await addXp(8);
          setUseResult('✓ Propoziție acceptată — cuvântul avansează spre vocabularul activ!');
        }
      } catch {
        setUseResult('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  /** Pasul 2 din activare (§15): utilizatorul pronunță efectiv cuvântul, iar aplicația îl verifică. */
  async function pronounceIt() {
    if (!card || recording) return;
    if (pronRecording) {
      setPronRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(card.word));
        await audio.dispose();
        if (containsExpression(text, card.word)) {
          await markVocabUse(card, 'pronounced');
          await addXp(4);
          setUseResult('✓ Pronunție confirmată! Acum folosește-l într-o propoziție.');
        } else {
          setUseResult(`Nu am recunoscut cuvântul${text.trim() ? ` (am auzit: „${text.trim()}")` : ''} — ascultă modelul și mai încearcă.`);
        }
      } catch {
        setUseResult('Nu am putut transcrie — mai încearcă.');
      }
      return;
    }
    await speak(card.word, 0.9); // întâi modelul, apoi înregistrăm utilizatorul
    try {
      await recorder.current.start();
      setPronRecording(true);
      setUseResult('Acum pronunță tu cuvântul, apoi apasă din nou.');
    } catch {
      setUseResult('Nu am acces la microfon.');
    }
  }

  const active = vocab.filter((v) => v.activeScore >= 60).length;
  const passive = vocab.length - active;

  return (
    <>
      <StatGrid>
        <StatTile value={active} label="vocabular ACTIV" />
        <StatTile value={passive} label="vocabular pasiv" />
        <StatTile value={queue.length} label="de repetat azi" />
      </StatGrid>
      <Tiny style={{ marginTop: 8 }}>
        Un cuvânt devine activ doar după: recunoscut → pronunțat → folosit în propoziție → context nou → spontan în conversație.
      </Tiny>

      {card && (
        <Card>
          <Text style={{ fontSize: 21, fontWeight: '700', color: p.primaryDeep }}>{card.word}</Text>
          <Tiny>
            {vocabStage(card)} · activ {card.activeScore}/100
          </Tiny>
          {!revealed ? (
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Arată traducerea" variant="primary" onPress={() => setRevealed(true)} />
              <Button title="" variant="ghost" icon="volume" onPress={() => void speak(card.word, 0.9)} />
            </ButtonRow>
          ) : (
            <>
              <Text style={{ fontWeight: '600', color: p.ink, fontSize: 16, marginVertical: 4 }}>
                {card.translation || '(fără traducere salvată)'}
              </Text>
              {card.example ? <Tiny>„{card.example}"</Tiny> : null}
              <ButtonRow>
                <Button title="Nu-l știam" variant="danger" onPress={() => void rate(false)} />
                <Button title="Îl știu" variant="success" onPress={() => void rate(true)} />
              </ButtonRow>
              <ButtonRow style={{ marginTop: 0, marginBottom: 0 }}>
                <Button
                  title={pronRecording ? 'Am pronunțat' : 'Pronunță-l'}
                  variant={pronRecording ? 'danger' : 'default'}
                  icon={pronRecording ? 'stop' : 'audio'}
                  onPress={pronounceIt}
                  disabled={recording}
                />
                <Button
                  title={recording ? 'Oprește' : 'Folosește-l într-o propoziție'}
                  variant={recording ? 'danger' : 'default'}
                  icon={recording ? 'stop' : 'mic'}
                  onPress={useInSentence}
                  disabled={pronRecording}
                />
              </ButtonRow>
              {sentence ? <Tiny style={{ marginTop: 6 }}>Ai spus: „{sentence}"</Tiny> : null}
              {useResult ? <Banner kind="info">{useResult}</Banner> : null}
            </>
          )}
        </Card>
      )}

      <H2>Toate cuvintele ({vocab.length})</H2>
      {vocab.slice(0, 30).map((v) => (
        <Card key={v.id} style={{ padding: 12 }} onPress={() => setDetail(v)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: p.ink, fontSize: 15 }} numberOfLines={1}>
              <Text style={{ fontWeight: '700' }}>{v.word}</Text> <Tiny>{v.translation}</Tiny>
            </Text>
            <Pill kind={v.activeScore >= 60 ? 'badge' : 'badgeSoft'}>{v.activeScore >= 60 ? 'ACTIV' : vocabStage(v)}</Pill>
          </View>
          <Bar ratio={v.activeScore / 100} style={{ marginTop: 6 }} />
        </Card>
      ))}

      {detail && (
        <Sheet visible onClose={() => setDetail(null)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <H3 style={{ marginVertical: 0, flexShrink: 1 }}>{detail.word}</H3>
            <IconButton icon="volume" color={p.primary} onPress={() => void speak(detail.word, 0.9)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
            <Text style={{ fontWeight: '700', color: p.ink, fontSize: 16 }}>{detail.translation}</Text>
            {detail.cefrLevel && <Pill kind="badgeSoft">{detail.cefrLevel}</Pill>}
          </View>
          {detail.example ? <Muted>Exemplu: {detail.example}</Muted> : null}
          {detail.personalExample ? <Muted>Din contextul tău: {detail.personalExample}</Muted> : null}
          {detail.synonyms && detail.synonyms.length > 0 ? <Tiny>Sinonime: {detail.synonyms.join(', ')}</Tiny> : null}
          {detail.opposite ? <Tiny>Opus: {detail.opposite}</Tiny> : null}
          <Tiny style={{ marginTop: 6 }}>
            Stadiu: {vocabStage(detail)} · pasiv {detail.passiveScore}/100 · activ {detail.activeScore}/100 · următoarea
            repetare: {detail.review.nextReviewAt}
          </Tiny>
          <ButtonRow>
            <Button title="Închide" onPress={() => setDetail(null)} />
          </ButtonRow>
        </Sheet>
      )}
    </>
  );
}

// ============ Gramatică: microlecții din curriculum (§17) ============
function GrammarTab({ profile }: { profile: Profile }) {
  const p = usePalette();
  const [lesson, setLesson] = useState<Microlesson | null>(null);
  const [lessonKey, setLessonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceScore, setVoiceScore] = useState<number | null>(null);
  const recorder = useRef(new Recorder());

  useEffect(() => {
    dominantCategory().then((cat) => {
      if (!cat) return;
      const item = GRAMMAR_CURRICULUM.find((c) => c.level === profile.currentLevel && c.category === cat) ?? GRAMMAR_CURRICULUM.find((c) => c.category === cat);
      setRecommended(item?.id ?? null);
    });
  }, [profile]);

  async function openLesson(id: string, titleRo: string) {
    setError('');
    setVoiceScore(null);
    setLessonKey(id);
    const cached = await getCachedLesson(id);
    if (cached) {
      setLesson(cached);
      return;
    }
    setBusy(true);
    try {
      const mistakes = await getMistakes();
      const item = GRAMMAR_CURRICULUM.find((c) => c.id === id);
      const related = mistakes.filter((m) => m.category === item?.category);
      const l = await chatJson<Microlesson>([{ role: 'user', content: buildMicrolessonPrompt(profile, titleRo, related) }], {
        feature: 'microlesson_curriculum', maxTokens: 1600, validate: isMicrolessonShape,
      });
      await cacheLesson(id, l);
      setLesson(l);
      await updateActivity({ lessonDone: true });
      await addXp(15);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function voiceExercise() {
    if (!lesson) return;
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(lesson.voiceExercise));
        await audio.dispose();
        setVoiceScore(sttDiffAssessment(lesson.voiceExercise, text).accuracyScore);
        await bumpActivity('sentencesRepeated', 1);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  const levels: Profile['currentLevel'][] = ['A1', 'A2', 'B1', 'B2'];

  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {busy && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
          <Spinner />
          <Muted>Se generează microlecția…</Muted>
        </View>
      )}
      {lesson && (
        <Card>
          <Pill kind="badge">Microlecție</Pill>
          <H3>{lesson.rule}</H3>
          <Muted>{lesson.explanationRo}</Muted>
          {lesson.examples.map((ex, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: p.ink, fontSize: 15 }}>{ex.en}</Text>
                <Tiny>{ex.ro}</Tiny>
              </View>
              <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(ex.en, 0.92)} />
            </View>
          ))}
          <Tiny style={{ fontWeight: '700', marginTop: 6 }}>Din contextul tău:</Tiny>
          {lesson.personalExamples.map((ex, i) => (
            <Muted key={i} style={{ marginVertical: 4 }}>
              {ex}
            </Muted>
          ))}
          <ChipRow>
            {lesson.targetPhrases.map((phrase, i) => (
              <Chip key={i} label={phrase} selected />
            ))}
          </ChipRow>
          <Text style={{ fontWeight: '600', color: p.ink, fontSize: 15.5, marginVertical: 6 }}>Rostește: {lesson.voiceExercise}</Text>
          <ButtonRow style={{ marginBottom: 0 }}>
            <Button title="" variant="ghost" icon="volume" onPress={() => void speak(lesson.voiceExercise, 0.9)} />
            <Button
              title={recording ? 'Oprește' : 'Rostește'}
              variant={recording ? 'danger' : 'primary'}
              icon={recording ? 'stop' : 'mic'}
              onPress={voiceExercise}
            />
            {voiceScore != null && <ScoreTag label={`${voiceScore}%`} tone={voiceScore >= 80 ? 'good' : 'mid'} />}
          </ButtonRow>
          <Tiny style={{ marginTop: 6 }}>Pasul următor: folosește structura în conversația de azi — AI-ul o va forța.</Tiny>
        </Card>
      )}

      {levels.map((lvl) => (
        <View key={lvl}>
          <H2>
            Nivel {lvl}
            {lvl === profile.currentLevel ? ' · nivelul tău' : ''}
          </H2>
          <ChipRow>
            {GRAMMAR_CURRICULUM.filter((c) => c.level === lvl).map((c) => (
              <Chip
                key={c.id}
                label={`${recommended === c.id ? '🔥 ' : ''}${c.titleRo}`}
                selected={lessonKey === c.id}
                onPress={() => void openLesson(c.id, c.titleRo)}
              />
            ))}
          </ChipRow>
        </View>
      ))}
      <Tiny>🔥 = recomandat din greșelile tale. Lecțiile generate se salvează local (cache).</Tiny>
    </>
  );
}

// ============ Listening ladder (§P1): fără text → reascultare → reconstrucție → verificare ============
function ListeningTab() {
  const p = usePalette();
  const [phrases, setPhrases] = useState<PronPhrase[]>([]);
  const [idx, setIdx] = useState(0);
  const [listens, setListens] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [recording, setRecording] = useState(false);
  const [checked, setChecked] = useState<PronAssessment | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [error, setError] = useState('');
  const [source, setSource] = useState<PhraseSource>('generated');
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getPersonalizedPhrasesDetailed().then(({ phrases: ph, source: s }) => {
      setPhrases(ph);
      setSource(s);
    }).catch(() => setPhrases([]));
    getPronResults().then((r) => setTodayCount(r.filter((x) => x.exercise === 'listening' && x.date === todayStr()).length)).catch(() => {});
  }, []);

  const current = phrases.length > 0 ? phrases[idx % phrases.length] : null;

  async function listen() {
    if (!current) return;
    setListens((n) => n + 1);
    await speak(current.text, listens === 0 ? 0.95 : 0.85); // reascultarea e mai lentă
  }

  async function verify(text: string) {
    if (!current || !text.trim()) return;
    const res = sttDiffAssessment(current.text, text);
    setChecked(res);
    const rec: PronunciationResult = {
      id: newId(),
      date: todayStr(),
      exercise: 'listening',
      phrase: current.text,
      targets: ['listening'],
      score: res.accuracyScore,
      wordScores: res.words,
      source: 'stt-diff',
    };
    try {
      await savePronResult(rec);
      await addXp(res.accuracyScore >= 80 ? 8 : 4);
      setTodayCount((n) => n + 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setAttempt(text);
        await verify(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  function next() {
    setIdx((i) => i + 1);
    setListens(0);
    setAttempt('');
    setChecked(null);
  }

  return (
    <>
      <Tiny style={{ marginTop: 8 }}>
        Scara ascultării: asculți FĂRĂ text → reasculți (mai lent) → reconstruiești propoziția → verifici cuvânt cu cuvânt.
        Rezultatele alimentează scorul competenței „Înțelegere".
      </Tiny>
      {source === 'static' && (
        <Tiny style={{ opacity: 0.8 }}>Astăzi folosim un set standard. Exercițiile personalizate vor reveni automat.</Tiny>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!current && (
        <Card>
          <Muted>Nu există fraze încă — deschide întâi tab-ul Pronunție ca să se genereze setul zilei.</Muted>
        </Card>
      )}
      {current && (
        <Card>
          <Tiny style={{ fontWeight: '700' }}>
            Propoziția {(idx % phrases.length) + 1}/{phrases.length} · ascultări: {listens}
          </Tiny>
          {!checked ? (
            <>
              <ButtonRow>
                <Button
                  title={listens === 0 ? 'Ascultă (fără text)' : `Reascultă mai lent (${listens})`}
                  variant="primary"
                  icon="volume"
                  onPress={listen}
                />
              </ButtonRow>
              {listens > 0 && (
                <>
                  <Tiny>Reconstruiește exact ce ai auzit:</Tiny>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Field value={attempt} onChange={setAttempt} placeholder="Ce ai auzit…" />
                    </View>
                    <Button title="" icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'default'} onPress={mic} />
                  </View>
                  <ButtonRow style={{ marginBottom: 0 }}>
                    <Button title="Verifică" onPress={() => void verify(attempt)} disabled={!attempt.trim()} />
                  </ButtonRow>
                </>
              )}
            </>
          ) : (
            <>
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: 16,
                  marginVertical: 4,
                  color: checked.accuracyScore >= 80 ? p.success : checked.accuracyScore >= 50 ? p.warn : p.danger,
                }}
              >
                {checked.accuracyScore}% din cuvinte prinse
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
                {checked.words.map((w, i) => (
                  <ScoreTag key={i} label={w.word} tone={w.score >= 80 ? 'good' : 'bad'} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Tiny style={{ flexShrink: 1 }}>Textul real: „{current.text}"</Tiny>
                <IconButton icon="volume" size={15} color={p.primary} onPress={() => void speak(current.text, 0.9)} />
              </View>
              <ButtonRow style={{ marginBottom: 0 }}>
                <Button title="Următoarea →" variant="primary" onPress={next} />
              </ButtonRow>
            </>
          )}
        </Card>
      )}
      <Card>
        <Muted>
          Azi: {todayCount} propoziții de ascultare · țintă: 5. La 5+ pe mai multe zile, scorul „Înțelegere" începe să
          evolueze din exerciții reale.
        </Muted>
      </Card>
    </>
  );
}

// ============ Pronunție (§18): 5 tipuri de exerciții + raport ============
type PronMode = 'personalized' | 'shadowing' | 'minimal_pairs' | 'word_stress' | 'rhythm';

function PronTab() {
  const p = usePalette();
  const [mode, setMode] = useState<PronMode>('personalized');
  const [phrases, setPhrases] = useState<PronPhrase[]>([]);
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PronAssessment | null>(null);
  const [weak, setWeak] = useState<string[]>([]);
  const [history, setHistory] = useState<PronunciationResult[]>([]);
  const [error, setError] = useState('');
  const [source, setSource] = useState<PhraseSource>('generated');
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getPersonalizedPhrasesDetailed().then(({ phrases: ph, source: s }) => {
      setPhrases(ph);
      setSource(s);
    }).catch(() => {});
    weakSounds().then(setWeak);
    getPronResults().then((r) => setHistory(r.filter((x) => x.date === todayStr() && x.exercise !== 'listening')));
  }, []);

  const current: { text: string; targets: string[]; extra?: string } | null = (() => {
    if (mode === 'personalized' || mode === 'shadowing') {
      const ph = phrases[idx % Math.max(phrases.length, 1)];
      return ph ? { text: ph.text, targets: ph.targets } : null;
    }
    if (mode === 'minimal_pairs') {
      const pair = MINIMAL_PAIRS[idx % MINIMAL_PAIRS.length];
      return { text: pair.sentence, targets: ['ee_i'], extra: `${pair.a} vs ${pair.b}` };
    }
    if (mode === 'word_stress') {
      const w = WORD_STRESS[idx % WORD_STRESS.length];
      return { text: w.word.split(' ')[0], targets: ['stress'], extra: `${w.stressed} — ${w.note}` };
    }
    const r = RHYTHM_SENTENCES[idx % RHYTHM_SENTENCES.length];
    return { text: r.text, targets: ['stress'] };
  })();

  async function record() {
    if (!current) return;
    setError('');
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        // înregistrarea nativă e deja WAV 16k (iOS); assessWithAzure face singur fallback pe STT-diff
        const wav = await recorder.current.stop();
        const assessment: PronAssessment = await assessWithAzure(wav, current.text);
        await wav.dispose();
        setResult(assessment);
        const rec: PronunciationResult = {
          id: newId(),
          date: todayStr(),
          exercise: mode === 'personalized' ? 'personalized' : mode === 'shadowing' ? 'shadowing' : mode === 'minimal_pairs' ? 'minimal_pairs' : mode === 'word_stress' ? 'word_stress' : 'rhythm',
          phrase: current.text,
          targets: current.targets,
          score: assessment.accuracyScore,
          fluencyScore: assessment.fluencyScore,
          prosodyScore: assessment.prosodyScore,
          wordScores: assessment.words,
          source: assessment.source,
        };
        await savePronResult(rec);
        await bumpActivity(mode === 'shadowing' ? 'shadowPhrases' : 'pronPhrases', 1);
        await addXp(assessment.accuracyScore >= 80 ? 8 : 4);
        setHistory((h) => [...h, rec]);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
      return;
    }
    try {
      setResult(null);
      await recorder.current.start();
      setRecording(true);
      if (mode === 'shadowing') void speak(current.text, 1); // shadowing: vorbești aproape simultan (§18)
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  const MODES: { id: PronMode; label: string; icon: IconName }[] = [
    { id: 'personalized', label: 'Personalizat', icon: 'target' },
    { id: 'shadowing', label: 'Shadowing', icon: 'headphones' },
    { id: 'minimal_pairs', label: 'Minimal pairs', icon: 'ear' },
    { id: 'word_stress', label: 'Accent', icon: 'type' },
    { id: 'rhythm', label: 'Ritm', icon: 'music' },
  ];

  const rhythmSentence = mode === 'rhythm' ? RHYTHM_SENTENCES[idx % RHYTHM_SENTENCES.length] : null;

  return (
    <>
      <TabsBar
        tabs={MODES.map((m) => ({ key: m.id, label: m.label }))}
        active={mode}
        onChange={(k) => {
          setMode(k as PronMode);
          setIdx(0);
          setResult(null);
        }}
      />
      <Tiny>Sunete de exersat azi: {weak.map((s) => SOUND_LABELS[s] ?? s).join(', ') || 'niciunul'}</Tiny>
      {source === 'static' && (mode === 'personalized' || mode === 'shadowing') && (
        <Tiny style={{ opacity: 0.8 }}>Astăzi folosim un set standard. Exercițiile personalizate vor reveni automat.</Tiny>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {current && (
        <Card>
          {current.extra ? <Tiny style={{ fontWeight: '700' }}>{current.extra}</Tiny> : null}
          {rhythmSentence ? (
            <Text style={{ fontSize: 18.5, lineHeight: 27, color: p.ink, marginVertical: 6 }}>
              {rhythmSentence.text.split(' ').map((w, i) => {
                const stressed = rhythmSentence.stressedWords.some((s) => w.toLowerCase().includes(s.toLowerCase()));
                return (
                  <Text key={i} style={stressed ? { color: p.primaryDeep, fontWeight: '800' } : undefined}>
                    {w}{' '}
                  </Text>
                );
              })}
            </Text>
          ) : (
            <Text style={{ fontSize: 18.5, lineHeight: 27, color: p.ink, marginVertical: 6 }}>{current.text}</Text>
          )}
          <ButtonRow style={{ marginBottom: 0 }}>
            <Button title="Ascultă" icon="volume" onPress={() => void speak(current.text, mode === 'shadowing' ? 1 : 0.95)} />
            <Button
              title={recording ? 'Oprește' : busy ? 'Se evaluează…' : mode === 'shadowing' ? 'Shadowing' : 'Rostește'}
              variant={recording ? 'danger' : 'primary'}
              icon={busy ? undefined : recording ? 'stop' : mode === 'shadowing' ? 'headphones' : 'mic'}
              busy={busy}
              onPress={record}
              disabled={busy}
            />
            <Button
              title="Următoarea →"
              variant="ghost"
              onPress={() => {
                setIdx(idx + 1);
                setResult(null);
              }}
            />
          </ButtonRow>
          {result && (
            <>
              <StatGrid>
                <StatTile value={result.accuracyScore} label="claritate" />
                <StatTile value={result.fluencyScore} label="fluență" />
                {result.prosodyScore != null && <StatTile value={result.prosodyScore} label="prozodie" />}
              </StatGrid>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
                {result.words.map((w, i) => (
                  <ScoreTag key={i} label={w.word} tone={w.score >= 80 ? 'good' : w.score >= 60 ? 'mid' : 'bad'} />
                ))}
              </View>
            </>
          )}
        </Card>
      )}
      <H2>Raport de azi</H2>
      <Card>
        {history.length === 0 ? (
          <Muted>Niciun exercițiu azi. Țintă: 5-10 fraze.</Muted>
        ) : (
          <>
            <Muted>
              {history.length} fraze · medie {Math.round(history.reduce((a, r) => a + r.score, 0) / history.length)}%
            </Muted>
            <Tiny>
              Cuvinte problematice:{' '}
              {history.flatMap((r) => r.wordScores.filter((w) => w.score < 60).map((w) => w.word)).slice(0, 10).join(', ') || 'niciunul'}
            </Tiny>
            <Tiny>Sunetele sub 70% intră automat în rotația de mâine.</Tiny>
          </>
        )}
      </Card>
    </>
  );
}
