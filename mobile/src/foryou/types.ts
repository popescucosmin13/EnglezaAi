import type { Mistake, Profile, VocabItem } from '../types';
import type { CurriculumExercise, CurriculumLesson, StoryEpisode } from '../microlearning/types';

export type DiscoveryTopic = 'space' | 'mind' | 'technology' | 'earth' | 'nature' | 'society';
export type ForYouLane = 'discovery' | 'weakness' | 'interest' | 'srs' | 'new' | 'surprise';
export type ForYouCardKind = 'discovery' | 'phrase' | 'dialogue' | 'insight' | 'story' | 'quiz' | 'listening' | 'mistake' | 'vocab';

export interface DiscoveryLesson {
  id: string;
  topic: DiscoveryTopic;
  titleRo: string;
  titleEn: string;
  hookEn: string;
  prediction: {
    promptRo: string;
    options: string[];
    answer: string;
    revealRo: string;
  };
  easyEn: string;
  standardEn: string;
  challengeEn?: string;
  supportRo: string;
  vocabulary: Array<{
    word: string;
    translation: string;
    meaningEn: string;
  }>;
  check: {
    promptRo: string;
    options: string[];
    answer: string;
    explanationRo: string;
  };
  takeawayEn: string;
  source: {
    label: string;
    url: string;
    checkedAt: string;
  };
}

interface ForYouCardBase {
  id: string;
  kind: ForYouCardKind;
  lane: ForYouLane;
  topic: string;
  reason: string;
  interactive: boolean;
}

export type ForYouCard =
  | (ForYouCardBase & {
      kind: 'discovery';
      lane: 'discovery';
      interactive: true;
      discovery: DiscoveryLesson;
    })
  | (ForYouCardBase & {
      kind: 'phrase';
      interactive: false;
      lesson: CurriculumLesson;
      english: string;
      romanian: string;
    })
  | (ForYouCardBase & {
      kind: 'dialogue';
      interactive: false;
      lesson: CurriculumLesson;
      lines: { speaker: string; text: string }[];
    })
  | (ForYouCardBase & {
      kind: 'insight';
      interactive: false;
      lesson: CurriculumLesson;
      rule: string;
      example: string;
      translation: string;
    })
  | (ForYouCardBase & {
      kind: 'story';
      interactive: true;
      episode: StoryEpisode;
    })
  | (ForYouCardBase & {
      kind: 'quiz' | 'listening';
      interactive: true;
      lesson: CurriculumLesson;
      exercise: CurriculumExercise;
    })
  | (ForYouCardBase & {
      kind: 'mistake';
      interactive: true;
      mistake: Mistake;
      options: string[];
    })
  | (ForYouCardBase & {
      kind: 'vocab';
      interactive: true;
      vocab: VocabItem;
      options: string[];
    });

export interface ForYouInteraction {
  views: number;
  completions: number;
  answers: number;
  correctAnswers: number;
  hints: number;
  reveals: number;
  liked: boolean;
  saved: boolean;
  hidden: boolean;
  known: boolean;
  lastSeenAt: string;
  nextEligibleAt: string;
}

export interface ForYouSavedCard {
  id: string;
  kind: ForYouCardKind;
  title: string;
  subtitle: string;
  savedAt: string;
}

export interface ForYouDailyStats {
  date: string;
  views: number;
  completed: number;
  answers: number;
  correct: number;
}

export interface DiscoveryMemory {
  views: number;
  attempts: number;
  correctAnswers: number;
  mastery: number;
  lastSeenAt: string;
  nextReviewAt: string;
}

export interface ForYouState {
  version: 2;
  interactions: Record<string, ForYouInteraction>;
  savedCards: Record<string, ForYouSavedCard>;
  daily: Record<string, ForYouDailyStats>;
  resumeCardId: string;
  discovery: Record<string, DiscoveryMemory>;
  followedTopics: DiscoveryTopic[];
  topicAffinity: Partial<Record<DiscoveryTopic, number>>;
}

export type ForYouEvent = 'view' | 'complete' | 'answer-correct' | 'answer-wrong' | 'hint' | 'reveal' | 'like' | 'save' | 'hide' | 'known';

export interface BuildForYouOptions {
  profile: Profile;
  state: ForYouState;
  count?: number;
  excludedIds?: string[];
  excludedLearningKeys?: string[];
  batch?: number;
}
