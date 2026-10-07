import type { Cefr, Mistake, ReviewState, VocabItem } from '../types';

export interface CurriculumExercise {
  id: string;
  type: string;
  prompt_ro: string;
  skill: string;
  options?: string[];
  answer?: string;
  accepted_answers?: string[];
  model_answers?: string[];
  model_note_ro?: string;
  rubric?: string[];
  tokens?: string[];
  content?: string;
  full_answer?: string;
  tts_texts?: string[];
}

export interface CurriculumLesson {
  lesson_id: string;
  level: Cefr;
  unit_id: string;
  lesson_number_in_unit: number;
  title_ro: string;
  title_en: string;
  lesson_type: string;
  purpose_ro: string;
  estimated_minutes: number;
  objective_ro: string;
  grammar_focus: string;
  explanation_ro: string;
  scenario_ro: string;
  new_language: { en: string; ro: string }[];
  examples: { en: string; ro: string }[];
  dialogue: { speaker: string; text: string }[];
  exercises: CurriculumExercise[];
  pronunciation_task?: { instruction_ro: string; tts_texts: string[] };
}

export interface CurriculumFile {
  metadata: {
    version: string;
    total_lessons: number;
    level_counts: Record<string, number>;
  };
  lessons: CurriculumLesson[];
}

export interface ExerciseMemory extends ReviewState {
  lessonId: string;
  attempts: number;
  correctAttempts: number;
  lastScore: number;
  lastAttemptAt: string;
}

export interface MicroDailySummary {
  date: string;
  sessions: number;
  cards: number;
  correct: number;
  seconds: number;
  completedCore: boolean;
}

export interface MicrolearningProgress {
  version: 1;
  exercises: Record<string, ExerciseMemory>;
  lessonViews: Record<string, string>;
  recentExerciseIds: string[];
  daily: Record<string, MicroDailySummary>;
}

export type FeedMode = 'daily' | 'rescue' | 'boss';

interface FeedCardBase {
  instanceId: string;
  retryCount: number;
}

export type FeedCard =
  | (FeedCardBase & { kind: 'intro'; lesson: CurriculumLesson })
  | (FeedCardBase & { kind: 'curriculum'; lesson: CurriculumLesson; exercise: CurriculumExercise })
  | (FeedCardBase & { kind: 'mistake'; mistake: Mistake })
  | (FeedCardBase & { kind: 'vocab'; vocab: VocabItem });

export interface CardEvaluation {
  correct: boolean;
  score: number;
  expected: string;
  explanation: string;
}

export interface DueOverview {
  total: number;
  mistakes: number;
  vocabulary: number;
  curriculum: number;
  estimatedSeconds: number;
}

export interface VoiceChallengeResult {
  id: string;
  date: string;
  prompt: string;
  transcript: string;
  durationSec: number;
  wordCount: number;
  uniqueWords: number;
  wordsPerMinute: number;
  targetPhrases: string[];
  usedTargets: string[];
  grammarIssues: number | null;
  score: number;
}

export interface BossResult {
  weekId: string;
  date: string;
  cards: number;
  correct: number;
  score: number;
  durationSec: number;
}

export interface StoryEpisode {
  id: string;
  series: string;
  title: string;
  text: string;
  question: string;
  options: string[];
  answer: string;
  speakPrompt: string;
  targetPhrases: string[];
}

export interface StoryProgress {
  series: string;
  nextEpisode: number;
  lastCompletedDate: string;
  completed: string[];
  correctAnswers: number;
  spokenSummaries: number;
}

export interface ReminderPreferences {
  enabled: boolean;
  hour: number;
  minute: number;
  permission: NotificationPermission | 'unsupported';
  lastScheduledAt?: string;
}
