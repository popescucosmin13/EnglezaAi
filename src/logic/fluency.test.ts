import { describe, it, expect } from 'vitest';
import { computeFluency, countCodeSwitchWords } from './fluency';
import type { Utterance } from '../types';

function user(text: string, hesitationMs?: number): Utterance {
  return { role: 'user', text, ts: Date.now(), hesitationMs };
}
function ai(text: string): Utterance {
  return { role: 'ai', text, ts: Date.now() };
}

describe('countCodeSwitchWords', () => {
  it('numără cuvintele cu diacritice românești', () => {
    expect(countCodeSwitchWords('I need a new aspirator și o mașină')).toBeGreaterThanOrEqual(2);
  });
  it('prinde cuvinte-funcție românești fără diacritice', () => {
    expect(countCodeSwitchWords('I want to buy this pentru my house')).toBe(1);
  });
  it('nu raportează fals-pozitive pe engleză curată', () => {
    expect(countCodeSwitchWords('I went to the store yesterday and bought some milk')).toBe(0);
  });
});

describe('computeFluency', () => {
  it('întoarce zerouri pe conversație goală', () => {
    const m = computeFluency([ai('Hi!')], 0);
    expect(m).toMatchObject({ ttfwMs: 0, mlr: 0, utterances: 0 });
  });

  it('calculează TTFW ca mediană a ezitărilor și numără pauzele lungi', () => {
    const turns = [
      ai('How are you?'),
      user('I am fine thank you', 1000),
      ai('What did you do?'),
      user('I went to work today', 2000),
      ai('Nice, and then?'),
      user('Then I came back home', 3000),
    ];
    const m = computeFluency(turns, 30);
    expect(m.ttfwMs).toBe(2000); // mediana din [1000, 2000, 3000]
    expect(m.pausesOver1_5s).toBe(2); // 2000 și 3000 depășesc 1500
    expect(m.utterances).toBe(3);
  });

  it('exclude filler-ele din MLR și le contorizează în filler_rate', () => {
    const turns = [
      ai('Tell me about your weekend.'),
      user('uh um I went to the the park', 500),
    ];
    const m = computeFluency(turns, 12);
    // 8 tokeni bruți minus 2 filler-e (uh, um) = 6 cuvinte de conținut
    expect(m.mlr).toBe(6);
    expect(m.fillerRate).toBeGreaterThan(0);
  });

  it('numără code-switch-urile pe toată sesiunea', () => {
    const turns = [
      ai('What do you need?'),
      user('I need to buy a aspirator', 800),
      ai('Anything else?'),
      user('Yes și un frigider', 800),
    ];
    const m = computeFluency(turns, 20);
    expect(m.codeSwitches).toBeGreaterThanOrEqual(3); // aspirator, și, frigider
  });
});
