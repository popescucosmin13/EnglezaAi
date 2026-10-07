import { getMistakes, getVocab } from '../db/db';
import { dedupeMistakes, prioritizeMistakes } from '../logic/engine';
import { mistakeChoiceOptions } from '../logic/mistake-context';
import {
  audioText,
  expectedAnswers,
  isListeningExercise,
  loadCurriculum,
} from '../microlearning/curriculum';
import { adaptEpisode, preferredStorySeries } from '../microlearning/stories';
import { getMicrolearningProgress } from '../microlearning/state';
import type { CurriculumExercise, CurriculumLesson, MicrolearningProgress } from '../microlearning/types';
import { isDue } from '../srs/ladder';
import type { BuildForYouOptions, ForYouCard, ForYouInteraction, ForYouLane } from './types';
import { arrangeForYouCards } from './arrange';
import { DISCOVERY_LESSONS, discoveryScore } from './discovery';
import { isForYouExercise } from './exercise';
import { dedupeLearningCards, learningKeysForCard } from './identity';
import { interactionIsCoolingDown } from './cooldown';

interface Candidate {
  card: ForYouCard;
  score: number;
}

const LANE_ORDER: ForYouLane[] = ['discovery', 'weakness', 'interest', 'srs', 'new', 'surprise'];

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function seededRandom(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: string): T[] {
  const random = seededRandom(hash(seed));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function interactionBoost(interaction?: ForYouInteraction): number {
  if (!interaction) return 0;
  const accuracy = interaction.answers ? interaction.correctAnswers / interaction.answers : 1;
  return (interaction.liked ? 3 : 0)
    + (interaction.saved ? 2 : 0)
    + (interaction.answers && accuracy < 0.7 ? 2.5 : 0)
    + Math.min(2, interaction.hints * 0.25)
    + Math.min(3, interaction.reveals * 1.25)
    - (interaction.known ? 5 : 0)
    - Math.min(4, interaction.views * 0.35);
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('ro-RO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function interestScore(lesson: CurriculumLesson, interests: string[]): number {
  const haystack = normalize([
    lesson.title_ro,
    lesson.title_en,
    lesson.scenario_ro,
    lesson.purpose_ro,
    lesson.objective_ro,
    lesson.grammar_focus,
  ].join(' '));
  return interests.reduce((score, interest) => {
    const tokens = normalize(interest).split(/\s+/).filter((token) => token.length >= 3);
    return score + tokens.filter((token) => haystack.includes(token)).length;
  }, 0);
}

function phraseCard(lesson: CurriculumLesson, index: number, lane: ForYouLane, reason: string): ForYouCard | null {
  const phrase = lesson.new_language[index] ?? lesson.examples[index];
  if (!phrase?.en) return null;
  return {
    id: `phrase:${lesson.lesson_id}:${index}`,
    kind: 'phrase',
    lane,
    topic: lesson.title_ro,
    reason,
    interactive: false,
    lesson,
    english: phrase.en,
    romanian: phrase.ro,
  };
}

function dialogueCard(lesson: CurriculumLesson, lane: ForYouLane, reason: string): ForYouCard | null {
  const lines = lesson.dialogue.filter((line) => line.text.trim()).slice(0, 4);
  if (lines.length < 2) return null;
  return {
    id: `dialogue:${lesson.lesson_id}`,
    kind: 'dialogue',
    lane,
    topic: lesson.title_ro,
    reason,
    interactive: false,
    lesson,
    lines,
  };
}

function insightCard(lesson: CurriculumLesson, lane: ForYouLane, reason: string): ForYouCard | null {
  const example = lesson.examples[0];
  if (!lesson.explanation_ro || !example?.en) return null;
  return {
    id: `insight:${lesson.lesson_id}`,
    kind: 'insight',
    lane,
    topic: lesson.title_ro,
    reason,
    interactive: false,
    lesson,
    rule: lesson.explanation_ro,
    example: example.en,
    translation: example.ro,
  };
}

function exerciseCard(
  lesson: CurriculumLesson,
  exercise: CurriculumExercise,
  lane: ForYouLane,
  reason: string,
): ForYouCard {
  const listening = isListeningExercise(exercise);
  return {
    id: `${listening ? 'listening' : 'quiz'}:${exercise.id}`,
    kind: listening ? 'listening' : 'quiz',
    lane,
    topic: lesson.title_ro,
    reason,
    interactive: true,
    lesson,
    exercise,
  };
}

function lessonIndex(lessons: CurriculumLesson[]): Map<string, { lesson: CurriculumLesson; exercise: CurriculumExercise }> {
  const result = new Map<string, { lesson: CurriculumLesson; exercise: CurriculumExercise }>();
  for (const lesson of lessons) {
    for (const exercise of lesson.exercises) result.set(exercise.id, { lesson, exercise });
  }
  return result;
}

function activeExercise(lesson: CurriculumLesson): CurriculumExercise | undefined {
  const visual = lesson.exercises.filter((exercise) => isForYouExercise(exercise) && !isListeningExercise(exercise));
  if (visual.length) return visual[hash(lesson.lesson_id) % visual.length];
  const supported = lesson.exercises.filter(isForYouExercise);
  return supported[hash(`${lesson.lesson_id}:fallback`) % supported.length];
}

function eligibleActiveExercise(lesson: CurriculumLesson, progress: MicrolearningProgress): CurriculumExercise | undefined {
  const exercise = activeExercise(lesson);
  if (!exercise) return undefined;
  const memory = progress.exercises[exercise.id];
  if (memory && memory.lastScore >= 86 && !isDue(memory)) return undefined;
  return exercise;
}

function addCandidate(
  pools: Record<ForYouLane, Candidate[]>,
  card: ForYouCard | null | undefined,
  score: number,
  interactions: Record<string, ForYouInteraction>,
): void {
  if (!card || interactions[card.id]?.hidden) return;
  pools[card.lane].push({ card, score: score + interactionBoost(interactions[card.id]) });
}

function daySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

export function spokenTextForCard(card: ForYouCard): string {
  if (card.kind === 'discovery') return `${card.discovery.titleEn}. ${card.discovery.hookEn}`;
  if (card.kind === 'phrase') return card.english;
  if (card.kind === 'dialogue') return card.lines.map((line) => `${line.speaker}. ${line.text}`).join(' ');
  if (card.kind === 'listening') return audioText(card.exercise, card.lesson);
  if (card.kind === 'story') return card.episode.text;
  return '';
}

export function savedSnapshot(card: ForYouCard) {
  if (card.kind === 'discovery') return { id: card.id, kind: card.kind, title: card.discovery.titleEn, subtitle: card.discovery.titleRo, savedAt: '' };
  if (card.kind === 'phrase') return { id: card.id, kind: card.kind, title: card.english, subtitle: card.romanian, savedAt: '' };
  if (card.kind === 'dialogue') return { id: card.id, kind: card.kind, title: card.topic, subtitle: card.lines[0]?.text ?? '', savedAt: '' };
  if (card.kind === 'insight') return { id: card.id, kind: card.kind, title: card.topic, subtitle: card.example, savedAt: '' };
  if (card.kind === 'story') return { id: card.id, kind: card.kind, title: card.episode.title, subtitle: card.episode.series, savedAt: '' };
  if (card.kind === 'mistake') return { id: card.id, kind: card.kind, title: card.mistake.corrected, subtitle: card.mistake.explanationRo, savedAt: '' };
  if (card.kind === 'vocab') return { id: card.id, kind: card.kind, title: card.vocab.word, subtitle: card.vocab.translation, savedAt: '' };
  return { id: card.id, kind: card.kind, title: card.exercise.prompt_ro, subtitle: card.topic, savedAt: '' };
}

/** Feed scurt folosit exclusiv în modul de dezvoltare pentru QA vizual fără cont Firebase. */
export async function buildForYouPreviewFeed(profile: BuildForYouOptions['profile']): Promise<ForYouCard[]> {
  const curriculum = await loadCurriculum();
  const direct = curriculum.lessons.filter((lesson) => lesson.level === profile.currentLevel);
  const lessons = direct.length ? direct : curriculum.lessons;
  const quizItem = lessons
    .flatMap((lesson) => lesson.exercises.map((exercise) => ({ lesson, exercise })))
    .find(({ exercise }) => isForYouExercise(exercise) && !isListeningExercise(exercise));
  const listeningItem = lessons
    .flatMap((lesson) => lesson.exercises.map((exercise) => ({ lesson, exercise })))
    .find(({ exercise }) => isForYouExercise(exercise) && isListeningExercise(exercise));
  const orderItem = lessons
    .flatMap((lesson) => lesson.exercises.map((exercise) => ({ lesson, exercise })))
    .find(({ exercise }) => exercise.type === 'sentence_order' && isForYouExercise(exercise));
  const retryItem = lessons
    .flatMap((lesson) => lesson.exercises.map((exercise) => ({ lesson, exercise })))
    .find(({ exercise }) => exercise.type === 'targeted_retry' && isForYouExercise(exercise));
  const series = preferredStorySeries(profile);
  const episode = adaptEpisode(series, 0, profile.currentLevel);
  const cards: Array<ForYouCard | null> = [
    {
      id: `discovery:${DISCOVERY_LESSONS[0].id}`,
      kind: 'discovery',
      lane: 'discovery',
      topic: DISCOVERY_LESSONS[0].titleRo,
      reason: 'Știință reală + engleză în context',
      interactive: true,
      discovery: DISCOVERY_LESSONS[0],
    },
    orderItem ? exerciseCard(orderItem.lesson, orderItem.exercise, 'new', 'Construiește activ, nu doar reciti') : null,
    phraseCard(lessons[0], 0, 'interest', 'Ales din interesele și obiectivul tău'),
    {
      id: `discovery:${DISCOVERY_LESSONS[4].id}`,
      kind: 'discovery',
      lane: 'discovery',
      topic: DISCOVERY_LESSONS[4].titleRo,
      reason: 'O idee verificată care merită povestită',
      interactive: true,
      discovery: DISCOVERY_LESSONS[4],
    },
    dialogueCard(lessons[1] ?? lessons[0], 'surprise', 'Ceva diferit ca să rămâi curios'),
    quizItem ? exerciseCard(quizItem.lesson, quizItem.exercise, 'new', 'Un test scurt de transfer') : null,
    insightCard(lessons[2] ?? lessons[0], 'new', 'Un tipar nou explicat rapid'),
    retryItem ? exerciseCard(retryItem.lesson, retryItem.exercise, 'srs', 'Recuperare clară, cu sensul la vedere') : null,
    listeningItem ? exerciseCard(listeningItem.lesson, listeningItem.exercise, 'srs', 'Fix înainte să uiți') : null,
    {
      id: `story:${episode.id}`,
      kind: 'story',
      lane: 'surprise',
      topic: episode.series,
      reason: 'Episodul-surpriză de azi',
      interactive: true,
      episode,
    },
  ];
  return arrangeForYouCards(dedupeLearningCards(cards.filter((card): card is ForYouCard => Boolean(card))));
}

export async function buildForYouFeed({
  profile,
  state,
  count = 16,
  excludedIds = [],
  excludedLearningKeys = [],
  batch = 0,
}: BuildForYouOptions): Promise<ForYouCard[]> {
  const [curriculum, progress, rawMistakes, vocab] = await Promise.all([
    loadCurriculum(),
    getMicrolearningProgress(),
    getMistakes(),
    getVocab(),
  ]);
  const directLessons = curriculum.lessons.filter((lesson) => lesson.level === profile.currentLevel);
  const lessons = directLessons.length ? directLessons : curriculum.lessons;
  const byExercise = lessonIndex(curriculum.lessons);
  const interactions = state.interactions;
  const pools: Record<ForYouLane, Candidate[]> = { discovery: [], weakness: [], interest: [], srs: [], new: [], surprise: [] };
  const seed = `${daySeed()}:${profile.currentLevel}:${batch}`;
  const interests = [...profile.interests, profile.mainObjective].filter(Boolean);

  for (const lesson of DISCOVERY_LESSONS) {
    const memory = state.discovery[lesson.id];
    const followed = state.followedTopics.includes(lesson.topic);
    const reason = followed
      ? 'Dintr-un subiect pe care îl urmărești'
      : memory?.attempts && memory.mastery < 70
        ? 'Revenim inteligent înainte să uiți'
        : 'Cunoaștere reală + engleză în context';
    addCandidate(pools, {
      id: `discovery:${lesson.id}`,
      kind: 'discovery',
      lane: 'discovery',
      topic: lesson.titleRo,
      reason,
      interactive: true,
      discovery: lesson,
    }, discoveryScore(lesson, profile, state), interactions);
  }

  const mistakes = prioritizeMistakes(dedupeMistakes(rawMistakes).filter((item) => item.status !== 'mastered'));
  for (const mistake of mistakes.slice(0, 80)) {
    const options = shuffled(mistakeChoiceOptions(mistake), `${seed}:${mistake.id}`);
    addCandidate(pools, {
      id: `mistake:${mistake.id}`,
      kind: 'mistake',
      lane: 'weakness',
      topic: 'Greșeală personală',
      reason: 'Ai întâlnit această capcană înainte',
      interactive: true,
      mistake,
      options,
    }, 8 + mistake.occurrenceCount, interactions);
  }

  for (const [exerciseId, memory] of Object.entries(progress.exercises)) {
    if (memory.lastScore >= 86 && !isDue(memory)) continue;
    const item = byExercise.get(exerciseId);
    if (!item || !isForYouExercise(item.exercise)) continue;
    addCandidate(
      pools,
      exerciseCard(item.lesson, item.exercise, isDue(memory) ? 'srs' : 'weakness', isDue(memory) ? 'E momentul optim pentru recapitulare' : 'Aici mai poți câștiga precizie'),
      9 - memory.lastScore / 20,
      interactions,
    );
  }

  const vocabOptions = vocab.filter((item) => item.translation).map((item) => item.word);
  for (const item of vocab.filter((entry) => entry.translation && (isDue(entry.review) || entry.activeScore < 80)).slice(0, 100)) {
    const distractors = shuffled(vocabOptions.filter((word) => word !== item.word), `${seed}:vocab:${item.id}`).slice(0, 3);
    addCandidate(pools, {
      id: `vocab:${item.id}`,
      kind: 'vocab',
      lane: 'srs',
      topic: 'Vocabularul tău',
      reason: isDue(item.review) ? 'Expresie pe cale să fie uitată' : 'O mutăm din vocabular pasiv în activ',
      interactive: true,
      vocab: item,
      options: shuffled([item.word, ...distractors], `${seed}:options:${item.id}`),
    }, 7 - item.activeScore / 25, interactions);
  }

  const interestLessons = lessons
    .map((lesson) => ({ lesson, score: interestScore(lesson, interests) }))
    .filter((item) => item.score > 0);
  const interestSource = interestLessons.length
    ? interestLessons
    : shuffled(lessons, `${seed}:interest-fallback`).slice(0, 24).map((lesson) => ({ lesson, score: 0 }));
  for (const { lesson, score } of interestSource.slice(0, 80)) {
    const reason = score > 0 ? 'Ales din interesele și obiectivul tău' : 'Potrivit nivelului tău';
    addCandidate(pools, phraseCard(lesson, 0, 'interest', reason), 4 + score, interactions);
    addCandidate(pools, dialogueCard(lesson, 'interest', reason), 3 + score, interactions);
    const exercise = eligibleActiveExercise(lesson, progress);
    if (exercise) addCandidate(pools, exerciseCard(lesson, exercise, 'interest', reason), 4 + score, interactions);
  }

  for (const lesson of shuffled(lessons, `${seed}:new`).slice(0, 100)) {
    if (progress.lessonViews[lesson.lesson_id]) continue;
    addCandidate(pools, phraseCard(lesson, 0, 'new', 'O expresie nouă, la nivelul tău'), 4, interactions);
    addCandidate(pools, insightCard(lesson, 'new', 'Un tipar nou explicat rapid'), 3.5, interactions);
    const exercise = eligibleActiveExercise(lesson, progress);
    if (exercise) addCandidate(pools, exerciseCard(lesson, exercise, 'new', 'Un test scurt de transfer'), 4, interactions);
  }

  const storySeries = preferredStorySeries(profile);
  const episode = adaptEpisode(storySeries, Math.floor(Date.now() / 86_400_000) % storySeries.episodes.length, profile.currentLevel);
  addCandidate(pools, {
    id: `story:${episode.id}`,
    kind: 'story',
    lane: 'surprise',
    topic: episode.series,
    reason: 'Episodul-surpriză de azi',
    interactive: true,
    episode,
  }, 7, interactions);
  for (const lesson of shuffled(lessons, `${seed}:surprise`).slice(0, 30)) {
    addCandidate(pools, dialogueCard(lesson, 'surprise', 'Ceva diferit ca să rămâi curios'), 3, interactions);
    const listening = lesson.exercises.find((exercise) => {
      if (!isForYouExercise(exercise) || !isListeningExercise(exercise) || !expectedAnswers(exercise).length) return false;
      const memory = progress.exercises[exercise.id];
      return !memory || memory.lastScore < 86 || isDue(memory);
    });
    if (listening) addCandidate(pools, exerciseCard(lesson, listening, 'surprise', 'Ascultare neașteptată'), 4, interactions);
  }

  const excluded = new Set(excludedIds);
  const excludedLearning = new Set(excludedLearningKeys);
  const coolingLearning = new Set<string>();
  for (const candidate of LANE_ORDER.flatMap((lane) => pools[lane])) {
    const interaction = interactions[candidate.card.id];
    const discoveryCooling = candidate.card.kind === 'discovery'
      && Boolean(state.discovery[candidate.card.discovery.id]?.nextReviewAt)
      && state.discovery[candidate.card.discovery.id].nextReviewAt > new Date().toISOString();
    if (interactionIsCoolingDown(interaction) || discoveryCooling) {
      learningKeysForCard(candidate.card).forEach((key) => coolingLearning.add(key));
    }
  }
  const chosen: ForYouCard[] = [];
  const used = new Set<string>();
  const usedLearning = new Set<string>();
  const quotas: Record<ForYouLane, number> = {
    discovery: Math.max(2, Math.round(count * 0.28)),
    weakness: Math.round(count * 0.2),
    interest: Math.round(count * 0.16),
    srs: Math.round(count * 0.14),
    new: Math.max(1, Math.round(count * 0.12)),
    surprise: Math.max(1, Math.round(count * 0.1)),
  };

  const ranked: Record<ForYouLane, Candidate[]> = { discovery: [], weakness: [], interest: [], srs: [], new: [], surprise: [] };
  for (const lane of LANE_ORDER) {
    const random = seededRandom(hash(`${seed}:${lane}`));
    ranked[lane] = pools[lane]
      .filter(({ card }) => {
        const learningKeys = learningKeysForCard(card);
        return !excluded.has(card.id)
          && !learningKeys.some((key) => excludedLearning.has(key) || coolingLearning.has(key));
      })
      .map((candidate) => ({ ...candidate, score: candidate.score + random() * 1.8 }))
      .sort((a, b) => b.score - a.score);
  }

  const take = (lane: ForYouLane, amount: number) => {
    for (const candidate of ranked[lane]) {
      if (chosen.length >= count || amount <= 0) break;
      if (used.has(candidate.card.id)) continue;
      const learningKeys = learningKeysForCard(candidate.card);
      if (learningKeys.some((key) => usedLearning.has(key))) continue;
      used.add(candidate.card.id);
      learningKeys.forEach((key) => usedLearning.add(key));
      chosen.push(candidate.card);
      amount -= 1;
    }
  };
  for (const lane of LANE_ORDER) take(lane, quotas[lane]);

  const fallback = LANE_ORDER.flatMap((lane) => ranked[lane]).sort((a, b) => b.score - a.score);
  for (const candidate of fallback) {
    if (chosen.length >= count) break;
    if (used.has(candidate.card.id)) continue;
    const learningKeys = learningKeysForCard(candidate.card);
    if (learningKeys.some((key) => usedLearning.has(key))) continue;
    used.add(candidate.card.id);
    learningKeys.forEach((key) => usedLearning.add(key));
    chosen.push(candidate.card);
  }

  return arrangeForYouCards(shuffled(chosen, `${seed}:final`)).slice(0, count);
}
