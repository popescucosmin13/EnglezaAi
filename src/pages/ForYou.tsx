import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addXp, bumpActivity, defaultProfile, getProfile, saveVocab } from '../db/db';
import { containsExpression, reviewMistake } from '../logic/engine';
import { mistakeContext } from '../logic/mistake-context';
import { evaluateCurriculumAnswer, normalizeAnswer } from '../microlearning/curriculum';
import { recordExerciseAttempt } from '../microlearning/state';
import { applyReview } from '../srs/ladder';
import type { CardEvaluation } from '../microlearning/types';
import type { Profile } from '../types';
import { Icon } from '../components/Icon';
import { ForYouSpeakPractice } from '../components/ForYouSpeakPractice';
import { buildForYouFeed, buildForYouPreviewFeed, savedSnapshot, spokenTextForCard } from '../foryou/feed';
import { DISCOVERY_TOPICS, discoveryArticle } from '../foryou/discovery';
import {
  forYouExerciseControl,
  forYouExerciseLabel,
  forYouInputPlaceholder,
  joinOrderTokens,
} from '../foryou/exercise';
import { buildForYouExplanation, curriculumFeedback } from '../foryou/explanations';
import { learningKeysForCard } from '../foryou/identity';
import { forYouExerciseGuide, learningMetaForCard } from '../foryou/learning';
import { emptyForYouState, getForYouState, recordForYouEvent, toggleDiscoveryTopic } from '../foryou/state';
import type { ForYouCard, ForYouEvent, ForYouState } from '../foryou/types';

interface AnswerState extends CardEvaluation {
  value: string;
  assisted?: boolean;
}

const KIND_LABELS: Record<ForYouCard['kind'], string> = {
  phrase: 'Expresie',
  dialogue: 'Mini-dialog',
  insight: 'Aha rapid',
  story: 'Serial',
  quiz: 'Alege',
  listening: 'Ascultare',
  mistake: 'Capcana ta',
  vocab: 'Vocabular',
  discovery: 'Știai că?',
};

const LANE_LABELS = {
  weakness: 'Pentru punctul tău slab',
  interest: 'Din interesele tale',
  srs: 'Fix înainte să uiți',
  new: 'Nou pentru tine',
  surprise: 'Surpriză',
  discovery: 'Descoperă lumea',
};

function localSpeak(text: string, profile: Profile, onDone: () => void): void {
  const synth = window.speechSynthesis;
  if (!synth || !text.trim()) { onDone(); return; }
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = profile.aiSpeed === 'lent' ? 0.82 : profile.aiSpeed === 'provocare' ? 1.06 : 0.94;
  const voices = synth.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase() === 'en-us')
    ?? voices.find((voice) => voice.lang.toLowerCase().startsWith('en'))
    ?? null;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  synth.speak(utterance);
}

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
    return {
      correct,
      score: correct ? 100 : 0,
      expected: card.discovery.check.answer,
      explanation: correct
        ? card.discovery.check.explanationRo
        : `${card.discovery.check.explanationRo} Răspuns: ${card.discovery.check.answer}`,
    };
  }
  if (card.kind === 'quiz' || card.kind === 'listening') {
    const result = evaluateCurriculumAnswer(card.exercise, value);
    return { ...result, explanation: curriculumFeedback(card.exercise, card.lesson, result) };
  }
  if (card.kind === 'story') {
    const correct = normalizeAnswer(value) === normalizeAnswer(card.episode.answer);
    return {
      correct,
      score: correct ? 100 : 0,
      expected: card.episode.answer,
      explanation: correct
        ? `Ai identificat indiciul care susține „${card.episode.answer}”. Rezumă acum episodul fără să recitești.`
        : `Răspunsul este „${card.episode.answer}”. Recitește întrebarea și caută propoziția care oferă exact acea informație.`,
    };
  }
  if (card.kind === 'mistake') {
    const targets = [card.mistake.correctFragment, card.mistake.corrected].filter((item): item is string => Boolean(item));
    const correct = targets.some((target) => normalizeAnswer(value) === normalizeAnswer(target));
    return {
      correct,
      score: correct ? 100 : 0,
      expected: card.mistake.correctFragment ?? card.mistake.corrected,
      explanation: correct
        ? `„${card.mistake.correctFragment ?? card.mistake.corrected}” se potrivește contextului salvat. ${card.mistake.explanationRo} Cealaltă formă poate rămâne corectă într-o altă situație.`
        : `Aici se potrivește „${card.mistake.correctFragment ?? card.mistake.corrected}”. ${card.mistake.explanationRo} Compară timpul, persoana și intenția contextului, nu doar cele două forme.`,
    };
  }
  if (card.kind === 'vocab') {
    const correct = containsExpression(value, card.vocab.word);
    return {
      correct,
      score: correct ? 100 : 0,
      expected: card.vocab.word,
      explanation: correct
        ? `Ai recuperat „${card.vocab.word}” fără să o vezi. Folosește-o acum într-o propoziție adevărată despre tine pentru a o muta spre vocabular activ.`
        : `Expresia căutată este „${card.vocab.word}”. Leag-o de exemplul „${card.vocab.personalExample || card.vocab.example}”, apoi încearcă din nou fără indiciu.`,
    };
  }
  return { correct: true, score: 100, expected: '', explanation: '' };
}

async function persistAnswer(card: ForYouCard, result: CardEvaluation): Promise<void> {
  if (card.kind === 'quiz' || card.kind === 'listening') {
    await recordExerciseAttempt(card.exercise.id, card.lesson.lesson_id, result.correct, result.score);
  } else if (card.kind === 'mistake') {
    await reviewMistake(card.mistake, result.correct ? 'good' : 'fail');
  } else if (card.kind === 'vocab') {
    const next = {
      ...card.vocab,
      recognized: card.vocab.recognized || result.correct,
      passiveScore: result.correct ? Math.min(100, card.vocab.passiveScore + 8) : card.vocab.passiveScore,
      review: applyReview(card.vocab.review, result.correct ? 'good' : 'fail'),
    };
    await saveVocab(next);
    await bumpActivity('vocabReviews', 1).catch(() => {});
  }
}

export default function ForYou() {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('preview') === '1';
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
  const streamRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const cardsRef = useRef<ForYouCard[]>([]);
  const viewedThisSession = useRef(new Set<string>());
  const completedThisSession = useRef(new Set<string>());
  const batch = useRef(1);
  const loadingMoreRef = useRef(false);
  const resumeId = useRef('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      if (previewMode) {
        const currentProfile: Profile = {
          ...defaultProfile(),
          onboarded: true,
          currentLevel: 'B1',
          targetLevel: 'B2',
          mainObjective: 'Engleză pentru muncă, tehnologie și călătorii',
          interests: ['tehnologie', 'călătorii', 'business'],
        };
        const initial = await buildForYouPreviewFeed(currentProfile);
        setProfile(currentProfile);
        setCards(initial);
        cardsRef.current = initial;
        setExhausted(true);
        return;
      }
      const [currentProfile, state] = await Promise.all([getProfile(), getForYouState()]);
      const initial = await buildForYouFeed({ profile: currentProfile, state, count: 18 });
      setProfile(currentProfile);
      setFeedState(state);
      setCards(initial);
      cardsRef.current = initial;
      resumeId.current = state.resumeCardId;
      batch.current = 1;
      setExhausted(initial.length === 0);
    } catch (error: any) {
      setLoadError(String(error?.message ?? error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  useEffect(() => {
    if (!cards.length || !resumeId.current) return;
    const index = cards.findIndex((card) => card.id === resumeId.current);
    if (index <= 0) return;
    const timer = window.setTimeout(() => {
      cardRefs.current[index]?.scrollIntoView({ block: 'start', behavior: 'auto' });
      setActiveIndex(index);
      resumeId.current = '';
    }, 80);
    return () => window.clearTimeout(timer);
  }, [cards.length]);

  useEffect(() => {
    const root = streamRef.current;
    if (!root || !cards.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = Number((visible.target as HTMLElement).dataset.index);
      if (Number.isFinite(index)) setActiveIndex(index);
    }, { root, threshold: [0.55, 0.72, 0.9] });
    cardRefs.current.slice(0, cards.length).forEach((element) => { if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [cards.length]);

  async function appendMore() {
    if (previewMode || !profile || loadingMoreRef.current || exhausted) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const latestState = await getForYouState();
      const more = await buildForYouFeed({
        profile,
        state: latestState,
        count: 10,
        excludedIds: cardsRef.current.map((card) => card.id),
        excludedLearningKeys: cardsRef.current.flatMap(learningKeysForCard),
        batch: batch.current,
      });
      batch.current += 1;
      if (!more.length) setExhausted(true);
      else setCards((current) => [...current, ...more]);
    } catch {
      // Feedul deja încărcat rămâne utilizabil chiar dacă extensia eșuează temporar.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const card = cards[activeIndex];
    if (!card || !profile) return;
    const viewTimer = window.setTimeout(() => {
      if (viewedThisSession.current.has(card.id)) return;
      viewedThisSession.current.add(card.id);
      if (!previewMode) void recordForYouEvent(
        card.id,
        'view',
        undefined,
        card.kind === 'discovery' ? card.discovery.topic : undefined,
      ).then(setFeedState).catch(() => {});
    }, 650);
    const spoken = spokenTextForCard(card);
    const audioTimer = soundEnabled && spoken ? window.setTimeout(() => {
      setSpeakingId(card.id);
      localSpeak(spoken, profile, () => setSpeakingId((current) => current === card.id ? '' : current));
    }, 320) : 0;
    if (activeIndex >= cards.length - 4) void appendMore();
    return () => {
      window.clearTimeout(viewTimer);
      if (audioTimer) window.clearTimeout(audioTimer);
      window.speechSynthesis?.cancel();
      setSpeakingId('');
    };
    // appendMore folosește refs pentru lista curentă, evitând relansarea efectului la fiecare append.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, cards.length, profile, soundEnabled]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function scrollTo(index: number) {
    cardRefs.current[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function playCard(card: ForYouCard) {
    if (!profile) return;
    const spoken = spokenTextForCard(card);
    if (!spoken) return;
    setSpeakingId(card.id);
    localSpeak(spoken, profile, () => setSpeakingId((current) => current === card.id ? '' : current));
  }

  function playPracticeText(cardId: string, text: string) {
    if (!profile || !text.trim()) return;
    setSpeakingId(cardId);
    localSpeak(text, profile, () => setSpeakingId((current) => current === cardId ? '' : current));
  }

  function markCardPracticed(card: ForYouCard) {
    if (completedThisSession.current.has(card.id) || feedState.interactions[card.id]?.completions) return;
    completedThisSession.current.add(card.id);
    removeQueuedLearningDuplicates(card);
    void react(card, 'complete');
  }

  function removeQueuedLearningDuplicates(completedCard: ForYouCard) {
    const completedKeys = new Set(learningKeysForCard(completedCard));
    setCards((current) => {
      const next = current.filter((candidate, index) => (
        index <= activeIndex
        || !learningKeysForCard(candidate).some((key) => completedKeys.has(key))
      ));
      cardsRef.current = next;
      return next;
    });
  }

  async function react(card: ForYouCard, event: ForYouEvent) {
    if (previewMode) {
      setFeedState((current) => {
        const interaction = current.interactions[card.id] ?? {
          views: 0, completions: 0, answers: 0, correctAnswers: 0, hints: 0, reveals: 0,
          liked: false, saved: false, hidden: false, known: false, lastSeenAt: new Date().toISOString(), nextEligibleAt: '',
        };
        const next = { ...current, interactions: { ...current.interactions }, savedCards: { ...current.savedCards } };
        const updated = { ...interaction };
        if (event === 'like') updated.liked = !updated.liked;
        if (event === 'save') {
          updated.saved = !updated.saved;
          if (updated.saved) next.savedCards[card.id] = { ...savedSnapshot(card), savedAt: new Date().toISOString() };
          else delete next.savedCards[card.id];
        }
        if (event === 'known') updated.known = true;
        if (event === 'hide') updated.hidden = true;
        if (event === 'hint') updated.hints += 1;
        if (event === 'complete') updated.completions += 1;
        if (event === 'reveal') { updated.reveals += 1; updated.answers += 1; updated.completions += 1; }
        next.interactions[card.id] = updated;
        return next;
      });
      if (event === 'hide') scrollTo(Math.min(cards.length - 1, activeIndex + 1));
      return;
    }
    try {
      const next = await recordForYouEvent(
        card.id,
        event,
        event === 'save' ? savedSnapshot(card) : undefined,
        card.kind === 'discovery' ? card.discovery.topic : undefined,
      );
      setFeedState(next);
      if (event === 'hide') scrollTo(Math.min(cards.length - 1, activeIndex + 1));
    } catch {
      // Reacția rămâne disponibilă la următoarea încercare; nu blocăm feedul.
    }
  }

  async function toggleTopic(cardTopic: keyof typeof DISCOVERY_TOPICS) {
    if (previewMode) {
      setFeedState((current) => ({
        ...current,
        followedTopics: current.followedTopics.includes(cardTopic)
          ? current.followedTopics.filter((topic) => topic !== cardTopic)
          : [...current.followedTopics, cardTopic],
      }));
      return;
    }
    try {
      setFeedState(await toggleDiscoveryTopic(cardTopic));
    } catch {
      // Preferința poate fi reîncercată fără să întrerupă lecția curentă.
    }
  }

  async function submit(card: ForYouCard, value: string) {
    if (!value.trim() || checkingId || answers[card.id]) return;
    setCheckingId(card.id);
    try {
      const result = evaluateCard(card, value);
      if (!previewMode) {
        await persistAnswer(card, result);
        await Promise.all([
          recordForYouEvent(
            card.id,
            result.correct ? 'answer-correct' : 'answer-wrong',
            undefined,
            card.kind === 'discovery' ? card.discovery.topic : undefined,
          ).then(setFeedState),
          addXp(result.correct ? 4 : 1).catch(() => {}),
        ]);
      }
      completedThisSession.current.add(card.id);
      setAnswers((current) => ({ ...current, [card.id]: { ...result, value } }));
      if (result.correct) {
        removeQueuedLearningDuplicates(card);
        setCombo((current) => current + 1);
        setCorrectCount((current) => current + 1);
      } else setCombo(0);
    } catch (error: any) {
      setAnswers((current) => ({
        ...current,
        [card.id]: { correct: false, score: 0, expected: '', explanation: String(error?.message ?? error), value },
      }));
      setCombo(0);
    } finally {
      setCheckingId('');
    }
  }

  function submitDraft(event: FormEvent, card: ForYouCard) {
    event.preventDefault();
    void submit(card, drafts[card.id] ?? '');
  }

  function showNextHint(card: ForYouCard, hintCount: number) {
    const current = hintSteps[card.id] ?? 0;
    if (current >= hintCount) return;
    setHintSteps((steps) => ({ ...steps, [card.id]: current + 1 }));
    void react(card, 'hint');
  }

  async function revealModel(card: Extract<ForYouCard, { kind: 'quiz' | 'listening' }>) {
    if (checkingId || answers[card.id]) return;
    setCheckingId(card.id);
    try {
      const result = evaluateCard(card, '');
      const cleanExpected = result.expected.replace(/[.!?]+$/, '');
      const assistedResult: CardEvaluation = {
        ...result,
        correct: false,
        score: 0,
        explanation: `Modelul este „${cleanExpected}”. Nu trebuie memorat mecanic: compară-l cu sensul cerut și observă tiparul, apoi cardul va reveni pentru o nouă încercare.`,
      };
      if (!previewMode) {
        await Promise.all([
          persistAnswer(card, assistedResult),
          recordForYouEvent(card.id, 'reveal').then(setFeedState),
        ]);
      } else {
        await react(card, 'reveal');
      }
      completedThisSession.current.add(card.id);
      setAnswers((current) => ({ ...current, [card.id]: { ...assistedResult, value: '', assisted: true } }));
      setCombo(0);
    } catch (error: any) {
      setAnswers((current) => ({
        ...current,
        [card.id]: { correct: false, score: 0, expected: '', explanation: String(error?.message ?? error), value: '', assisted: true },
      }));
    } finally {
      setCheckingId('');
    }
  }

  if (loading) return <div className="page"><p><span className="spinner" /> Îți pregătesc feedul personalizat…</p></div>;
  if (loadError) return <div className="page"><div className="error-banner">{loadError}</div><button onClick={load}>Reîncearcă</button></div>;
  if (!profile || !cards.length) return <div className="page"><div className="card"><h1>Feedul este la zi</h1><p className="muted">Mai întâi adaugă vocabular sau fă o microlecție.</p></div></div>;

  const savedCards = Object.values(feedState.savedCards).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const explanationCard = cards.find((card) => card.id === explanationCardId);
  const explanationDetails = explanationCard
    ? buildForYouExplanation(explanationCard, Boolean(answers[explanationCard.id]))
    : null;

  return (
    <div className="for-you-page">
      <div className="for-you-topbar">
        <div>
          <strong>Pentru tine</strong>
          <span><Icon name="shieldCheck" size={13} /> Adaptat pentru tine</span>
        </div>
        <div className="for-you-top-actions">
          {combo > 1 && <span className="for-you-combo"><Icon name="flame" size={14} /> {combo} combo</span>}
          <button aria-label="Alege subiectele urmărite" onClick={() => setTopicSettingsOpen(true)}>
            <Icon name="sliders" size={18} /><small>{feedState.followedTopics.length}</small>
          </button>
          <button aria-label={soundEnabled ? 'Oprește sunetul automat' : 'Pornește sunetul automat'} aria-pressed={soundEnabled} onClick={() => setSoundEnabled((value) => !value)}>
            <Icon name={soundEnabled ? 'volume' : 'ban'} size={18} />
          </button>
          <button aria-label="Deschide colecția" onClick={() => setLibraryOpen(true)}>
            <Icon name="bookmark" size={18} /><small>{savedCards.length}</small>
          </button>
        </div>
      </div>

      <div className="for-you-stream" ref={streamRef}>
        {cards.map((card, index) => {
          const answer = answers[card.id];
          const interaction = feedState.interactions[card.id];
          const options = optionsFor(card);
          const savedMistakeContext = card.kind === 'mistake' ? mistakeContext(card.mistake) : null;
          const discoveryStage = card.kind === 'discovery' ? (discoveryStages[card.id] ?? 'predict') : null;
          const discoveryPrediction = card.kind === 'discovery' ? discoveryPredictions[card.id] : undefined;
          const exerciseControl = card.kind === 'quiz' || card.kind === 'listening'
            ? forYouExerciseControl(card.exercise)
            : null;
          const exerciseGuide = card.kind === 'quiz' || card.kind === 'listening'
            ? forYouExerciseGuide(card.lesson, card.exercise)
            : null;
          const learningMeta = learningMetaForCard(card);
          const visibleHints = exerciseGuide?.hints.slice(0, hintSteps[card.id] ?? 0) ?? [];
          const tokenOrder = card.kind === 'quiz' && exerciseControl === 'order'
            ? (tokenOrders[card.id] ?? [])
            : [];
          const orderedTokens = card.kind === 'quiz' && exerciseControl === 'order'
            ? tokenOrder.map((tokenIndex) => card.exercise.tokens?.[tokenIndex] ?? '')
            : [];
          const dialoguePracticeLine = card.kind === 'dialogue'
            ? (card.lines[card.lines.length - 1]?.text ?? '')
            : '';
          const passiveCompleted = Boolean(interaction?.completions || completedThisSession.current.has(card.id));
          const isActive = index === activeIndex;
          return (
            <article
              key={card.id}
              ref={(element) => { cardRefs.current[index] = element; }}
              data-index={index}
              className={`for-you-card for-you-${card.kind}${isActive ? ' is-active' : ''}`}
            >
              <div className="for-you-glow" />
              <div className="for-you-content">
                <div className="for-you-meta">
                  <span>{card.kind === 'quiz' || card.kind === 'listening' ? forYouExerciseLabel(card.exercise) : KIND_LABELS[card.kind]}</span>
                  <small>{learningMeta.label} · {learningMeta.difficulty}</small>
                </div>

                <div className="for-you-body">
                  {card.kind === 'discovery' && discoveryStage === 'predict' && (
                    <div className="for-you-discovery-step">
                      <div className="for-you-topic-line">
                        <span>{DISCOVERY_TOPICS[card.discovery.topic].emoji} {DISCOVERY_TOPICS[card.discovery.topic].label}</span>
                        <small>~1 min</small>
                      </div>
                      <p className="for-you-kicker">Mai întâi, fă o predicție</p>
                      <h1>{card.discovery.titleRo}</h1>
                      <p className="for-you-discovery-hook">“{card.discovery.hookEn}”</p>
                      <h2>{card.discovery.prediction.promptRo}</h2>
                      <div className="for-you-options for-you-prediction-options">
                        {card.discovery.prediction.options.map((option) => (
                          <button
                            key={option}
                            onClick={() => {
                              setDiscoveryPredictions((current) => ({ ...current, [card.id]: option }));
                              setDiscoveryStages((current) => ({ ...current, [card.id]: 'learn' }));
                            }}
                          >{option}</button>
                        ))}
                      </div>
                      <small className="for-you-no-penalty">Nu pierzi nimic dacă nu ghicești. Curiozitatea este primul pas.</small>
                    </div>
                  )}

                  {card.kind === 'discovery' && discoveryStage === 'learn' && (
                    <div className="for-you-discovery-step">
                      <div className={`for-you-prediction-result ${normalizeAnswer(discoveryPrediction ?? '') === normalizeAnswer(card.discovery.prediction.answer) ? 'correct' : ''}`}>
                        <strong>{normalizeAnswer(discoveryPrediction ?? '') === normalizeAnswer(card.discovery.prediction.answer) ? 'Ai intuit!' : 'Surpriză!'}</strong>
                        <span>{card.discovery.prediction.revealRo}</span>
                      </div>
                      <p className="for-you-kicker">Descoperă în engleză · nivel {profile.currentLevel}</p>
                      <h1>{card.discovery.titleEn}</h1>
                      <p className="for-you-discovery-article">{discoveryArticle(card.discovery, profile.currentLevel)}</p>
                      <div className="for-you-vocab-chips">
                        {card.discovery.vocabulary.map((item) => (
                          <span key={item.word} title={item.meaningEn}><strong>{item.word}</strong> · {item.translation}</span>
                        ))}
                      </div>
                      {discoverySupport[card.id] && <p className="for-you-discovery-support">{card.discovery.supportRo}</p>}
                      <div className="for-you-discovery-actions">
                        <button onClick={() => setDiscoverySupport((current) => ({ ...current, [card.id]: !current[card.id] }))}>
                          <Icon name="languages" size={16} /> {discoverySupport[card.id] ? 'Ascunde ajutorul' : 'Ajutor în română'}
                        </button>
                        <button onClick={() => {
                          setSpeakingId(card.id);
                          localSpeak(discoveryArticle(card.discovery, profile.currentLevel), profile, () => setSpeakingId(''));
                        }}>
                          <Icon name={speakingId === card.id ? 'audio' : 'volume'} size={16} /> Ascultă
                        </button>
                      </div>
                      <button className="btn-primary for-you-check-button" onClick={() => setDiscoveryStages((current) => ({ ...current, [card.id]: 'check' }))}>
                        Verifică ce ai înțeles <Icon name="arrowUpRight" />
                      </button>
                      <a className="for-you-source" href={card.discovery.source.url} target="_blank" rel="noreferrer">
                        Sursă verificată: {card.discovery.source.label} <Icon name="arrowUpRight" size={13} />
                      </a>
                    </div>
                  )}

                  {card.kind === 'discovery' && discoveryStage === 'check' && (
                    <div className="for-you-discovery-step">
                      <div className="for-you-topic-line">
                        <span>{DISCOVERY_TOPICS[card.discovery.topic].emoji} Test de înțelegere</span>
                        <small>{card.discovery.vocabulary[0]?.word}</small>
                      </div>
                      <p className="for-you-kicker">Recuperează ideea din memorie</p>
                      <h1>{card.discovery.check.promptRo}</h1>
                      {!answer && <p className="for-you-discovery-hint">Răspunde fără să revii la text. Efortul de a-ți aminti fixează ideea.</p>}
                      {answer && (
                        <div className="for-you-takeaway">
                          <small>Poți explica acum în engleză:</small>
                          <strong>“{card.discovery.takeawayEn}”</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {card.kind === 'phrase' && (
                    <>
                      <p className="for-you-kicker">Expresie pentru conversație</p>
                      <h1>“{card.english}”</h1>
                      <p className="for-you-translation">{card.romanian}</p>
                      <p className="for-you-passive-context"><strong>Când o folosești:</strong> {card.lesson.scenario_ro || card.lesson.purpose_ro}</p>
                      <ForYouSpeakPractice
                        target={card.english}
                        active={isActive}
                        isPlaying={speakingId === card.id}
                        completed={passiveCompleted}
                        onPlay={() => playPracticeText(card.id, card.english)}
                        onComplete={() => markCardPracticed(card)}
                      />
                    </>
                  )}
                  {card.kind === 'dialogue' && (
                    <>
                      <p className="for-you-kicker">{card.topic}</p>
                      <div className="for-you-dialogue-lines">
                        {card.lines.map((line, lineIndex) => (
                          <div key={`${line.speaker}-${lineIndex}`} className={lineIndex % 2 ? 'reply' : ''}>
                            <small>{line.speaker}{lineIndex === card.lines.length - 1 ? ' · replica ta' : ''}</small><p>{line.text}</p>
                          </div>
                        ))}
                      </div>
                      <p className="for-you-passive-context"><strong>Situația:</strong> {card.lesson.scenario_ro || card.lesson.purpose_ro}</p>
                      <button className="for-you-listen-inline" onClick={() => playCard(card)}>
                        <Icon name={speakingId === card.id ? 'audio' : 'volume'} size={17} /> Ascultă dialogul complet
                      </button>
                      <ForYouSpeakPractice
                        target={dialoguePracticeLine}
                        active={isActive}
                        compact
                        isPlaying={speakingId === card.id}
                        completed={passiveCompleted}
                        onPlay={() => playPracticeText(card.id, dialoguePracticeLine)}
                        onComplete={() => markCardPracticed(card)}
                      />
                    </>
                  )}
                  {card.kind === 'insight' && (
                    <>
                      <p className="for-you-kicker">Regula în 20 de secunde</p>
                      <h1>{card.topic}</h1>
                      <p className="for-you-rule">{card.rule}</p>
                      <div className="for-you-example"><strong>{card.example}</strong><span>{card.translation}</span></div>
                      <p className="for-you-passive-context"><strong>De ce contează:</strong> {card.lesson.purpose_ro || card.lesson.objective_ro}</p>
                      {passiveCompleted ? (
                        <div className="for-you-passive-complete"><Icon name="checkCircle" size={17} /> Am înțeles regula</div>
                      ) : (
                        <button className="for-you-understood" onClick={() => markCardPracticed(card)}>
                          <Icon name="checkCircle" size={18} /> Am înțeles — continuă
                        </button>
                      )}
                    </>
                  )}
                  {card.kind === 'story' && (
                    <>
                      <p className="for-you-kicker">{card.episode.series}</p>
                      <h1>{card.episode.title}</h1>
                      <p className="for-you-story-text">{card.episode.text}</p>
                      <h2>{card.episode.question}</h2>
                    </>
                  )}
                  {card.kind === 'quiz' && (
                    <>
                      <p className="for-you-kicker">{exerciseGuide?.kicker}</p>
                      <h1>{exerciseGuide?.title}</h1>
                      <div className="for-you-mission">
                        <Icon name="target" size={16} />
                        <span><small>Ce exersezi</small>{exerciseGuide?.mission}</span>
                      </div>
                      {exerciseGuide?.target && (
                        <div className="for-you-target">
                          <small>{exerciseGuide.targetLabel}</small>
                          <strong>„{exerciseGuide.target}”</strong>
                        </div>
                      )}
                      {exerciseGuide?.context && <p className="for-you-situation"><strong>Situația:</strong> {exerciseGuide.context}</p>}
                      {card.exercise.rubric?.length ? (
                        <p className="for-you-rubric"><Icon name="target" size={15} /> {card.exercise.rubric.join(' · ')}</p>
                      ) : null}
                    </>
                  )}
                  {card.kind === 'listening' && (
                    <>
                      <div className="for-you-audio-orb"><Icon name={speakingId === card.id ? 'audio' : 'headphones'} size={38} /></div>
                      <p className="for-you-kicker">{exerciseGuide?.kicker}</p>
                      <h1>{exerciseGuide?.title}</h1>
                      <div className="for-you-mission">
                        <Icon name="target" size={16} />
                        <span><small>Ce urmărești</small>{exerciseGuide?.mission}</span>
                      </div>
                      <button className="for-you-replay" onClick={() => playCard(card)}><Icon name="volume" /> Redă din nou</button>
                    </>
                  )}
                  {card.kind === 'mistake' && (
                    <>
                      <p className="for-you-kicker">Corectură din istoricul tău</p>
                      <h1>Care variantă se potrivește contextului?</h1>
                      <div className="for-you-mistake-context">
                        <small>{savedMistakeContext?.label}</small>
                        <p>{savedMistakeContext?.text}</p>
                      </div>
                      <p className="for-you-context-limit">
                        {savedMistakeContext?.limited
                          ? 'Istoricul păstrează doar acest indiciu. Fără context, ambele forme pot fi corecte.'
                          : 'Ambele forme pot fi corecte în alte contexte; aici alegem forma potrivită situației de mai sus.'}
                      </p>
                    </>
                  )}
                  {card.kind === 'vocab' && (
                    <>
                      <p className="for-you-kicker">Activează expresia</p>
                      <h1>Cum spui în engleză?</h1>
                      <p className="for-you-vocab-prompt">{card.vocab.translation}</p>
                      {card.vocab.example && <small className="for-you-context">Indiciu: apare într-o propoziție pe care ai salvat-o.</small>}
                    </>
                  )}

                  {(card.kind === 'quiz' || card.kind === 'listening') && exerciseControl === 'unsupported' && (
                    <div className="for-you-exercise-fallback">
                      <Icon name="triangleAlert" />
                      <div><strong>Exercițiul nu are toate datele necesare.</strong><span>Îl sărim fără să-ți afectăm progresul.</span></div>
                      <button onClick={() => scrollTo(Math.min(cards.length - 1, index + 1))}>Continuă <Icon name="chevronDown" /></button>
                    </div>
                  )}

                  {card.kind === 'quiz' && exerciseControl === 'order' && !answer && (
                    <div className="for-you-order-builder">
                      <div className={`for-you-order-answer${orderedTokens.length ? ' has-tokens' : ''}`} aria-live="polite">
                        {orderedTokens.length ? orderedTokens.map((token, selectedIndex) => (
                          <button
                            key={`${tokenOrder[selectedIndex]}-${selectedIndex}`}
                            aria-label={`Elimină ${token}`}
                            onClick={() => setTokenOrders((current) => ({
                              ...current,
                              [card.id]: (current[card.id] ?? []).filter((_, indexToKeep) => indexToKeep !== selectedIndex),
                            }))}
                          >{token}</button>
                        )) : <span>Atinge elementele în ordinea propoziției…</span>}
                      </div>
                      <div className="for-you-order-bank" aria-label="Elemente disponibile">
                        {(card.exercise.tokens ?? []).map((token, tokenIndex) => tokenOrder.includes(tokenIndex) ? null : (
                          <button
                            key={`${token}-${tokenIndex}`}
                            onClick={() => setTokenOrders((current) => ({
                              ...current,
                              [card.id]: [...(current[card.id] ?? []), tokenIndex],
                            }))}
                          >{token}</button>
                        ))}
                      </div>
                      <div className="for-you-order-controls">
                        <button
                          disabled={!tokenOrder.length}
                          onClick={() => setTokenOrders((current) => ({ ...current, [card.id]: (current[card.id] ?? []).slice(0, -1) }))}
                        ><Icon name="undo" size={15} /> Ultimul</button>
                        <button
                          className="btn-primary"
                          disabled={tokenOrder.length !== (card.exercise.tokens?.length ?? 0) || checkingId === card.id}
                          onClick={() => void submit(card, joinOrderTokens(orderedTokens))}
                        >{checkingId === card.id ? <span className="spinner" /> : <>Verifică <Icon name="arrowUp" size={16} /></>}</button>
                      </div>
                    </div>
                  )}

                  {card.interactive && !answer
                    && (card.kind !== 'discovery' || discoveryStage === 'check')
                    && !(card.kind === 'quiz' && exerciseControl === 'order')
                    && exerciseControl !== 'unsupported' && (
                    options.length > 1 ? (
                      <div className="for-you-options">
                        {options.map((option) => (
                          <button key={option} disabled={checkingId === card.id} onClick={() => void submit(card, option)}>{option}</button>
                        ))}
                      </div>
                    ) : (
                      <form className="for-you-answer" onSubmit={(event) => submitDraft(event, card)}>
                        <input
                          value={drafts[card.id] ?? ''}
                          onChange={(event) => setDrafts((current) => ({ ...current, [card.id]: event.target.value }))}
                          placeholder={card.kind === 'quiz' || card.kind === 'listening' ? forYouInputPlaceholder(card.exercise) : 'Scrie răspunsul în engleză…'}
                          autoComplete="off"
                        />
                        <button className="btn-primary" disabled={checkingId === card.id || !(drafts[card.id] ?? '').trim()}>
                          {checkingId === card.id ? <span className="spinner" /> : <Icon name="arrowUp" />}
                        </button>
                      </form>
                    )
                  )}

                  {(card.kind === 'quiz' || card.kind === 'listening')
                    && !answer
                    && exerciseControl === 'text'
                    && Boolean(exerciseGuide?.hints.length) && (
                    <div className="for-you-hint-ladder">
                      {visibleHints.map((hint, hintIndex) => (
                        <div key={`${card.id}-hint-${hintIndex}`}><Icon name="lightbulb" size={15} /><span>{hint}</span></div>
                      ))}
                      {(hintSteps[card.id] ?? 0) < (exerciseGuide?.hints.length ?? 0) ? (
                        <button onClick={() => showNextHint(card, exerciseGuide?.hints.length ?? 0)}>
                          <Icon name="sparkles" size={15} /> {(hintSteps[card.id] ?? 0) ? 'Mai vreau un indiciu' : 'Dă-mi un indiciu'}
                        </button>
                      ) : (
                        <button className="reveal" onClick={() => void revealModel(card)}>
                          <Icon name="eyeOff" size={15} /> Arată răspunsul-model
                        </button>
                      )}
                      <small>Indiciile nu îți scad scorul.</small>
                    </div>
                  )}

                  {answer && (
                    <div className={`for-you-feedback ${answer.correct ? 'correct' : 'wrong'}`}>
                      <strong><Icon name={answer.correct ? 'checkCircle' : 'rotate'} /> {answer.correct ? `Corect · +4 XP` : answer.assisted ? 'Acum ai modelul' : 'Mai fixăm o dată'}</strong>
                      <p>{answer.explanation}</p>
                      <button onClick={() => scrollTo(Math.min(cards.length - 1, index + 1))}>Următorul <Icon name="chevronDown" /></button>
                    </div>
                  )}

                  <button className="for-you-why" onClick={() => setExplanationCardId(card.id)}>
                    <Icon name="help" size={16} /> {answer ? 'Explicația completă' : 'Explică-mi mai bine'}
                  </button>
                </div>

                <aside className="for-you-rail">
                  {card.kind === 'discovery' && (
                    <button
                      className={feedState.followedTopics.includes(card.discovery.topic) ? 'selected' : ''}
                      aria-label={`Urmărește ${DISCOVERY_TOPICS[card.discovery.topic].label}`}
                      aria-pressed={feedState.followedTopics.includes(card.discovery.topic)}
                      onClick={() => void toggleTopic(card.discovery.topic)}
                    >
                      <Icon name="sparkles" /><small>{feedState.followedTopics.includes(card.discovery.topic) ? 'Urmărit' : 'Urmărește'}</small>
                    </button>
                  )}
                  <button className={interaction?.liked ? 'selected' : ''} aria-label="Îmi place" aria-pressed={Boolean(interaction?.liked)} onClick={() => void react(card, 'like')}>
                    <Icon name="heart" /><small>Îmi place</small>
                  </button>
                  <button className={interaction?.saved ? 'selected' : ''} aria-label="Salvează" aria-pressed={Boolean(interaction?.saved)} onClick={() => void react(card, 'save')}>
                    <Icon name="bookmark" /><small>Salvează</small>
                  </button>
                  {!card.interactive && (
                    <button className={interaction?.known ? 'selected' : ''} aria-label="Știam deja" aria-pressed={Boolean(interaction?.known)} onClick={() => void react(card, 'known')}>
                      <Icon name="checkCircle" /><small>Știam</small>
                    </button>
                  )}
                  <button aria-label="Nu mă interesează" onClick={() => void react(card, 'hide')}>
                    <Icon name="eyeOff" /><small>Nu vreau</small>
                  </button>
                </aside>

                <div className="for-you-footer">
                  <span>{card.reason}</span>
                  <small>{LANE_LABELS[card.lane]} · {correctCount} {correctCount === 1 ? 'răspuns corect' : 'răspunsuri corecte'} azi</small>
                </div>
              </div>
            </article>
          );
        })}
        <div className="for-you-loader" aria-live="polite">
          {loadingMore ? <><span className="spinner" /> Mai aleg câteva pentru tine…</> : exhausted ? 'Ai ajuns la capătul feedului de azi.' : ''}
        </div>
      </div>

      {explanationCard && explanationDetails && (
        <div className="modal-backdrop for-you-explanation-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setExplanationCardId(''); }}>
          <div className="modal for-you-explanation-modal" role="dialog" aria-modal="true" aria-label="Explicația cardului">
            <div className="word-explain-head">
              <div>
                <span className="for-you-explanation-eyebrow">{explanationDetails.eyebrow}</span>
                <h2>{explanationDetails.title}</h2>
              </div>
              <button aria-label="Închide explicația" onClick={() => setExplanationCardId('')}><Icon name="x" /></button>
            </div>
            <p className="for-you-explanation-summary">{explanationDetails.summary}</p>
            <div className="for-you-explanation-sections">
              {explanationDetails.pattern && (
                <section>
                  <span><Icon name="puzzle" /> Tiparul</span>
                  <p>{explanationDetails.pattern}</p>
                </section>
              )}
              {explanationDetails.example?.en && (
                <section className="example">
                  <span><Icon name="message" /> Exemplu concret</span>
                  <strong>{explanationDetails.example.en}</strong>
                  {explanationDetails.example.ro && <small>{explanationDetails.example.ro}</small>}
                </section>
              )}
              {explanationDetails.pitfall && (
                <section className="pitfall">
                  <span><Icon name="triangleAlert" /> Capcana frecventă</span>
                  <p>{explanationDetails.pitfall}</p>
                </section>
              )}
              <section className="memory">
                <span><Icon name="lightbulb" /> Cum o fixezi</span>
                <p>{explanationDetails.memoryTip}</p>
              </section>
            </div>
            <button className="btn-primary for-you-explanation-close" onClick={() => setExplanationCardId('')}>Am înțeles</button>
          </div>
        </div>
      )}

      {topicSettingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTopicSettingsOpen(false); }}>
          <div className="modal for-you-topics-modal" role="dialog" aria-modal="true" aria-label="Subiectele tale">
            <div className="word-explain-head">
              <div>
                <h2>Ce vrei să descoperi?</h2>
                <p className="muted">Urmărește subiectele preferate. Feedul învață și din răspunsuri, salvări și aprecieri.</p>
              </div>
              <button aria-label="Închide" onClick={() => setTopicSettingsOpen(false)}><Icon name="x" /></button>
            </div>
            <div className="for-you-topic-grid">
              {Object.entries(DISCOVERY_TOPICS).map(([topic, details]) => {
                const typedTopic = topic as keyof typeof DISCOVERY_TOPICS;
                const followed = feedState.followedTopics.includes(typedTopic);
                return (
                  <button
                    key={topic}
                    className={followed ? 'selected' : ''}
                    aria-pressed={followed}
                    onClick={() => void toggleTopic(typedTopic)}
                  >
                    <span>{details.emoji}</span>
                    <span><strong>{details.label}</strong><small>{details.description}</small></span>
                    <Icon name={followed ? 'checkCircle' : 'sparkles'} />
                  </button>
                );
              })}
            </div>
            <div className="for-you-adaptive-note">
              <Icon name="sparkles" />
              <span><strong>Personalizare automată</strong> Dificultatea și ordinea se adaptează după progresul, răspunsurile și preferințele tale.</span>
            </div>
          </div>
        </div>
      )}

      {libraryOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false); }}>
          <div className="modal for-you-library" role="dialog" aria-modal="true" aria-label="Colecția ta">
            <div className="word-explain-head">
              <div><h2>Colecția ta</h2><p className="muted">Expresii și carduri salvate pentru mai târziu.</p></div>
              <button aria-label="Închide" onClick={() => setLibraryOpen(false)}><Icon name="x" /></button>
            </div>
            {savedCards.length === 0 ? <p className="muted">Apasă „Salvează” pe orice card care merită păstrat.</p> : (
              <div className="for-you-saved-list">
                {savedCards.map((saved) => {
                  const index = cards.findIndex((card) => card.id === saved.id);
                  return (
                    <button key={saved.id} onClick={() => { if (index >= 0) scrollTo(index); setLibraryOpen(false); }}>
                      <span><strong>{saved.title}</strong><small>{saved.subtitle}</small></span>
                      {index >= 0 && <Icon name="arrowUpRight" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
