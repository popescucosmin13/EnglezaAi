import { describe, expect, it } from 'vitest';
import { DISCOVERY_LESSONS, discoveryArticle, discoveryScore } from './discovery';
import type { ForYouState } from './types';

function state(): ForYouState {
  return { version: 2, interactions: {}, savedCards: {}, daily: {}, resumeCardId: '', discovery: {}, followedTopics: [], topicAffinity: {} };
}

describe('discovery learning', () => {
  it('păstrează fiecare lecție completă, verificabilă și evaluabilă', () => {
    expect(DISCOVERY_LESSONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(DISCOVERY_LESSONS.map((lesson) => lesson.id)).size).toBe(DISCOVERY_LESSONS.length);
    for (const lesson of DISCOVERY_LESSONS) {
      expect(lesson.prediction.options).toContain(lesson.prediction.answer);
      expect(lesson.check.options).toContain(lesson.check.answer);
      expect(lesson.vocabulary.length).toBeGreaterThanOrEqual(3);
      expect(lesson.source.url).toMatch(/^https:\/\//);
      expect(lesson.easyEn.length).toBeGreaterThan(45);
    }
  });

  it('adaptează textul la nivelul CEFR', () => {
    const lesson = DISCOVERY_LESSONS[0];
    expect(discoveryArticle(lesson, 'A2')).toBe(lesson.easyEn);
    expect(discoveryArticle(lesson, 'B1')).toBe(lesson.standardEn);
    expect(discoveryArticle(lesson, 'C1')).toBe(lesson.challengeEn);
  });

  it('prioritizează un subiect urmărit și o lecție nouă', () => {
    const profile = { interests: [], mainObjective: '' };
    const lesson = DISCOVERY_LESSONS[0];
    const baseState = state();
    const followedState = { ...baseState, followedTopics: [lesson.topic] };
    expect(discoveryScore(lesson, profile, followedState)).toBeGreaterThan(discoveryScore(lesson, profile, baseState));

    const seenState = {
      ...baseState,
      discovery: {
        [lesson.id]: { views: 8, attempts: 1, correctAnswers: 1, mastery: 80, lastSeenAt: new Date().toISOString(), nextReviewAt: '2999-01-01T00:00:00.000Z' },
      },
    };
    expect(discoveryScore(lesson, profile, baseState)).toBeGreaterThan(discoveryScore(lesson, profile, seenState));
  });
});
