import { describe, expect, it } from 'vitest';
import type { Utterance } from '../types';
import {
  compactTranscriptForMemory,
  formatRollingSummaryInput,
  shouldAppendUserContent,
  turnsAfterSummary,
} from './context-optimization';

function turn(role: 'user' | 'ai', text: string, ts: number): Utterance {
  return { role, text, ts };
}

describe('optimizarea contextului conversației', () => {
  it('nu retrimite replica utilizatorului deja prezentă în istoric', () => {
    const turns = [turn('ai', 'How was your day?', 1), turn('user', 'It was busy.', 2)];
    expect(shouldAppendUserContent(turns, 'It was busy.')).toBe(false);
    expect(shouldAppendUserContent(turns, '(Move to the next phase.)')).toBe(true);
  });

  it('actualizează rezumatul din rezumatul anterior și numai turele nou îmbătrânite', () => {
    const input = formatRollingSummaryInput('The learner works in security.', [
      turn('ai', 'What happened during the incident?', 1),
      turn('user', 'We contained it before noon.', 2),
    ]);
    expect(input).toContain('Previous compact summary:');
    expect(input).toContain('The learner works in security.');
    expect(input).toContain('We contained it before noon.');
  });

  it('nu pierde turele ieșite din fereastra recentă înainte de următorul rezumat', () => {
    const turns = Array.from({ length: 16 }, (_, i) => turn(i % 2 ? 'user' : 'ai', `turn ${i}`, i));
    expect(turnsAfterSummary(turns, 6).map((t) => t.text)).toEqual(
      Array.from({ length: 10 }, (_, i) => `turn ${i + 6}`)
    );
  });

  it('păstrează toate replicile learner-ului și doar contextul profesorului necesar', () => {
    const transcript = compactTranscriptForMemory([
      turn('ai', 'That sounds important. What did you present at the client meeting?', 1),
      turn('user', 'I presented our new security dashboard to the client team.', 2),
      turn('ai', 'Did they approve it?', 3),
      turn('user', 'Yes.', 4),
      turn('ai', 'Small correction: “I went yesterday.” Please repeat it.', 5),
      turn('user', 'I went yesterday.', 6),
    ]);
    expect(transcript).toContain('Learner: I presented our new security dashboard');
    expect(transcript).not.toContain('That sounds important.');
    expect(transcript).toContain('Teacher context: What did you present at the client meeting?');
    expect(transcript).toContain('Teacher context: Did they approve it?');
    expect(transcript).toContain('Teacher context: Small correction');
  });
});
