import { describe, expect, it } from 'vitest';
import { buildAnalysisAndReportPrompt, buildConversationPromptParts, type ConversationConfig } from './prompts';

const baseConfig = {
  type: 'daily',
  scenarioPersona: 'You are a client discussing a security incident.',
  profile: {
    currentLevel: 'A2',
    targetLevel: 'B1',
    mainObjective: 'English for cybersecurity work',
    interests: ['technology'],
    romanianHelp: 'putina',
  },
  difficulty: { promptRules: 'Use short, clear sentences.' },
  correctionMode: 'final',
  targetExpressions: [],
  grammarFocus: 'Past Simple',
  guided: false,
  memoryContext: 'The learner has a client demo on Friday.',
} as unknown as ConversationConfig;

describe('prompturi optimizate', () => {
  it('ține regulile stabile separate de faza și țintele care se schimbă', () => {
    const first = buildConversationPromptParts({
      ...baseConfig,
      phaseInstruction: 'Warm-up phase.',
      targetExpressions: ['I am responsible for'],
    });
    const second = buildConversationPromptParts({
      ...baseConfig,
      phaseInstruction: 'Final challenge.',
      targetExpressions: ['From my point of view'],
    });
    expect(first.stable).toBe(second.stable);
    expect(first.dynamic).not.toBe(second.dynamic);
    expect(first.dynamic).toContain('I am responsible for');
  });

  it('cere împreună toate analizele noi și raportul cu structura completă', () => {
    const prompt = buildAnalysisAndReportPrompt(baseConfig.profile, 'past_simple');
    expect(prompt).toContain('"analyses"');
    expect(prompt).toContain('"report"');
    expect(prompt).toContain('"wellDone"');
    expect(prompt).toContain('"exerciseSentences"');
    expect(prompt).toContain('[ALREADY ANALYZED]');
  });
});
