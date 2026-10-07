import { describe, expect, it } from 'vitest';
import {
  hasSpeechFillers,
  isDisfluencyOnlyCorrection,
  isMeaningfulCorrection,
  isProperNounOnlyCorrection,
  isUsableMistake,
  mistakeDisplay,
  protectedNamesFromEmail,
  replaceFirstCorrection,
  sanitizeCorrectionText,
} from './mistake-quality';

describe('calitatea corectărilor', () => {
  it('respinge diferențele doar de capitalizare sau punctuație', () => {
    expect(isMeaningfulCorrection('because I work here.', 'Because I work here.')).toBe(false);
    expect(isMeaningfulCorrection('Hello world', 'Hello, world!')).toBe(false);
  });

  it('păstrează corectările gramaticale și cratimele relevante', () => {
    expect(isMeaningfulCorrection('I work yesterday', 'I worked yesterday')).toBe(true);
    expect(isMeaningfulCorrection('one year old', 'one-year-old')).toBe(true);
  });

  it('elimină ezitările STT din varianta predată', () => {
    expect(hasSpeechFillers('I work in uh cybersecurity')).toBe(true);
    expect(sanitizeCorrectionText('I work in uh cybersecurity.')).toBe('I work in cybersecurity.');
  });

  it('exclude înregistrările vechi identice sau care încă au ezitări', () => {
    expect(isUsableMistake({ original: 'i work here', corrected: 'I work here.' })).toBe(false);
    expect(isUsableMistake({ original: 'I work in uh security', corrected: 'I work in uh cybersecurity' })).toBe(false);
    expect(isUsableMistake({ original: 'I work yesterday', corrected: 'I worked yesterday' })).toBe(true);
  });

  it('recunoaște corecturile care doar elimină bâlbe (repetiții de cuvinte)', () => {
    expect(isDisfluencyOnlyCorrection('we we', 'we')).toBe(true);
    expect(isDisfluencyOnlyCorrection('we we go to office', 'we go to office')).toBe(true);
    expect(isDisfluencyOnlyCorrection('I want I want to go', 'I want to go')).toBe(true);
    expect(isDisfluencyOnlyCorrection('we uh we go', 'we go')).toBe(true);
    // corecturi reale — nu sunt doar bâlbe
    expect(isDisfluencyOnlyCorrection('we we go to office', 'we go to the office')).toBe(false);
    expect(isDisfluencyOnlyCorrection('I work yesterday', 'I worked yesterday')).toBe(false);
  });

  it('exclude cardurile a căror unică „greșeală" e o bâlbă, inclusiv la nivel de fragment', () => {
    expect(isUsableMistake({ original: 'we we go to office', corrected: 'we go to office' })).toBe(false);
    // fragmentul afișat e bâlbă, chiar dacă propoziția are și alte diferențe
    expect(isUsableMistake({
      original: 'we we go to office',
      corrected: 'we go to the office',
      originalFragment: 'we we',
      correctFragment: 'we',
    })).toBe(false);
    // fragment cu greșeală reală — rămâne
    expect(isUsableMistake({
      original: 'we we go to office',
      corrected: 'we go to the office',
      originalFragment: 'to office',
      correctFragment: 'to the office',
    })).toBe(true);
  });

  it('aplică o corectare pe fragment fără să depindă de majuscule', () => {
    expect(replaceFirstCorrection('I DONT wanted this', 'dont wanted', "didn't want")).toEqual({
      text: "I didn't want this",
      applied: true,
    });
  });
});

describe('guard pe nume proprii', () => {
  it('extrage numele protejate din email', () => {
    expect(protectedNamesFromEmail('alex.ionescu@example.com')).toEqual(['alex', 'ionescu']);
    expect(protectedNamesFromEmail(undefined)).toEqual([]);
    expect(protectedNamesFromEmail('ab@x.com')).toEqual([]);
  });

  it('respinge „corecturile" care doar înlocuiesc numele utilizatorului', () => {
    const names = ['alex', 'ionescu'];
    expect(isProperNounOnlyCorrection('Alex', 'Cosmic', names)).toBe(true);
    expect(isProperNounOnlyCorrection('My name is Alex', 'My name is Cosmic', names)).toBe(true);
  });

  it('respinge înlocuirea unui nume propriu din mijlocul frazei', () => {
    expect(isProperNounOnlyCorrection('I talked with Andrei yesterday', 'I talked with Andrew yesterday')).toBe(true);
  });

  it('păstrează corectările gramaticale reale', () => {
    expect(isProperNounOnlyCorrection('She like the ball', 'She likes the ball')).toBe(false);
    expect(isProperNounOnlyCorrection('I work yesterday', 'I worked yesterday')).toBe(false);
    // nume + greșeală reală în același fragment → rămâne greșeală
    expect(isProperNounOnlyCorrection('Alex have 30 years', 'Cosmic is 30 years old', ['alex'])).toBe(false);
  });

  it('isUsableMistake exclude intrările vechi cu nume „corectat"', () => {
    expect(isUsableMistake({ original: 'Alex', corrected: 'Cosmic' }, ['alex'])).toBe(false);
    expect(isUsableMistake({ original: 'I work yesterday', corrected: 'I worked yesterday' }, ['alex'])).toBe(true);
  });

  it('exclude fragmentele care înlocuiesc un nume propriu necunoscut (Moeciu → Media)', () => {
    expect(
      isUsableMistake({
        original: 'Yes, in Brasov area, more exactly in Moeciu',
        corrected: 'Yes, in Brasov area, more exactly in Media',
        originalFragment: 'Moeciu',
        correctFragment: 'Media',
      })
    ).toBe(false);
    // majusculă la ÎNCEPUT de propoziție = nu e neapărat nume propriu → rămâne greșeală
    expect(
      isUsableMistake({
        original: 'Peoples are waiting outside',
        corrected: 'People are waiting outside',
        originalFragment: 'Peoples',
        correctFragment: 'People',
      })
    ).toBe(true);
  });
});

describe('mistakeDisplay', () => {
  it('preferă fragmentul atomic și oferă propoziția drept context', () => {
    const d = mistakeDisplay({
      original: 'She like uh all of them but the ball is prefer',
      corrected: 'She likes all of them but she prefers the ball.',
      originalFragment: 'She like',
      correctFragment: 'She likes',
    });
    expect(d.wrong).toBe('She like');
    expect(d.right).toBe('She likes');
    expect(d.contextRight).toBe('She likes all of them but she prefers the ball.');
  });

  it('cade înapoi pe propoziția întreagă la datele vechi', () => {
    const d = mistakeDisplay({ original: 'I have 30 years', corrected: 'I am 30 years old' });
    expect(d.wrong).toBe('I have 30 years');
    expect(d.right).toBe('I am 30 years old');
    expect(d.contextRight).toBeUndefined();
  });
});

