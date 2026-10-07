// Vorbește: tipurile de conversații (§10), lumi (§19), traseul IT (§20),
// moduri de dificultate (§23), „Explică-mi ziua" (§10.7), chat + Mirror + raport. Portat de pe web.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { Profile, Utterance, Session, SessionReport, SessionType, CorrectionMode } from '../types';
import { defaultProfile, getProfile, getMemory } from '../db/db';
import { formatMemoryForPrompt } from '../logic/engine';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import TutorSessionHeader from '../components/TutorSessionHeader';
import MirrorModal from '../components/MirrorModal';
import ReportView from '../components/ReportView';
import { ROLEPLAY_SCENARIOS, WORLDS, IT_TRACK, DIFFICULTY_MODES, type DifficultyDef } from '../content';
import { targetExpressionsForToday, addVocabItem } from '../logic/engine';
import { chatJson } from '../api/openrouter';
import { buildMyDayPrompt } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { Icon, type IconName } from '../components/Icon';
import { Screen, H1, H2, Card, Banner, Button, ButtonRow, Chip, ChipRow, Tiny, Muted, Field, Pill, IconButton } from '../ui';
import { usePalette } from '../theme';
import { useNavigationChrome } from '../navigation/NavigationChromeContext';

interface ChatSetup {
  type: SessionType;
  scenarioId?: string;
  scenarioTitle?: string;
  scenarioPersona?: string;
  guided?: boolean;
  correctionMode: CorrectionMode;
  targets: string[];
}

const CONVO_TYPES: { type: SessionType; icon: IconName; titleRo: string; descRo: string }[] = [
  { type: 'free', icon: 'message', titleRo: 'Conversație liberă', descRo: 'Vorbești despre orice; AI-ul pune întrebări scurte' },
  { type: 'guided', icon: 'compass', titleRo: 'Conversație ghidată', descRo: 'Primești idei de răspuns și expresii utile' },
  { type: 'nohelp', icon: 'ban', titleRo: 'Fără ajutor', descRo: 'Fără sugestii sau corecturi — feedback la final' },
  { type: 'rapid', icon: 'zap', titleRo: 'Conversație rapidă', descRo: 'Întrebări neașteptate, reduci timpul de gândire' },
  { type: 'professional', icon: 'briefcase', titleRo: 'Mod profesional', descRo: 'Ședințe, clienți, incidente — ton formal' },
  { type: 'myday', icon: 'calendar', titleRo: 'Explică-mi ziua', descRo: 'Povestești în română → înveți varianta engleză' },
];

type TalkMenuSection = 'conversations' | 'roleplay' | 'worlds' | 'it';

const DIFFICULTY_ICONS: Record<DifficultyDef['id'], IconName> = {
  patient: 'user',
  normal: 'message',
  intensive: 'flame',
  professional: 'briefcase',
  exam: 'graduation',
};

const TALK_MENU_SECTIONS: { id: TalkMenuSection; label: string; icon: IconName }[] = [
  { id: 'conversations', label: 'Conversații', icon: 'message' },
  { id: 'roleplay', label: 'Jocuri de rol', icon: 'presentation' },
  { id: 'worlds', label: 'Lumi', icon: 'globe' },
  { id: 'it', label: 'Engleză IT', icon: 'laptop' },
];

export default function Talk({ preview = false }: { preview?: boolean }) {
  const p = usePalette();
  const { setHidden: setNavigationHidden } = useNavigationChrome();
  const [profile, setProfile] = useState<Profile | null>(() => preview ? { ...defaultProfile(), onboarded: true, testDone: true } : null);
  const [view, setView] = useState<'menu' | 'chat' | 'report' | 'myday'>('menu');
  const [setup, setSetup] = useState<ChatSetup | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyDef>(DIFFICULTY_MODES[1]);
  const [openWorld, setOpenWorld] = useState<string | null>(null);
  const [showIT, setShowIT] = useState(false);
  const [menuSection, setMenuSection] = useState<TalkMenuSection>('conversations');
  const [result, setResult] = useState<{ session: Session; report?: SessionReport } | null>(null);
  const [mirrorTurn, setMirrorTurn] = useState<Utterance | null>(null);
  const [examLeft, setExamLeft] = useState<number | null>(null);
  const [memoryContext, setMemoryContext] = useState('');

  useEffect(() => {
    if (preview) return;
    getProfile().then((prof) => setProfile(prof)).catch(() => {});
    getMemory().then((m) => setMemoryContext(formatMemoryForPrompt(m))).catch(() => {});
  }, [preview]);

  useEffect(() => {
    setNavigationHidden(view === 'chat');
    return () => setNavigationHidden(false);
  }, [setNavigationHidden, view]);

  if (!profile) return <Screen scroll={false}>{null}</Screen>;
  if (view === 'chat' && setup) {
    return (
      <ActiveChat
        profile={profile}
        setup={setup}
        memoryContext={memoryContext}
        difficulty={difficulty}
        examLeft={examLeft}
        setExamLeft={setExamLeft}
        onMirror={setMirrorTurn}
        mirrorTurn={mirrorTurn}
        onDone={(r) => {
          setResult(r);
          setView('report');
        }}
        onCancel={() => setView('menu')}
      />
    );
  }
  if (view === 'report' && result) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="clipboard" size={24} />
          <H1 style={{ marginVertical: 0 }}>Raportul sesiunii</H1>
        </View>
        <ReportView session={result.session} report={result.report} />
        <ButtonRow>
          <Button title="Înapoi la conversații" variant="primary" onPress={() => setView('menu')} />
        </ButtonRow>
      </Screen>
    );
  }
  if (view === 'myday') {
    return (
      <MyDaySetup
        profile={profile}
        onStart={(s) => {
          setSetup(s);
          setView('chat');
        }}
        onBack={() => setView('menu')}
      />
    );
  }

  async function startChat(partial: Omit<ChatSetup, 'correctionMode' | 'targets'>, diffOverride?: DifficultyDef) {
    if (partial.type === 'myday') {
      setView('myday');
      return;
    }
    const diff = diffOverride ?? difficulty;
    const targets = await targetExpressionsForToday().catch(() => []);
    const noCorrections = partial.type === 'nohelp' || partial.type === 'rapid' || partial.type === 'exam';
    const mode: CorrectionMode = diff.correctionOverride ?? (noCorrections ? 'final' : profile!.correctionMode);
    if (diffOverride) setDifficulty(diffOverride);
    setSetup({ ...partial, correctionMode: mode, targets });
    if (diff.timeLimitMin) setExamLeft(diff.timeLimitMin * 60);
    else setExamLeft(null);
    setView('chat');
  }

  const scenarioCard = (onPress: () => void, icon: IconName, title: string, desc?: string, pro?: boolean) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: p.card,
          borderWidth: 1,
          borderColor: p.border,
          borderRadius: 18,
          padding: 14,
        },
        pressed && { borderColor: p.primary, opacity: 0.85 },
      ]}
    >
      {pro && (
        <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
          <Pill kind="badge">PRO</Pill>
        </View>
      )}
      <View style={{ alignItems: 'center', height: 32, justifyContent: 'center' }}>
        <Icon name={icon} size={27} color={p.primary} />
      </View>
      <Text style={{ fontWeight: '700', color: p.ink, fontSize: 14.5, textAlign: 'center' }}>{title}</Text>
      {desc ? <Tiny style={{ textAlign: 'center', marginTop: 2 }}>{desc}</Tiny> : null}
    </Pressable>
  );

  const guidedConversation = CONVO_TYPES.find((item) => item.type === 'guided')!;
  const freeConversation = CONVO_TYPES.find((item) => item.type === 'free')!;
  const rapidConversation = CONVO_TYPES.find((item) => item.type === 'rapid')!;
  const examDifficulty = DIFFICULTY_MODES.find((item) => item.id === 'exam')!;

  const sectionNavigation = (
    <View style={[talkSt.sectionNavigation, { backgroundColor: p.card, borderColor: p.border }]}> 
      {TALK_MENU_SECTIONS.map((item) => {
        const selected = menuSection === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => setMenuSection(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              talkSt.sectionNavigationButton,
              selected && { backgroundColor: p.primarySoft },
              pressed && { opacity: 0.76 },
            ]}
          >
            <Icon name={item.icon} size={22} color={selected ? p.primaryDeep : p.muted} />
            <Text numberOfLines={1} style={[talkSt.sectionNavigationLabel, { color: selected ? p.primaryDeep : p.muted }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const optionRow = (
    icon: IconName,
    title: string,
    description: string,
    onPress: () => void,
    last = false,
  ) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        talkSt.optionRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border },
        pressed && { backgroundColor: p.primarySoft },
      ]}
    >
      <Icon name={icon} size={25} color={p.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[talkSt.optionTitle, { color: p.ink }]}>{title}</Text>
        <Text numberOfLines={1} style={[talkSt.optionDescription, { color: p.ink2 }]}>{description}</Text>
      </View>
      <Icon name="arrowUpRight" size={17} color={p.muted} />
    </Pressable>
  );

  return (
    <Screen style={talkSt.screen}>
      <View style={talkSt.header}>
        <Icon name="mic" size={31} color={p.ink} />
        <View style={{ flex: 1 }}>
          <Text style={[talkSt.headerTitle, { color: p.ink }]}>Vorbește</Text>
          <Text style={[talkSt.headerSubtitle, { color: p.ink2 }]}>Ce vrei să exersezi acum?</Text>
        </View>
      </View>

      <View style={[talkSt.difficultySummary, { backgroundColor: p.card, borderColor: p.borderStrong }]}> 
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[talkSt.eyebrow, { color: p.muted }]}>RITM ȘI CORECTARE</Text>
          <Text style={[talkSt.difficultyTitle, { color: p.ink }]}>{difficulty.titleRo}</Text>
          <Text style={[talkSt.difficultyDescription, { color: p.ink2 }]}>{difficulty.descRo.replace(', ', ' · ')}</Text>
        </View>
        <View style={[talkSt.adjustButton, { borderColor: p.primary, backgroundColor: p.primarySoft }]}> 
          <Icon name="sliders" size={23} color={p.primaryDeep} />
        </View>
      </View>

      <View style={[talkSt.difficultyRail, { backgroundColor: p.card, borderColor: p.border }]}> 
        {DIFFICULTY_MODES.map((item) => {
          const selected = difficulty.id === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setDifficulty(item)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                talkSt.difficultyOption,
                selected && { backgroundColor: p.primarySoft, borderRadius: 16, borderWidth: 1.5, borderColor: p.primary },
                pressed && { opacity: 0.74 },
              ]}
            >
              <Icon name={DIFFICULTY_ICONS[item.id]} size={22} color={selected ? p.primaryDeep : p.muted} />
              <Text style={[talkSt.difficultyOptionLabel, { color: selected ? p.primaryDeep : p.muted }]}>{item.titleRo}</Text>
            </Pressable>
          );
        })}
      </View>

      {menuSection !== 'conversations' ? sectionNavigation : null}

      {menuSection === 'conversations' ? (
        <View style={talkSt.library}>
          <Text style={[talkSt.sectionTitle, { color: p.ink }]}>Alege o conversație</Text>

          <View style={[talkSt.guidedFeature, { backgroundColor: p.card, borderColor: p.borderStrong }]}> 
            <View style={[talkSt.featureIconLarge, { backgroundColor: p.primarySoft, borderColor: p.borderStrong }]}> 
              <Icon name={guidedConversation.icon} size={30} color={p.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[talkSt.guidedTitle, { color: p.ink }]}>{guidedConversation.titleRo}</Text>
              <Text style={[talkSt.guidedDescription, { color: p.ink2 }]}>Idei de răspuns și expresii utile</Text>
            </View>
            <Button title="Începe" small variant="primary" onPress={() => void startChat({ type: 'guided', guided: true })} style={talkSt.startButton} />
          </View>

          <View style={talkSt.featurePair}>
            {[freeConversation, rapidConversation].map((item) => (
              <Pressable
                key={item.type}
                onPress={() => void startChat({ type: item.type })}
                style={({ pressed }) => [
                  talkSt.featureCard,
                  { backgroundColor: p.card, borderColor: pressed ? p.primary : p.borderStrong },
                  pressed && { transform: [{ scale: 0.985 }] },
                ]}
              >
                <View style={[talkSt.featureIcon, { backgroundColor: p.primarySoft, borderColor: p.borderStrong }]}> 
                  <Icon name={item.icon} size={24} color={p.primary} />
                </View>
                <Icon name="arrowUpRight" size={18} color={p.muted} style={talkSt.featureArrow} />
                <Text style={[talkSt.featureTitle, { color: p.ink }]}>{item.titleRo}</Text>
                <Text style={[talkSt.featureDescription, { color: p.ink2 }]}>{item.descRo}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[talkSt.sectionTitle, talkSt.moreTitle, { color: p.ink }]}>Mai multe opțiuni</Text>
          <View style={[talkSt.optionList, { backgroundColor: p.card, borderColor: p.borderStrong }]}> 
            {optionRow('ban', 'Fără ajutor', 'Fără sugestii sau corecturi — feedback la final', () => void startChat({ type: 'nohelp' }))}
            {optionRow('briefcase', 'Mod profesional', 'Ședințe, clienți, incidente — ton formal', () => void startChat({ type: 'professional' }))}
            {optionRow('calendar', 'Explică-mi ziua', 'Povestești în română → înveți varianta engleză', () => void startChat({ type: 'myday' }))}
            {optionRow('graduation', 'Mod examen', 'Pregătire pentru examene și certificări', () => void startChat({ type: 'exam', scenarioTitle: 'Mod examen' }, examDifficulty), true)}
          </View>

          {sectionNavigation}
        </View>
      ) : null}

      {menuSection === 'roleplay' ? (
        <View style={talkSt.moduleSection}>
          <Text style={[talkSt.moduleEyebrow, { color: p.muted }]}>Exersează situații reale</Text>
          <Text style={[talkSt.moduleTitle, { color: p.ink }]}>Jocuri de rol</Text>
          <View style={talkSt.roleplayGrid}>
            {ROLEPLAY_SCENARIOS.map((scenario) => (
              <View key={scenario.id} style={talkSt.roleplayCell}>
                {scenarioCard(
                  () => void startChat({
                    type: scenario.professional ? 'professional' : 'roleplay',
                    scenarioId: scenario.id,
                    scenarioTitle: scenario.titleRo,
                    scenarioPersona: scenario.persona,
                  }),
                  scenario.icon as IconName,
                  scenario.titleRo,
                  undefined,
                  scenario.professional,
                )}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {menuSection === 'worlds' ? (
        <View style={talkSt.moduleSection}>
          <Text style={[talkSt.moduleEyebrow, { color: p.muted }]}>Conținut potrivit nivelului tău</Text>
          <Text style={[talkSt.moduleTitle, { color: p.ink }]}>Lumi pe niveluri</Text>
          {WORLDS.map((world) => (
            <Card key={world.id} style={talkSt.worldCard}>
              <Pressable onPress={() => setOpenWorld(openWorld === world.id ? null : world.id)} style={talkSt.worldHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
                  <Icon name={world.icon as IconName} size={20} color={p.primary} />
                  <Text style={{ fontWeight: '800', color: p.ink, flex: 1 }}>{world.titleRo}</Text>
                </View>
                <Pill kind="badgeSoft">{world.level}</Pill>
                <Icon name={openWorld === world.id ? 'chevronUp' : 'chevronDown'} size={18} color={p.muted} />
              </Pressable>
              {openWorld === world.id ? (
                <ChipRow style={{ marginTop: 12, marginBottom: 0 }}>
                  {world.topics.map((topic) => (
                    <Chip
                      key={topic.id}
                      label={topic.titleRo}
                      onPress={() => void startChat({
                        type: 'roleplay',
                        scenarioId: `${world.id}_${topic.id}`,
                        scenarioTitle: `${world.titleRo}: ${topic.titleRo}`,
                        scenarioPersona: topic.prompt,
                      })}
                    />
                  ))}
                </ChipRow>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      {menuSection === 'it' ? (
        <View style={talkSt.moduleSection}>
          <Text style={[talkSt.moduleEyebrow, { color: p.muted }]}>Engleză profesională pentru tehnologie</Text>
          <Text style={[talkSt.moduleTitle, { color: p.ink }]}>Traseul IT</Text>
          <Card style={talkSt.itCard}>
            <Pressable onPress={() => setShowIT(!showIT)} style={talkSt.itHeader}>
              <Icon name="laptop" size={23} color={p.primary} />
              <Text style={{ fontWeight: '800', color: p.ink, flex: 1 }}>15 module pentru engleza profesională IT</Text>
              <Icon name={showIT ? 'chevronUp' : 'chevronDown'} size={18} color={p.muted} />
            </Pressable>
            {showIT ? (
              <View style={[talkSt.itModules, { borderTopColor: p.border }]}> 
                {IT_TRACK.map((module, index) => (
                  <Pressable
                    key={module.id}
                    onPress={() => void startChat({ type: 'professional', scenarioId: module.id, scenarioTitle: module.titleRo, scenarioPersona: module.prompt })}
                    style={({ pressed }) => [talkSt.itModule, index < IT_TRACK.length - 1 && { borderBottomColor: p.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: p.primarySoft }]}
                  >
                    <View style={[talkSt.itIndex, { backgroundColor: p.primarySoft }]}><Text style={{ color: p.primaryDeep, fontWeight: '900', fontSize: 12 }}>{index + 1}</Text></View>
                    <Text style={{ color: p.ink, fontWeight: '750' as any, flex: 1 }}>{module.titleRo}</Text>
                    <Icon name="arrowUpRight" size={16} color={p.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const talkSt = StyleSheet.create({
  screen: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingTop: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, marginBottom: 16 },
  headerTitle: { fontSize: 34, lineHeight: 37, fontWeight: '900', letterSpacing: -1.2 },
  headerSubtitle: { marginTop: 5, fontSize: 15.5, lineHeight: 21 },
  difficultySummary: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 21,
  },
  eyebrow: { fontSize: 11.5, lineHeight: 15, fontWeight: '850' as any, letterSpacing: 1.05 },
  difficultyTitle: { marginTop: 6, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  difficultyDescription: { marginTop: 4, fontSize: 13.5, lineHeight: 19 },
  adjustButton: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 15 },
  difficultyRail: { flexDirection: 'row', minHeight: 88, marginTop: 9, gap: 3, padding: 4, overflow: 'hidden', borderWidth: 1, borderRadius: 20 },
  difficultyOption: { flex: 1, minWidth: 0, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 2, borderRadius: 16 },
  difficultyOptionLabel: { minHeight: 32, fontSize: 10.5, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  library: { marginTop: 18 },
  sectionTitle: { marginBottom: 11, fontSize: 18, lineHeight: 23, fontWeight: '900', letterSpacing: -0.3 },
  moreTitle: { marginTop: 22 },
  guidedFeature: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderWidth: 1, borderRadius: 21 },
  featureIconLarge: { width: 47, height: 47, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 24 },
  guidedTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900', letterSpacing: -0.25 },
  guidedDescription: { marginTop: 4, fontSize: 12.5, lineHeight: 17 },
  startButton: { minHeight: 38, paddingHorizontal: 11 },
  featurePair: { flexDirection: 'row', gap: 10, marginTop: 10 },
  featureCard: { flex: 1, minWidth: 0, minHeight: 132, padding: 12, borderWidth: 1, borderRadius: 20 },
  featureIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 20 },
  featureArrow: { position: 'absolute', top: 53, right: 12 },
  featureTitle: { maxWidth: '84%', marginTop: 8, fontSize: 13.5, lineHeight: 17, fontWeight: '900', letterSpacing: -0.15 },
  featureDescription: { marginTop: 4, fontSize: 11.5, lineHeight: 16 },
  optionList: { overflow: 'hidden', borderWidth: 1, borderRadius: 21 },
  optionRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7, paddingHorizontal: 14 },
  optionTitle: { fontSize: 15, lineHeight: 19, fontWeight: '850' as any },
  optionDescription: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
  sectionNavigation: { flexDirection: 'row', gap: 3, marginTop: 16, padding: 5, borderWidth: 1, borderRadius: 20 },
  sectionNavigationButton: { flex: 1, minWidth: 0, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2, borderRadius: 15 },
  sectionNavigationLabel: { width: '100%', fontSize: 10.5, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  moduleSection: { marginTop: 23 },
  moduleEyebrow: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  moduleTitle: { marginTop: 2, marginBottom: 12, fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45 },
  roleplayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  roleplayCell: { width: '47%', flexGrow: 1 },
  worldCard: { marginVertical: 5 },
  worldHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  itCard: { padding: 0, overflow: 'hidden' },
  itHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  itModules: { borderTopWidth: StyleSheet.hairlineWidth },
  itModule: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 14 },
  itIndex: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
});

// ---------- Chat activ ----------
function ActiveChat({
  profile,
  setup,
  memoryContext,
  difficulty,
  examLeft,
  setExamLeft,
  onDone,
  onCancel,
  onMirror,
  mirrorTurn,
}: {
  profile: Profile;
  setup: ChatSetup;
  memoryContext?: string;
  difficulty: DifficultyDef;
  examLeft: number | null;
  setExamLeft: (n: number | null) => void;
  onDone: (r: { session: Session; report?: SessionReport }) => void;
  onCancel: () => void;
  onMirror: (t: Utterance | null) => void;
  mirrorTurn: Utterance | null;
}) {
  // conversația vocală ține ecranul aprins (mai ales în hands-free/mașină)
  useKeepAwake();
  const chat = useVoiceChat({
    type: setup.type,
    scenarioId: setup.scenarioId,
    scenarioTitle: setup.scenarioTitle,
    scenarioPersona: setup.scenarioPersona,
    profile,
    difficulty,
    correctionMode: setup.correctionMode,
    targetExpressions: setup.targets,
    guided: setup.guided,
    memoryContext,
  });
  const started = useRef(false);
  const finishing = useRef(false);
  const [analyzingTs, setAnalyzingTs] = useState<number | null>(null);

  /** Mirror la cerere: analizează doar replica apăsată, nu toată conversația (§ optimizare tokeni). */
  async function openMirror(t: Utterance) {
    if (t.analysis) {
      onMirror(t);
      return;
    }
    if (analyzingTs != null) return;
    setAnalyzingTs(t.ts);
    const analyzed = await chat.analyzeTurnOnDemand(t.ts).catch(() => undefined);
    setAnalyzingTs(null);
    if (analyzed) onMirror(analyzed);
  }

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      chat.start('The session starts now. Greet the learner briefly in character and ask your first question. 1-2 sentences.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // timer pentru modul examen (§23)
  useEffect(() => {
    if (examLeft == null) return;
    if (examLeft <= 0) {
      void end();
      return;
    }
    const t = setTimeout(() => setExamLeft(examLeft - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examLeft]);

  async function end() {
    if (finishing.current) return;
    finishing.current = true;
    const r = await chat.finish({ withReport: true });
    onDone(r);
  }

  return (
    <Screen scroll={false} style={{ width: '100%', maxWidth: 430, alignSelf: 'center' }}>
      <TutorSessionHeader
        title={setup.scenarioTitle ?? CONVO_TYPES.find((c) => c.type === setup.type)?.titleRo ?? 'Conversație'}
        stepLabel="Conversație"
        detail={`${difficulty.titleRo} · corectare ${setup.correctionMode === 'discreet' ? 'discretă' : setup.correctionMode === 'immediate' ? 'imediată' : 'la final'}`}
        timeLabel={examLeft != null ? `${Math.floor(examLeft / 60)}:${String(examLeft % 60).padStart(2, '0')}` : undefined}
        actionLabel={chat.busy === 'ending' ? 'Analizez…' : 'Încheie'}
        onAction={end}
        onBack={onCancel}
        disabled={chat.busy === 'ending'}
      />
      <ChatView
        turns={chat.turns}
        busy={chat.busy}
        interim={chat.interim}
        hints={chat.hints}
        error={chat.error}
        onMic={chat.micPress}
        onSend={chat.sendUserText}
        onOpenMirror={openMirror}
        analyzingTs={analyzingTs}
        showMistakeTags={true}
        handsFree={chat.handsFree}
        onToggleHandsFree={() => chat.setHandsFree(!chat.handsFree)}
        profile={profile}
        onPhraseLearned={(phrase) => chat.addTarget(phrase)}
        contextLabel={setup.scenarioTitle ?? CONVO_TYPES.find((c) => c.type === setup.type)?.titleRo ?? 'Conversație liberă'}
      />
      {mirrorTurn && (
        <MirrorModal
          turn={mirrorTurn}
          profile={profile}
          contextText={chat.turns.slice(-6).map((t) => `${t.role}: ${t.text}`).join('\n')}
          onClose={() => onMirror(null)}
        />
      )}
    </Screen>
  );
}

// ---------- Explică-mi ziua (§10.7) ----------
function MyDaySetup({ profile, onStart, onBack }: { profile: Profile; onStart: (s: ChatSetup) => void; onBack: () => void }) {
  const p = usePalette();
  const [story, setStory] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ englishVersion: string; expressions: { en: string; ro: string }[]; conversationTopic: string } | null>(null);
  const recorder = useRef(new Recorder());

  async function mic() {
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setStory((s) => (s ? s + ' ' : '') + text);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  async function transform() {
    setBusy(true);
    setError('');
    try {
      const res = await chatJson<typeof result>([
        { role: 'system', content: buildMyDayPrompt(profile) },
        { role: 'user', content: story },
      ], { feature: 'my_day', maxTokens: 1500 });
      setResult(res);
      // expresiile intră în vocabular (§10.7 pasul 2)
      for (const e of res!.expressions) {
        await addVocabItem({ word: e.en, translation: e.ro, kind: 'expression', example: res!.englishVersion.split('.')[0] });
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="calendar" size={24} />
        <H1 style={{ marginVertical: 0 }}>Explică-mi ziua</H1>
      </View>
      <Muted>Povestește în română ce ai făcut azi sau o situație de la muncă. O transform în lecția ta de engleză.</Muted>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!result && (
        <>
          <Field
            value={story}
            onChange={setStory}
            multiline
            placeholder="Ex: Azi un utilizator nu a mai avut acces la fișierele vechi din OneDrive din cauza unui mismatch de identificator…"
          />
          <ButtonRow>
            <Button
              title={recording ? 'Oprește' : 'Dictează'}
              variant={recording ? 'danger' : 'default'}
              icon={recording ? 'stop' : 'mic'}
              onPress={mic}
              disabled={busy && !recording}
            />
            <Button
              title={busy ? 'Se transformă…' : 'Transformă în engleză →'}
              variant="primary"
              busy={busy && !recording}
              onPress={transform}
              disabled={!story.trim() || busy}
            />
            <Button title="← Înapoi" variant="ghost" onPress={onBack} />
          </ButtonRow>
        </>
      )}
      {result && (
        <>
          <H2>Povestea ta în engleză</H2>
          <Card>
            <Text style={{ color: p.ink, fontSize: 15.5, lineHeight: 23 }}>{result.englishVersion}</Text>
            <Button
              title="Ascultă"
              variant="ghost"
              icon="volume"
              small
              onPress={() => void speak(result.englishVersion, 0.92)}
              style={{ alignSelf: 'flex-start', marginTop: 6 }}
            />
          </Card>
          <H2>Expresiile-cheie (salvate în vocabular)</H2>
          {result.expressions.map((e, i) => (
            <Card key={i} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: p.ink }}>{e.en}</Text>
                <Tiny>{e.ro}</Tiny>
              </View>
              <IconButton icon="volume" color={p.primary} onPress={() => void speak(e.en, 0.9)} />
            </Card>
          ))}
          <ButtonRow>
            <Button
              title="Pornește conversația pe situația ta"
              variant="primary"
              icon="mic"
              onPress={() =>
                onStart({
                  type: 'myday',
                  scenarioTitle: 'Ziua ta, în engleză',
                  scenarioPersona: `${result.conversationTopic}. Make the learner retell and discuss this exact situation in English.`,
                  correctionMode: profile.correctionMode,
                  targets: result.expressions.map((e) => e.en),
                })
              }
            />
          </ButtonRow>
        </>
      )}
    </Screen>
  );
}
