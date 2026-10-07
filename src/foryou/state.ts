import { getMetaDoc, saveMetaDoc } from '../db/db';
import { todayStr } from '../srs/ladder';
import type {
  DiscoveryMemory,
  DiscoveryTopic,
  ForYouDailyStats,
  ForYouEvent,
  ForYouInteraction,
  ForYouSavedCard,
  ForYouState,
} from './types';
import { eligibleAfterCorrect, eligibleAfterHours } from './cooldown';

const FOR_YOU_DOC = 'for-you-feed-v1';
const MAX_INTERACTIONS = 500;

export function emptyForYouState(): ForYouState {
  return {
    version: 2,
    interactions: {},
    savedCards: {},
    daily: {},
    resumeCardId: '',
    discovery: {},
    followedTopics: [],
    topicAffinity: {},
  };
}

function normalizeState(saved?: Partial<ForYouState>): ForYouState {
  const interactions = Object.fromEntries(
    Object.entries(saved?.interactions ?? {}).map(([id, interaction]) => [id, { ...emptyInteraction(), ...interaction }]),
  );
  return {
    version: 2,
    interactions,
    savedCards: saved?.savedCards ?? {},
    daily: saved?.daily ?? {},
    resumeCardId: saved?.resumeCardId ?? '',
    discovery: saved?.discovery ?? {},
    followedTopics: saved?.followedTopics ?? [],
    topicAffinity: saved?.topicAffinity ?? {},
  };
}

function emptyInteraction(): ForYouInteraction {
  return {
    views: 0,
    completions: 0,
    answers: 0,
    correctAnswers: 0,
    hints: 0,
    reveals: 0,
    liked: false,
    saved: false,
    hidden: false,
    known: false,
    lastSeenAt: '',
    nextEligibleAt: '',
  };
}

function emptyDiscoveryMemory(): DiscoveryMemory {
  return { views: 0, attempts: 0, correctAnswers: 0, mastery: 0, lastSeenAt: '', nextReviewAt: '' };
}

function nextReviewIso(correct: boolean, mastery: number): string {
  const days = correct ? Math.min(14, Math.max(2, Math.round(2 ** (mastery / 28)))) : 1;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function clampAffinity(value: number): number {
  return Math.max(-4, Math.min(8, Math.round(value * 100) / 100));
}

function pruneState(state: ForYouState): void {
  const interactions = Object.entries(state.interactions)
    .sort(([, a], [, b]) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, MAX_INTERACTIONS);
  state.interactions = Object.fromEntries(interactions);
  state.daily = Object.fromEntries(Object.entries(state.daily).sort(([a], [b]) => b.localeCompare(a)).slice(0, 120));
}

export async function getForYouState(): Promise<ForYouState> {
  return normalizeState(await getMetaDoc<ForYouState>(FOR_YOU_DOC));
}

let writeQueue: Promise<unknown> = Promise.resolve();

export function recordForYouEvent(
  cardId: string,
  event: ForYouEvent,
  savedCard?: ForYouSavedCard,
  discoveryTopic?: DiscoveryTopic,
): Promise<ForYouState> {
  const operation = writeQueue.then(async () => {
    const state = await getForYouState();
    const interaction = { ...emptyInteraction(), ...state.interactions[cardId] };
    const now = new Date().toISOString();
    const date = todayStr();
    const daily: ForYouDailyStats = state.daily[date] ?? { date, views: 0, completed: 0, answers: 0, correct: 0 };

    interaction.lastSeenAt = now;
    if (event === 'view') {
      interaction.views += 1;
      daily.views += 1;
      state.resumeCardId = cardId;
    } else if (event === 'complete') {
      interaction.completions += 1;
      interaction.nextEligibleAt = eligibleAfterHours(12);
      daily.completed += 1;
    } else if (event === 'answer-correct' || event === 'answer-wrong') {
      interaction.answers += 1;
      interaction.completions += 1;
      daily.answers += 1;
      daily.completed += 1;
      if (event === 'answer-correct') {
        interaction.correctAnswers += 1;
        interaction.nextEligibleAt = eligibleAfterCorrect(interaction.correctAnswers);
        daily.correct += 1;
      }
    } else if (event === 'hint') {
      interaction.hints += 1;
    } else if (event === 'reveal') {
      interaction.reveals += 1;
      interaction.answers += 1;
      interaction.completions += 1;
      interaction.nextEligibleAt = eligibleAfterHours(6);
      daily.answers += 1;
      daily.completed += 1;
    } else if (event === 'like') {
      interaction.liked = !interaction.liked;
    } else if (event === 'save') {
      interaction.saved = !interaction.saved;
      if (interaction.saved && savedCard) state.savedCards[cardId] = { ...savedCard, savedAt: now };
      else delete state.savedCards[cardId];
    } else if (event === 'hide') {
      interaction.hidden = true;
    } else if (event === 'known') {
      interaction.known = true;
      interaction.completions += 1;
      interaction.nextEligibleAt = eligibleAfterHours(30 * 24);
      daily.completed += 1;
    }

    if (discoveryTopic) {
      const lessonId = cardId.startsWith('discovery:') ? cardId.slice('discovery:'.length) : cardId;
      const memory = { ...emptyDiscoveryMemory(), ...state.discovery[lessonId] };
      memory.lastSeenAt = now;
      if (event === 'view') memory.views += 1;
      if (event === 'answer-correct' || event === 'answer-wrong') {
        const correct = event === 'answer-correct';
        memory.attempts += 1;
        if (correct) memory.correctAnswers += 1;
        memory.mastery = Math.max(0, Math.min(100, memory.mastery + (correct ? 28 : 8)));
        memory.nextReviewAt = nextReviewIso(correct, memory.mastery);
      }
      state.discovery[lessonId] = memory;

      const currentAffinity = state.topicAffinity[discoveryTopic] ?? 0;
      let delta = 0;
      if (event === 'like') delta = interaction.liked ? 0.8 : -0.8;
      if (event === 'save') delta = interaction.saved ? 0.5 : -0.5;
      if (event === 'hide') delta = -2;
      if (event === 'answer-correct') delta = 0.15;
      if (event === 'answer-wrong') delta = 0.05;
      state.topicAffinity[discoveryTopic] = clampAffinity(currentAffinity + delta);
    }

    state.interactions[cardId] = interaction;
    state.daily[date] = daily;
    pruneState(state);
    await saveMetaDoc(FOR_YOU_DOC, { ...state });
    return state;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export function toggleDiscoveryTopic(topic: DiscoveryTopic): Promise<ForYouState> {
  const operation = writeQueue.then(async () => {
    const state = await getForYouState();
    state.followedTopics = state.followedTopics.includes(topic)
      ? state.followedTopics.filter((item) => item !== topic)
      : [...state.followedTopics, topic];
    await saveMetaDoc(FOR_YOU_DOC, { ...state });
    return state;
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
