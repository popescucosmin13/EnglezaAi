import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addXp, bumpActivity, getProfile, saveVocab } from '../db/db';
import { containsExpression, reviewMistake } from '../logic/engine';
import { mistakeContext } from '../logic/mistake-context';
import { evaluateCurriculumAnswer, normalizeAnswer } from '../microlearning/curriculum';
import { recordExerciseAttempt } from '../microlearning/state';
import { applyReview } from '../srs/ladder';
import type { CardEvaluation } from '../microlearning/types';
import type { Profile } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import { buildForYouFeed, savedSnapshot, spokenTextForCard } from '../foryou/feed';
import { DISCOVERY_TOPICS, discoveryArticle } from '../foryou/discovery';
import { forYouExerciseControl, forYouExerciseLabel, forYouInputPlaceholder, joinOrderTokens } from '../foryou/exercise';
import { buildForYouExplanation, curriculumFeedback } from '../foryou/explanations';
import { learningKeysForCard } from '../foryou/identity';
import { forYouExerciseGuide, learningMetaForCard } from '../foryou/learning';
import { emptyForYouState, getForYouState, recordForYouEvent, toggleDiscoveryTopic } from '../foryou/state';
import type { DiscoveryTopic, ForYouCard, ForYouEvent, ForYouState } from '../foryou/types';
import { Banner, Button, ButtonRow, Card, Chip, ChipRow, Field, H1, H2, Muted, Pill, Sheet, Spinner, Tiny } from '../ui';
import { usePalette } from '../theme';
import { useNavigationChrome } from '../navigation/NavigationChromeContext';

interface AnswerState extends CardEvaluation { value: string; assisted?: boolean }
const KIND_LABELS: Record<ForYouCard['kind'], string> = { phrase: 'Expresie', dialogue: 'Mini-dialog', insight: 'Aha rapid', story: 'Serial', quiz: 'Alege', listening: 'Ascultare', mistake: 'Capcana ta', vocab: 'Vocabular', discovery: 'Știai că?' };
const LANE_LABELS = { weakness: 'Pentru punctul tău slab', interest: 'Din interesele tale', srs: 'Fix înainte să uiți', new: 'Nou pentru tine', surprise: 'Surpriză', discovery: 'Descoperă lumea' };

function optionsFor(card: ForYouCard): string[] {
  if (card.kind === 'discovery') return card.discovery.check.options;
  if (card.kind === 'story') return card.episode.options;
  if (card.kind === 'mistake' || card.kind === 'vocab') return card.options;
  if (card.kind === 'quiz' || card.kind === 'listening') return card.exercise.options ?? [];
  return [];
}

function evaluateCard(card: ForYouCard, value: string): CardEvaluation {
  if (card.kind === 'discovery') {
    const correct = normalizeAnswer(value) === normalizeAnswer(card.discovery.check.answer);
    return { correct, score: correct ? 100 : 0, expected: card.discovery.check.answer, explanation: correct ? card.discovery.check.explanationRo : `${card.discovery.check.explanationRo} Răspuns: ${card.discovery.check.answer}` };
  }
  if (card.kind === 'quiz' || card.kind === 'listening') {
    const result = evaluateCurriculumAnswer(card.exercise, value);
    return { ...result, explanation: curriculumFeedback(card.exercise, card.lesson, result) };
  }
  if (card.kind === 'story') {
    const correct = normalizeAnswer(value) === normalizeAnswer(card.episode.answer);
    return { correct, score: correct ? 100 : 0, expected: card.episode.answer, explanation: correct ? `Ai identificat indiciul care susține „${card.episode.answer}”.` : `Răspunsul este „${card.episode.answer}”. Recitește întrebarea și caută propoziția exactă.` };
  }
  if (card.kind === 'mistake') {
    const targets = [card.mistake.correctFragment, card.mistake.corrected].filter((item): item is string => Boolean(item));
    const correct = targets.some((target) => normalizeAnswer(value) === normalizeAnswer(target));
    return { correct, score: correct ? 100 : 0, expected: card.mistake.correctFragment ?? card.mistake.corrected, explanation: correct ? `Forma se potrivește contextului. ${card.mistake.explanationRo}` : `Aici se potrivește „${card.mistake.correctFragment ?? card.mistake.corrected}”. ${card.mistake.explanationRo}` };
  }
  if (card.kind === 'vocab') {
    const correct = containsExpression(value, card.vocab.word);
    return { correct, score: correct ? 100 : 0, expected: card.vocab.word, explanation: correct ? `Ai recuperat „${card.vocab.word}” fără să o vezi.` : `Expresia căutată este „${card.vocab.word}”. Leag-o de o propoziție personală.` };
  }
  return { correct: true, score: 100, expected: '', explanation: '' };
}

async function persistAnswer(card: ForYouCard, result: CardEvaluation): Promise<void> {
  if (card.kind === 'quiz' || card.kind === 'listening') await recordExerciseAttempt(card.exercise.id, card.lesson.lesson_id, result.correct, result.score);
  else if (card.kind === 'mistake') await reviewMistake(card.mistake, result.correct ? 'good' : 'fail');
  else if (card.kind === 'vocab') {
    await saveVocab({ ...card.vocab, recognized: card.vocab.recognized || result.correct, passiveScore: result.correct ? Math.min(100, card.vocab.passiveScore + 8) : card.vocab.passiveScore, review: applyReview(card.vocab.review, result.correct ? 'good' : 'fail') });
    await bumpActivity('vocabReviews', 1).catch(() => {});
  }
}

export default function ForYou() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { reportScroll } = useNavigationChrome();
  const { height } = useWindowDimensions();
  const itemHeight = Math.max(480, height - Math.max(insets.top, 8) - insets.bottom - 122);
  const listRef = useRef<FlatList<ForYouCard>>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [feedState, setFeedState] = useState<ForYouState>(emptyForYouState());
  const [cards, setCards] = useState<ForYouCard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tokenOrders, setTokenOrders] = useState<Record<string, number[]>>({});
  const [hintSteps, setHintSteps] = useState<Record<string, number>>({});
  const [explanationCardId, setExplanationCardId] = useState('');
  const [checkingId, setCheckingId] = useState('');
  const [speakingId, setSpeakingId] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [topicSettingsOpen, setTopicSettingsOpen] = useState(false);
  const [discoveryStages, setDiscoveryStages] = useState<Record<string, 'predict' | 'learn' | 'check'>>({});
  const [discoveryPredictions, setDiscoveryPredictions] = useState<Record<string, string>>({});
  const [discoverySupport, setDiscoverySupport] = useState<Record<string, boolean>>({});
  const [combo, setCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const cardsRef = useRef<ForYouCard[]>([]);
  const viewed = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const batch = useRef(1);

  async function load() {
    setLoading(true); setLoadError('');
    try {
      const [currentProfile, state] = await Promise.all([getProfile(), getForYouState()]);
      const initial = await buildForYouFeed({ profile: currentProfile, state, count: 18 });
      setProfile(currentProfile); setFeedState(state); setCards(initial); cardsRef.current = initial; setExhausted(initial.length === 0);
      const resumeIndex = initial.findIndex((card) => card.id === state.resumeCardId);
      if (resumeIndex > 0) setTimeout(() => listRef.current?.scrollToIndex({ index: resumeIndex, animated: false }), 100);
    } catch (error: any) { setLoadError(String(error?.message ?? error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  async function appendMore() {
    if (!profile || loadingMore || exhausted) return;
    setLoadingMore(true);
    try {
      const latestState = await getForYouState();
      const more = await buildForYouFeed({ profile, state: latestState, count: 10, excludedIds: cardsRef.current.map((card) => card.id), excludedLearningKeys: cardsRef.current.flatMap(learningKeysForCard), batch: batch.current++ });
      if (!more.length) setExhausted(true); else setCards((current) => [...current, ...more]);
    } catch { /* feedul curent rămâne utilizabil */ }
    finally { setLoadingMore(false); }
  }

  useEffect(() => {
    const card = cards[activeIndex];
    if (!card || !profile) return;
    const viewTimer = setTimeout(() => {
      if (viewed.current.has(card.id)) return;
      viewed.current.add(card.id);
      void recordForYouEvent(card.id, 'view', undefined, card.kind === 'discovery' ? card.discovery.topic : undefined).then(setFeedState).catch(() => {});
    }, 650);
    const spoken = spokenTextForCard(card);
    const audioTimer = soundEnabled && spoken ? setTimeout(() => { setSpeakingId(card.id); void speak(spoken, profile.aiSpeed === 'lent' ? 0.82 : profile.aiSpeed === 'provocare' ? 1.06 : 0.94).finally(() => setSpeakingId('')); }, 380) : undefined;
    if (activeIndex >= cards.length - 4) void appendMore();
    return () => { clearTimeout(viewTimer); if (audioTimer) clearTimeout(audioTimer); };
  }, [activeIndex, cards.length, profile, soundEnabled]);

  function scrollTo(index: number) { listRef.current?.scrollToIndex({ index: Math.max(0, Math.min(cards.length - 1, index)), animated: true }); }
  function playCard(card: ForYouCard, override?: string) {
    if (!profile) return;
    const spoken = override ?? spokenTextForCard(card);
    if (!spoken) return;
    setSpeakingId(card.id);
    void speak(spoken, profile.aiSpeed === 'lent' ? 0.82 : profile.aiSpeed === 'provocare' ? 1.06 : 0.94).finally(() => setSpeakingId(''));
  }
  function removeDuplicates(card: ForYouCard) {
    const keys = new Set(learningKeysForCard(card));
    setCards((current) => current.filter((candidate, index) => index <= activeIndex || !learningKeysForCard(candidate).some((key) => keys.has(key))));
  }
  async function react(card: ForYouCard, event: ForYouEvent) {
    try {
      const next = await recordForYouEvent(card.id, event, event === 'save' ? savedSnapshot(card) : undefined, card.kind === 'discovery' ? card.discovery.topic : undefined);
      setFeedState(next);
      if (event === 'hide') scrollTo(activeIndex + 1);
    } catch { /* acțiunea poate fi reluată */ }
  }
  function markPracticed(card: ForYouCard) {
    if (completed.current.has(card.id) || feedState.interactions[card.id]?.completions) return;
    completed.current.add(card.id); removeDuplicates(card); void react(card, 'complete');
  }
  async function toggleTopic(topic: DiscoveryTopic) { try { setFeedState(await toggleDiscoveryTopic(topic)); } catch { /* retry */ } }
  async function submit(card: ForYouCard, value: string) {
    if (!value.trim() || checkingId || answers[card.id]) return;
    setCheckingId(card.id);
    try {
      const result = evaluateCard(card, value);
      await persistAnswer(card, result);
      await Promise.all([recordForYouEvent(card.id, result.correct ? 'answer-correct' : 'answer-wrong', undefined, card.kind === 'discovery' ? card.discovery.topic : undefined).then(setFeedState), addXp(result.correct ? 4 : 1).catch(() => {})]);
      completed.current.add(card.id); setAnswers((current) => ({ ...current, [card.id]: { ...result, value } }));
      if (result.correct) { removeDuplicates(card); setCombo((count) => count + 1); setCorrectCount((count) => count + 1); } else setCombo(0);
    } catch (error: any) { setAnswers((current) => ({ ...current, [card.id]: { correct: false, score: 0, expected: '', explanation: String(error?.message ?? error), value } })); setCombo(0); }
    finally { setCheckingId(''); }
  }
  async function revealModel(card: Extract<ForYouCard, { kind: 'quiz' | 'listening' }>) {
    if (checkingId || answers[card.id]) return;
    setCheckingId(card.id);
    try {
      const result = evaluateCard(card, '');
      const assisted = { ...result, correct: false, score: 0, explanation: `Modelul este „${result.expected.replace(/[.!?]+$/, '')}”. Observă tiparul; cardul va reveni.`, value: '', assisted: true };
      await Promise.all([persistAnswer(card, assisted), recordForYouEvent(card.id, 'reveal').then(setFeedState)]);
      completed.current.add(card.id); setAnswers((current) => ({ ...current, [card.id]: assisted })); setCombo(0);
    } catch (error: any) { setAnswers((current) => ({ ...current, [card.id]: { correct: false, score: 0, expected: '', explanation: String(error?.message ?? error), value: '', assisted: true } })); }
    finally { setCheckingId(''); }
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<ForYouCard>[] }) => {
    const visible = viewableItems.find((item) => item.isViewable && item.index != null);
    if (visible?.index != null) setActiveIndex(visible.index);
  }).current;

  if (loading) return <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner size="large" /><Muted style={{ marginTop: 12 }}>Îți pregătesc feedul personalizat…</Muted></View>;
  if (loadError) return <View style={{ flex: 1, backgroundColor: p.bg, padding: 18, paddingTop: insets.top + 18 }}><Banner kind="error">{loadError}</Banner><Button title="Reîncearcă" onPress={load} /></View>;
  if (!profile || !cards.length) return <View style={{ flex: 1, backgroundColor: p.bg, padding: 18, paddingTop: insets.top + 18 }}><Card><H1>Feedul este la zi</H1><Muted>Mai întâi adaugă vocabular sau fă o microlecție.</Muted></Card></View>;

  const savedCards = Object.values(feedState.savedCards).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const explanationCard = cards.find((card) => card.id === explanationCardId);
  const explanation = explanationCard ? buildForYouExplanation(explanationCard, Boolean(answers[explanationCard.id])) : null;

  return <View style={{ flex: 1, backgroundColor: p.bg }}>
    <View style={{ paddingTop: Math.max(insets.top, 8) + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: p.border, backgroundColor: p.navBg }}>
      <View><Text style={{ color: p.ink, fontWeight: '900', fontSize: 18 }}>Pentru tine</Text><Tiny>Adaptat pentru tine</Tiny></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{combo > 1 ? <Pill kind="xp">🔥 {combo} combo</Pill> : null}<TopAction icon="sliders" label={String(feedState.followedTopics.length)} onPress={() => setTopicSettingsOpen(true)} /><TopAction icon={soundEnabled ? 'volume' : 'ban'} onPress={() => setSoundEnabled((value) => !value)} /><TopAction icon="save" label={String(savedCards.length)} onPress={() => setLibraryOpen(true)} /></View>
    </View>
    <FlatList
      ref={listRef}
      data={cards}
      keyExtractor={(card) => card.id}
      renderItem={({ item, index }) => <ForYouCardView card={item} index={index} height={itemHeight} profile={profile} state={feedState} answer={answers[item.id]} draft={drafts[item.id] ?? ''} tokenOrder={tokenOrders[item.id] ?? []} hintsShown={hintSteps[item.id] ?? 0} discoveryStage={discoveryStages[item.id] ?? 'predict'} discoveryPrediction={discoveryPredictions[item.id]} discoverySupport={Boolean(discoverySupport[item.id])} checking={checkingId === item.id} speaking={speakingId === item.id} correctCount={correctCount} onDraft={(value) => setDrafts((current) => ({ ...current, [item.id]: value }))} onTokenOrder={(value) => setTokenOrders((current) => ({ ...current, [item.id]: value }))} onHint={() => { setHintSteps((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 })); void react(item, 'hint'); }} onDiscoveryStage={(value) => setDiscoveryStages((current) => ({ ...current, [item.id]: value }))} onDiscoveryPrediction={(value) => setDiscoveryPredictions((current) => ({ ...current, [item.id]: value }))} onDiscoverySupport={() => setDiscoverySupport((current) => ({ ...current, [item.id]: !current[item.id] }))} onSubmit={(value) => void submit(item, value)} onReveal={() => (item.kind === 'quiz' || item.kind === 'listening') && void revealModel(item)} onPlay={(text) => playCard(item, text)} onPracticed={() => markPracticed(item)} onReact={(event) => void react(item, event)} onToggleTopic={(topic) => void toggleTopic(topic)} onExplain={() => setExplanationCardId(item.id)} onNext={() => scrollTo(index + 1)} />}
      pagingEnabled
      snapToInterval={itemHeight}
      decelerationRate="fast"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
      onScroll={(event) => reportScroll(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      onEndReached={() => void appendMore()}
      onEndReachedThreshold={0.6}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={3}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews
      ListFooterComponent={<View style={{ height: 70, alignItems: 'center', justifyContent: 'center' }}>{loadingMore ? <Spinner /> : exhausted ? <Tiny>Ai ajuns la capătul feedului de azi.</Tiny> : null}</View>}
    />

    <Sheet visible={Boolean(explanation && explanationCard)} onClose={() => setExplanationCardId('')}>
      {explanation ? <View><Tiny>{explanation.eyebrow.toUpperCase()}</Tiny><H1>{explanation.title}</H1><Muted>{explanation.summary}</Muted>{explanation.pattern ? <Card><H2>Tiparul</H2><Muted>{explanation.pattern}</Muted></Card> : null}{explanation.example?.en ? <Card><H2>Exemplu concret</H2><Text style={{ color: p.ink, fontWeight: '800', fontSize: 17 }}>{explanation.example.en}</Text>{explanation.example.ro ? <Tiny>{explanation.example.ro}</Tiny> : null}</Card> : null}{explanation.pitfall ? <Banner kind="warn">Capcana frecventă: {explanation.pitfall}</Banner> : null}<Banner kind="info">Cum o fixezi: {explanation.memoryTip}</Banner><Button title="Am înțeles" variant="primary" onPress={() => setExplanationCardId('')} /></View> : null}
    </Sheet>
    <Sheet visible={topicSettingsOpen} onClose={() => setTopicSettingsOpen(false)}>
      <H1>Ce vrei să descoperi?</H1><Muted>Urmărește subiectele preferate. Feedul învață și din răspunsuri, salvări și aprecieri.</Muted>{(Object.entries(DISCOVERY_TOPICS) as [DiscoveryTopic, (typeof DISCOVERY_TOPICS)[DiscoveryTopic]][]).map(([topic, details]) => { const followed = feedState.followedTopics.includes(topic); return <Card key={topic} onPress={() => void toggleTopic(topic)} style={{ borderColor: followed ? p.primary : p.border }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ fontSize: 28 }}>{details.emoji}</Text><View style={{ flex: 1 }}><Text style={{ color: p.ink, fontWeight: '800' }}>{details.label}</Text><Tiny>{details.description}</Tiny></View><Text style={{ color: followed ? p.success : p.muted, fontWeight: '900' }}>{followed ? '✓' : '+'}</Text></View></Card>; })}<Banner kind="info">Dificultatea și ordinea se adaptează după progresul, răspunsurile și preferințele tale.</Banner>
    </Sheet>
    <Sheet visible={libraryOpen} onClose={() => setLibraryOpen(false)}>
      <H1>Colecția ta</H1><Muted>Expresii și carduri salvate pentru mai târziu.</Muted>{savedCards.length ? savedCards.map((saved) => <Card key={saved.id} onPress={() => { const index = cards.findIndex((card) => card.id === saved.id); if (index >= 0) scrollTo(index); setLibraryOpen(false); }}><Text style={{ color: p.ink, fontWeight: '800' }}>{saved.title}</Text><Tiny>{saved.subtitle}</Tiny></Card>) : <Banner kind="info">Apasă „Salvează” pe orice card care merită păstrat.</Banner>}
    </Sheet>
  </View>;
}

function TopAction({ icon, label, onPress }: { icon: 'sliders' | 'volume' | 'ban' | 'save'; label?: string; onPress: () => void }) {
  const p = usePalette();
  return <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ minWidth: 38, height: 38, borderRadius: 19, backgroundColor: p.card, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}><Icon name={icon} size={17} color={p.ink2} />{label ? <Text style={{ position: 'absolute', right: -1, top: -4, color: p.primaryDeep, backgroundColor: p.primarySoft, borderRadius: 9, minWidth: 16, textAlign: 'center', fontSize: 9, fontWeight: '900' }}>{label}</Text> : null}</Pressable>;
}

function ForYouCardView({ card, index, height, profile, state, answer, draft, tokenOrder, hintsShown, discoveryStage, discoveryPrediction, discoverySupport, checking, speaking, correctCount, onDraft, onTokenOrder, onHint, onDiscoveryStage, onDiscoveryPrediction, onDiscoverySupport, onSubmit, onReveal, onPlay, onPracticed, onReact, onToggleTopic, onExplain, onNext }: { card: ForYouCard; index: number; height: number; profile: Profile; state: ForYouState; answer?: AnswerState; draft: string; tokenOrder: number[]; hintsShown: number; discoveryStage: 'predict' | 'learn' | 'check'; discoveryPrediction?: string; discoverySupport: boolean; checking: boolean; speaking: boolean; correctCount: number; onDraft: (value: string) => void; onTokenOrder: (value: number[]) => void; onHint: () => void; onDiscoveryStage: (value: 'predict' | 'learn' | 'check') => void; onDiscoveryPrediction: (value: string) => void; onDiscoverySupport: () => void; onSubmit: (value: string) => void; onReveal: () => void; onPlay: (text?: string) => void; onPracticed: () => void; onReact: (event: ForYouEvent) => void; onToggleTopic: (topic: DiscoveryTopic) => void; onExplain: () => void; onNext: () => void }) {
  const p = usePalette();
  const interaction = state.interactions[card.id];
  const options = optionsFor(card);
  const meta = learningMetaForCard(card);
  const guide = card.kind === 'quiz' || card.kind === 'listening' ? forYouExerciseGuide(card.lesson, card.exercise) : null;
  const control = card.kind === 'quiz' || card.kind === 'listening' ? forYouExerciseControl(card.exercise) : null;
  const context = card.kind === 'mistake' ? mistakeContext(card.mistake) : null;
  const orderedTokens = card.kind === 'quiz' && control === 'order' ? tokenOrder.map((tokenIndex) => card.exercise.tokens?.[tokenIndex] ?? '') : [];
  const passiveCompleted = Boolean(interaction?.completions);
  return <View style={{ height, paddingHorizontal: 12, paddingVertical: 10 }}>
    <View style={{ flex: 1, borderRadius: 26, backgroundColor: card.kind === 'discovery' ? p.primarySoft : p.card, borderWidth: 1, borderColor: card.kind === 'discovery' ? p.primary : p.border, overflow: 'hidden' }}>
      <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><Pill kind="badgeSoft">{card.kind === 'quiz' || card.kind === 'listening' ? forYouExerciseLabel(card.exercise) : KIND_LABELS[card.kind]}</Pill><Tiny>{meta.label} · {meta.difficulty}</Tiny></View>
        <CardBody card={card} profile={profile} answer={answer} guide={guide} context={context} discoveryStage={discoveryStage} discoveryPrediction={discoveryPrediction} discoverySupport={discoverySupport} speaking={speaking} passiveCompleted={passiveCompleted} onPrediction={(value) => { onDiscoveryPrediction(value); onDiscoveryStage('learn'); }} onDiscoverySupport={onDiscoverySupport} onDiscoveryStage={onDiscoveryStage} onPlay={onPlay} onPracticed={onPracticed} />

        {(card.kind === 'quiz' || card.kind === 'listening') && control === 'unsupported' && !answer ? <Banner kind="warn">Exercițiul nu are toate datele necesare. Îl poți sări fără să-ți afecteze progresul.</Banner> : null}
        {card.kind === 'quiz' && control === 'order' && !answer ? <View><View style={{ minHeight: 58, backgroundColor: p.bgSoft, borderRadius: 14, padding: 12 }}><Text style={{ color: orderedTokens.length ? p.ink : p.muted }}>{orderedTokens.length ? orderedTokens.join(' ') : 'Atinge elementele în ordinea propoziției…'}</Text></View><ChipRow>{(card.exercise.tokens ?? []).map((token, tokenIndex) => tokenOrder.includes(tokenIndex) ? null : <Chip key={`${token}-${tokenIndex}`} label={token} onPress={() => onTokenOrder([...tokenOrder, tokenIndex])} />)}</ChipRow><ButtonRow><Button title="Ultimul" icon="undo" onPress={() => onTokenOrder(tokenOrder.slice(0, -1))} disabled={!tokenOrder.length} /><Button title="Verifică" variant="primary" busy={checking} onPress={() => onSubmit(joinOrderTokens(orderedTokens))} disabled={tokenOrder.length !== (card.exercise.tokens?.length ?? 0)} /></ButtonRow></View> : null}
        {card.interactive && !answer && (card.kind !== 'discovery' || discoveryStage === 'check') && !(card.kind === 'quiz' && control === 'order') && control !== 'unsupported' ? options.length > 1 ? <View style={{ gap: 8, marginTop: 14 }}>{options.map((option) => <Button key={option} title={option} onPress={() => onSubmit(option)} disabled={checking} style={{ justifyContent: 'flex-start' }} />)}</View> : <View><Field value={draft} onChange={onDraft} placeholder={card.kind === 'quiz' || card.kind === 'listening' ? forYouInputPlaceholder(card.exercise) : 'Scrie răspunsul în engleză…'} /><Button title="Verifică" variant="primary" busy={checking} disabled={!draft.trim()} onPress={() => onSubmit(draft)} /></View> : null}
        {(card.kind === 'quiz' || card.kind === 'listening') && !answer && control === 'text' && guide?.hints.length ? <View style={{ marginTop: 12 }}>{guide.hints.slice(0, hintsShown).map((hint, i) => <Banner key={i} kind="info">{hint}</Banner>)}{hintsShown < guide.hints.length ? <Button title={hintsShown ? 'Mai vreau un indiciu' : 'Dă-mi un indiciu'} icon="lightbulb" variant="ghost" onPress={onHint} /> : <Button title="Arată răspunsul-model" variant="ghost" onPress={onReveal} />}</View> : null}
        {answer ? <Banner kind={answer.correct ? 'success' : 'warn'}>{answer.correct ? 'Corect · +4 XP' : answer.assisted ? 'Acum ai modelul' : 'Mai fixăm o dată'} — {answer.explanation}</Banner> : null}
        <ButtonRow><Button title="Explică-mi" icon="help" variant="ghost" onPress={onExplain} />{answer ? <Button title="Următorul" variant="primary" onPress={onNext} /> : null}</ButtonRow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 8, borderTopWidth: 1, borderColor: p.border }}>
          {card.kind === 'discovery' ? <ActionChip label={state.followedTopics.includes(card.discovery.topic) ? 'Urmărit' : 'Urmărește'} selected={state.followedTopics.includes(card.discovery.topic)} onPress={() => onToggleTopic(card.discovery.topic)} /> : null}
          <ActionChip label="Îmi place" selected={interaction?.liked} onPress={() => onReact('like')} />
          <ActionChip label="Salvează" selected={interaction?.saved} onPress={() => onReact('save')} />
          {!card.interactive ? <ActionChip label="Știam" selected={interaction?.known} onPress={() => onReact('known')} /> : null}
          <ActionChip label="Nu vreau" onPress={() => onReact('hide')} />
        </View>
        <Tiny style={{ marginTop: 12 }}>{card.reason}</Tiny><Tiny>{LANE_LABELS[card.lane]} · {correctCount} răspunsuri corecte azi · card {index + 1}</Tiny>
      </ScrollView>
    </View>
  </View>;
}

function ActionChip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) { return <Chip label={label} selected={selected} onPress={onPress} />; }

function CardBody({ card, profile, answer, guide, context, discoveryStage, discoveryPrediction, discoverySupport, speaking, passiveCompleted, onPrediction, onDiscoverySupport, onDiscoveryStage, onPlay, onPracticed }: { card: ForYouCard; profile: Profile; answer?: AnswerState; guide: ReturnType<typeof forYouExerciseGuide> | null; context: ReturnType<typeof mistakeContext> | null; discoveryStage: 'predict' | 'learn' | 'check'; discoveryPrediction?: string; discoverySupport: boolean; speaking: boolean; passiveCompleted: boolean; onPrediction: (value: string) => void; onDiscoverySupport: () => void; onDiscoveryStage: (value: 'predict' | 'learn' | 'check') => void; onPlay: (text?: string) => void; onPracticed: () => void }) {
  const p = usePalette();
  if (card.kind === 'discovery') {
    const topic = DISCOVERY_TOPICS[card.discovery.topic];
    if (discoveryStage === 'predict') return <View style={{ marginTop: 18 }}><Tiny>{topic.emoji} {topic.label} · ~1 min</Tiny><H1>{card.discovery.titleRo}</H1><Text style={{ color: p.primaryDeep, fontSize: 18, lineHeight: 26, fontStyle: 'italic' }}>“{card.discovery.hookEn}”</Text><H2>{card.discovery.prediction.promptRo}</H2><View style={{ gap: 8 }}>{card.discovery.prediction.options.map((option) => <Button key={option} title={option} onPress={() => onPrediction(option)} style={{ justifyContent: 'flex-start' }} />)}</View><Tiny style={{ marginTop: 10 }}>Nu pierzi nimic dacă nu ghicești. Curiozitatea este primul pas.</Tiny></View>;
    if (discoveryStage === 'learn') return <View style={{ marginTop: 18 }}><Banner kind={normalizeAnswer(discoveryPrediction ?? '') === normalizeAnswer(card.discovery.prediction.answer) ? 'success' : 'info'}>{normalizeAnswer(discoveryPrediction ?? '') === normalizeAnswer(card.discovery.prediction.answer) ? 'Ai intuit!' : 'Surpriză!'} {card.discovery.prediction.revealRo}</Banner><Tiny>Descoperă în engleză · nivel {profile.currentLevel}</Tiny><H1>{card.discovery.titleEn}</H1><Text style={{ color: p.ink, fontSize: 17, lineHeight: 27 }}>{discoveryArticle(card.discovery, profile.currentLevel)}</Text><ChipRow>{card.discovery.vocabulary.map((item) => <Chip key={item.word} label={`${item.word} · ${item.translation}`} />)}</ChipRow>{discoverySupport ? <Banner kind="info">{card.discovery.supportRo}</Banner> : null}<ButtonRow><Button title={discoverySupport ? 'Ascunde ajutorul' : 'Ajutor în română'} icon="languages" onPress={onDiscoverySupport} /><Button title="Ascultă" icon={speaking ? 'audio' : 'volume'} onPress={() => onPlay(discoveryArticle(card.discovery, profile.currentLevel))} /></ButtonRow><Button title="Verifică ce ai înțeles" variant="primary" onPress={() => onDiscoveryStage('check')} /></View>;
    return <View style={{ marginTop: 18 }}><Tiny>{topic.emoji} Test de înțelegere</Tiny><H1>{card.discovery.check.promptRo}</H1>{!answer ? <Muted>Răspunde fără să revii la text. Efortul de a-ți aminti fixează ideea.</Muted> : <Card><Tiny>Poți explica acum în engleză:</Tiny><Text style={{ color: p.ink, fontWeight: '800', fontSize: 17 }}>“{card.discovery.takeawayEn}”</Text></Card>}</View>;
  }
  if (card.kind === 'phrase') return <View style={{ marginTop: 18 }}><Tiny>EXPRESIE PENTRU CONVERSAȚIE</Tiny><H1>“{card.english}”</H1><Text style={{ color: p.primaryDeep, fontSize: 17 }}>{card.romanian}</Text><Muted style={{ marginTop: 10 }}>Când o folosești: {card.lesson.scenario_ro || card.lesson.purpose_ro}</Muted><SpeakPractice target={card.english} completed={passiveCompleted} playing={speaking} onPlay={() => onPlay(card.english)} onComplete={onPracticed} /></View>;
  if (card.kind === 'dialogue') { const target = card.lines.at(-1)?.text ?? ''; return <View style={{ marginTop: 18 }}><Tiny>{card.topic.toUpperCase()}</Tiny><View style={{ gap: 8, marginTop: 10 }}>{card.lines.map((line, i) => <View key={`${line.speaker}-${i}`} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: i % 2 ? p.primarySoft : p.bgSoft, borderRadius: 16, padding: 12 }}><Tiny>{line.speaker}{i === card.lines.length - 1 ? ' · replica ta' : ''}</Tiny><Text style={{ color: p.ink, lineHeight: 22 }}>{line.text}</Text></View>)}</View><Muted style={{ marginTop: 10 }}>Situația: {card.lesson.scenario_ro || card.lesson.purpose_ro}</Muted><Button title="Ascultă dialogul" icon="volume" onPress={() => onPlay()} /><SpeakPractice target={target} completed={passiveCompleted} playing={speaking} onPlay={() => onPlay(target)} onComplete={onPracticed} /></View>; }
  if (card.kind === 'insight') return <View style={{ marginTop: 18 }}><Tiny>REGULA ÎN 20 DE SECUNDE</Tiny><H1>{card.topic}</H1><Text style={{ color: p.ink, fontSize: 18, lineHeight: 27, fontWeight: '700' }}>{card.rule}</Text><Card style={{ backgroundColor: p.primarySoft }}><Text style={{ color: p.primaryDeep, fontWeight: '800', fontSize: 17 }}>{card.example}</Text><Tiny>{card.translation}</Tiny></Card><Muted>De ce contează: {card.lesson.purpose_ro || card.lesson.objective_ro}</Muted><Button title={passiveCompleted ? 'Am înțeles regula' : 'Am înțeles — continuă'} icon="checkCircle" variant={passiveCompleted ? 'success' : 'primary'} disabled={passiveCompleted} onPress={onPracticed} style={{ marginTop: 10 }} /></View>;
  if (card.kind === 'story') return <View style={{ marginTop: 18 }}><Tiny>{card.episode.series.toUpperCase()}</Tiny><H1>{card.episode.title}</H1><Text style={{ color: p.ink, fontSize: 17, lineHeight: 27 }}>{card.episode.text}</Text><H2>{card.episode.question}</H2></View>;
  if (card.kind === 'quiz') return <View style={{ marginTop: 18 }}><Tiny>{guide?.kicker}</Tiny><H1>{guide?.title}</H1><Banner kind="info">Ce exersezi: {guide?.mission}</Banner>{guide?.target ? <Card><Tiny>{guide.targetLabel}</Tiny><Text style={{ color: p.ink, fontWeight: '800', fontSize: 17 }}>„{guide.target}”</Text></Card> : null}{guide?.context ? <Muted>Situația: {guide.context}</Muted> : null}</View>;
  if (card.kind === 'listening') return <View style={{ marginTop: 18, alignItems: 'center' }}><View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={speaking ? 'audio' : 'headphones'} size={42} color={p.primaryDeep} /></View><Tiny style={{ marginTop: 12 }}>{guide?.kicker}</Tiny><H1 style={{ textAlign: 'center' }}>{guide?.title}</H1><Banner kind="info">Ce urmărești: {guide?.mission}</Banner><Button title="Redă din nou" icon="volume" onPress={() => onPlay()} /></View>;
  if (card.kind === 'mistake') return <View style={{ marginTop: 18 }}><Tiny>CORECTURĂ DIN ISTORICUL TĂU</Tiny><H1>Care variantă se potrivește contextului?</H1><Card style={{ backgroundColor: p.bgSoft }}><Tiny>{context?.label}</Tiny><Text style={{ color: p.ink, fontSize: 16, lineHeight: 24 }}>{context?.text}</Text></Card><Muted>{context?.limited ? 'Istoricul păstrează doar acest indiciu. Fără context, ambele forme pot fi corecte.' : 'Ambele forme pot fi corecte în alte contexte; aici alegem forma potrivită situației.'}</Muted></View>;
  if (card.kind === 'vocab') return <View style={{ marginTop: 18 }}><Tiny>ACTIVEAZĂ EXPRESIA</Tiny><H1>Cum spui în engleză?</H1><Text style={{ color: p.primaryDeep, fontWeight: '800', fontSize: 25, marginVertical: 12 }}>{card.vocab.translation}</Text>{card.vocab.example ? <Tiny>Indiciu: apare într-o propoziție pe care ai salvat-o.</Tiny> : null}</View>;
  return null;
}

function SpeakPractice({ target, completed, playing, onPlay, onComplete }: { target: string; completed: boolean; playing: boolean; onPlay: () => void; onComplete: () => void }) {
  const p = usePalette();
  const recorder = useRef(new Recorder());
  const [recording, setRecording] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => () => recorder.current.cancel(), []);
  async function toggle() {
    if (recording) {
      setRecording(false);
      try { const audio = await recorder.current.stop(); let text = ''; try { ({ text } = await transcribe(audio, undefined, referenceHint(target))); } finally { await audio.dispose(); } const result = sttDiffAssessment(target, text).accuracyScore; setScore(result); if (result >= 60) { await bumpActivity('pronPhrases', 1).catch(() => {}); await addXp(result >= 85 ? 5 : 3).catch(() => {}); onComplete(); } } catch { setScore(0); }
      return;
    }
    try { await recorder.current.start(); setRecording(true); } catch { setScore(0); }
  }
  return <Card style={{ marginTop: 14 }}><Tiny>ASCULTĂ ȘI REPETĂ</Tiny><ButtonRow><Button title={playing ? 'Se redă…' : 'Ascultă'} icon="volume" onPress={onPlay} /><Button title={recording ? 'Oprește' : 'Repetă'} icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'primary'} onPress={toggle} /></ButtonRow>{score != null ? <Text style={{ color: score >= 60 ? p.success : p.warnInk, fontWeight: '800' }}>{score >= 85 ? 'Foarte bine' : score >= 60 ? 'Bine — expresia este fixată' : 'Mai încearcă o dată'} · {score}%</Text> : completed ? <Text style={{ color: p.success, fontWeight: '800' }}>✓ Exersat</Text> : null}</Card>;
}
