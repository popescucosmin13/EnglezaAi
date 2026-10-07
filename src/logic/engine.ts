// Motorul educațional propriu (§5, §29) — NU e delegat AI-ului.
// Decide: ce se repetă, când, ce greșeli sunt prioritare, când crește dificultatea,
// ce vocabular e considerat învățat, planul sesiunii următoare.

import type {
  Session,
  Mistake,
  VocabItem,
  AnalyzedError,
  DailyPlan,
  Profile,
  MistakeStatus,
  Cefr,
  MistakeCategory,
  CompetencyScores,
  PronunciationResult,
  MistakePipeline,
  MistakeDeepDive,
  ConversationMemory,
} from '../types';
import { CEFR_ORDER, CATEGORY_LABELS_RO, emptyPipeline, emptyMemory } from '../types';
import { chatJson } from '../api/openrouter';
import { buildMemoryUpdatePrompt, buildMistakeDeepDivePrompt, buildMistakePromptRoPrompt, buildTransferTestPrompt, buildTransferEvalPrompt, buildReviewEvalPrompt } from '../prompts';
import { compactTranscriptForMemory } from './context-optimization';
import {
  getMistakes,
  saveMistake,
  getVocab,
  saveVocab,
  newId,
  getProfile,
  saveProfile,
  getSessions,
  savePlan,
  getPlan,
  getRecentPlans,
  todayStr,
  addXp,
  bumpActivity,
  getPronResults,
  getActivity,
  updateActivity,
  getAllActivity,
  getSituations,
  saveSituation,
  getMemory,
  saveMemory,
} from '../db/db';
import { newReviewState, applyReview, isDue } from '../srs/ladder';
import {
  GRAMMAR_CURRICULUM,
  WEEKLY_STRUCTURE,
  ROLEPLAY_SCENARIOS,
  IT_TRACK,
  DAILY_MISSIONS,
  WEEKLY_MISSIONS,
  type Mission,
} from '../content';
import { dailyMissionProgress, weeklyMissionProgress, newlyCompletedMissions, isoWeekId } from './metrics';
import { isMeaningfulCorrection, sanitizeCorrectionText, isProperNounOnlyCorrection, isDisfluencyOnlyCorrection, protectedNamesFromEmail, hasSpeechFillers } from './mistake-quality';

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Elimină duplicatele reziduale (aceeași corectură salvată de două ori — ex. o cursă simultană
 * între analiza Mirror și cea de la finalul sesiunii) fără să șteargă nimic din bază — păstrează
 * varianta cu cele mai multe apariții. Folosită oriunde greșelile ajung într-o listă vizibilă
 * (coada de repetare, testul săptămânal), ca aceeași propoziție să nu apară de două ori.
 */
export function dedupeMistakes(mistakes: Mistake[]): Mistake[] {
  const byKey = new Map<string, Mistake>();
  for (const m of mistakes) {
    const key = norm(m.correctFragment ?? m.corrected);
    const existing = byKey.get(key);
    if (!existing || m.occurrenceCount > existing.occurrenceCount) byKey.set(key, m);
  }
  return [...byKey.values()];
}

/**
 * Potrivire pe cuvinte întregi: expresia apare în text ca secvență de cuvinte complete,
 * nu ca substring ("cat" nu se potrivește în "category").
 */
export function containsExpression(text: string, expression: string): boolean {
  const words = norm(text).split(' ');
  const expr = norm(expression).split(' ').filter(Boolean);
  if (expr.length === 0) return false;
  for (let i = 0; i + expr.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < expr.length; j++) {
      if (words[i + j] !== expr[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// ---------- Stările greșelilor (§14): tranziții pe utilizări corecte repetate (§3) ----------
export function nextStatus(m: Mistake): MistakeStatus {
  if (m.review.correctUses >= 6) return 'mastered';
  if (m.review.correctUses >= 4) return 'almost';
  if (m.review.correctUses >= 2) return 'improving';
  if (m.review.correctUses >= 1) return 'learning';
  return m.status === 'mastered' || m.status === 'reappeared' ? 'reappeared' : 'new';
}

/**
 * Sarcina în română pentru cardul de repetare: traducerea propoziției corecte,
 * generată o singură dată (tier gratuit) și salvată pe greșeală.
 */
export async function ensureMistakePromptRo(m: Mistake): Promise<string | undefined> {
  if (m.promptRo?.trim()) return m.promptRo;
  // Fără cheie sau fără rețea, chatJson aruncă și cardul rămâne pe afișarea clasică (doar engleză).
  try {
    const res = await chatJson<{ promptRo: string }>(
      [{ role: 'user', content: buildMistakePromptRoPrompt(m.corrected) }],
      {
        // Text în română citit direct de utilizator — calitatea primează asupra costului aici.
        tier: 'utility',
        temperature: 0.2,
        feature: 'mistake_prompt_ro',
        maxTokens: 220,
        validate: (v) => typeof (v as { promptRo?: unknown })?.promptRo === 'string' && ((v as { promptRo: string }).promptRo.trim().length > 0),
      }
    );
    m.promptRo = res.promptRo.trim();
    await saveMistake(m);
    return m.promptRo;
  } catch (e) {
    console.warn('Traducerea RO a greșelii a eșuat:', e);
    return undefined;
  }
}

/** Mini-lecția „de ce greșesc aici" — generată la cerere, salvată pe greșeală, refolosită la reviews. */
export async function ensureMistakeDeepDive(m: Mistake): Promise<MistakeDeepDive | undefined> {
  if (m.deepDive?.ruleRo) return m.deepDive;
  try {
    const res = await chatJson<MistakeDeepDive>(
      [{ role: 'user', content: buildMistakeDeepDivePrompt(m) }],
      {
        // Explicația de gramatică, citită direct de utilizator — calitatea primează.
        tier: 'utility',
        temperature: 0.3,
        feature: 'mistake_deep_dive',
        maxTokens: 700,
        validate: (v) => {
          const d = v as MistakeDeepDive;
          return typeof d?.ruleRo === 'string' && d.ruleRo.trim().length > 0
            && typeof d?.interferenceRo === 'string'
            && Array.isArray(d?.examples) && d.examples.length >= 2
            && d.examples.every((e) => typeof e?.en === 'string' && typeof e?.ro === 'string');
        },
      }
    );
    m.deepDive = res;
    await saveMistake(m);
    return res;
  } catch (e) {
    console.warn('Mini-lecția greșelii a eșuat:', e);
    return undefined;
  }
}

/**
 * Exercițiul „context nou" pentru testul de transfer — generat o singură dată per greșeală
 * și salvat pe ea, astfel încât reîncercările (la reveniri SRS ulterioare, dacă tot pică testul)
 * nu mai regenerează un apel AI identic ca scop. Se ignoră cache-ul doar la eroare de rețea (`force`).
 */
export async function ensureTransferTest(
  profile: Profile,
  m: Mistake,
  force = false
): Promise<{ situationRo: string; expectedEn: string; keyWords: string[] } | undefined> {
  if (!force && m.transferTest) return m.transferTest;
  try {
    const res = await chatJson<{ situationRo: string; expectedEn: string; keyWords: string[] }>(
      [{ role: 'user', content: buildTransferTestPrompt(profile, m) }],
      {
        // situationRo e citit direct de utilizator (cerința exercițiului) — calitatea primează.
        tier: 'utility',
        feature: 'transfer_test',
        maxTokens: 650,
        validate: (v: any) => typeof v?.situationRo === 'string' && typeof v?.expectedEn === 'string' && Array.isArray(v?.keyWords) && v.keyWords.length > 0,
      }
    );
    m.transferTest = res;
    await saveMistake(m);
    return res;
  } catch (e) {
    console.warn('Testul de transfer a eșuat:', e);
    return undefined;
  }
}

export type TransferEval = { ruleApplied: boolean; otherErrors: { wrong: string; correct: string }[]; noteRo: string };

/**
 * Evaluează onest răspunsul la testul de transfer: separă regula exersată de restul propoziției.
 * „Curat" (regula aplicată ȘI zero alte greșeli reale) = trecut real; altfel arătăm ce mai e de corectat.
 * La eșec de rețea cădem pe verificarea deterministă pe cuvinte-cheie, fără a inventa greșeli.
 */
export async function evaluateTransfer(
  profile: Profile,
  m: Mistake,
  exercise: { situationRo: string; expectedEn: string; keyWords: string[] },
  answer: string
): Promise<TransferEval> {
  const keyOk = exercise.keyWords.every((k) => containsExpression(answer, k));
  try {
    const res = await chatJson<TransferEval>(
      [{ role: 'user', content: buildTransferEvalPrompt(profile, m, exercise, answer) }],
      {
        tier: 'utility',
        feature: 'transfer_eval',
        maxTokens: 500,
        validate: (v: any) => typeof v?.ruleApplied === 'boolean' && Array.isArray(v?.otherErrors),
      }
    );
    const otherErrors = (res.otherErrors ?? []).filter(
      (e) => e?.wrong && e?.correct && isMeaningfulCorrection(e.wrong, e.correct) && !isDisfluencyOnlyCorrection(e.wrong, e.correct)
    );
    return { ruleApplied: res.ruleApplied, otherErrors, noteRo: res.noteRo ?? '' };
  } catch (e) {
    console.warn('Evaluarea testului de transfer a eșuat, folosesc verificarea pe cuvinte-cheie:', e);
    return { ruleApplied: keyOk, otherErrors: [], noteRo: '' };
  }
}

export type ReviewGrade = { verdict: boolean; otherErrors: { wrong: string; correct: string }[]; noteRo: string };

/**
 * Evaluează onest răspunsul la cardul de repetiție ȘI auto-repară referința stocată dacă e ea însăși
 * greșită (greșelile vechi salvau uneori corecturi parțiale, ex. „planning to visiting"). Apelat DOAR
 * când verificarea ieftină pe fragment a dat deja „pare corect". `cheapPass` = plasa la eșec de rețea.
 *
 * Reguli: dacă utilizatorul a reprodus EXACT referința arătată, greșelile sunt ale referinței, nu ale
 * lui → trece. Iar `correctSentence` de la model rescrie referința greșită, ca data viitoare să fie corectă.
 */
export async function evaluateReviewAnswer(
  profile: Profile,
  m: Mistake,
  answer: string,
  cheapPass: boolean
): Promise<ReviewGrade> {
  type ReviewEval = { ruleApplied: boolean; otherErrors: { wrong: string; correct: string }[]; correctSentence?: string; noteRo?: string };
  try {
    const res = await chatJson<ReviewEval>(
      [{ role: 'user', content: buildReviewEvalPrompt(profile, m, answer) }],
      {
        tier: 'utility',
        feature: 'review_eval',
        maxTokens: 550,
        validate: (v: any) => typeof v?.ruleApplied === 'boolean' && Array.isArray(v?.otherErrors),
      }
    );
    const otherErrors = (res.otherErrors ?? []).filter(
      (e) => e?.wrong && e?.correct && isMeaningfulCorrection(e.wrong, e.correct) && !isDisfluencyOnlyCorrection(e.wrong, e.correct)
    );
    // A copiat exact propoziția-referință arătată? Atunci greșelile rămase sunt ALE referinței.
    const copiedOldRef = norm(answer) === norm(m.corrected);
    // Auto-reparare: dacă modelul a dat o variantă complet corectă, diferită de referința stocată,
    // o salvăm — data viitoare cardul arată forma corectă, consistentă cu ce acceptă evaluatorul.
    const clean = sanitizeCorrectionText(res.correctSentence ?? '');
    if (clean && !hasSpeechFillers(clean) && isMeaningfulCorrection(m.corrected, clean)) {
      m.corrected = clean;
      m.naturalVersion = clean;
      await saveMistake(m).catch((err) => console.warn('Repararea referinței a eșuat:', err));
    }
    const verdict = copiedOldRef ? true : res.ruleApplied && otherErrors.length === 0;
    return { verdict, otherErrors: copiedOldRef ? [] : otherErrors, noteRo: res.noteRo ?? '' };
  } catch (e) {
    console.warn('Evaluarea răspunsului la repetiție a eșuat, folosesc verdictul determinist:', e);
    return { verdict: cheapPass, otherErrors: [], noteRo: '' };
  }
}

/** Înregistrează erorile unei sesiuni în harta greșelilor: dedupe + frecvență + reapariție. */
export async function persistErrors(errors: AnalyzedError[], fullSentences: Map<AnalyzedError, { original: string; corrected: string; natural?: string }>): Promise<void> {
  let email: string | undefined;
  try {
    email = (await getProfile())?.email;
  } catch { /* profil indisponibil — guard-ul de nume rulează fără nume protejate */ }
  const protectedNames = protectedNamesFromEmail(email);
  const validErrors = errors.filter(
    (e) => isMeaningfulCorrection(e.originalFragment, e.correctFragment)
      && !isProperNounOnlyCorrection(e.originalFragment, e.correctFragment, protectedNames)
      // „we we" → „we": bâlbele de vorbire / STT dublat nu intră în harta greșelilor
      && !isDisfluencyOnlyCorrection(e.originalFragment, e.correctFragment)
  );
  if (validErrors.length === 0) return;
  const existing = await getMistakes();
  const now = new Date().toISOString();
  for (const e of validErrors) {
    const full = fullSentences.get(e);
    const original = (full?.original ?? e.originalFragment).trim();
    const corrected = sanitizeCorrectionText(full?.corrected ?? e.correctFragment);
    if (!isMeaningfulCorrection(original, corrected)) continue;
    const natural = full?.natural ? sanitizeCorrectionText(full.natural) : undefined;
    const originalFragment = e.originalFragment.trim();
    const correctFragment = sanitizeCorrectionText(e.correctFragment);
    // Dedupe pe fragment, indiferent de categorie: aceeași corectură etichetată diferit e tot o singură greșeală.
    const dup = existing.find((m) =>
      m.originalFragment
        ? norm(m.originalFragment) === norm(originalFragment) || norm(m.correctFragment ?? m.corrected) === norm(correctFragment)
        : norm(m.original).includes(norm(e.originalFragment)) || norm(e.originalFragment) === norm(m.original) || norm(m.corrected) === norm(e.correctFragment)
    );
    if (dup) {
      // Corectura cea mai nouă o înlocuiește pe cea veche; repară și datele istorice slabe la reapariție.
      dup.original = original;
      dup.corrected = corrected;
      dup.originalFragment = originalFragment;
      dup.correctFragment = correctFragment;
      dup.naturalVersion = natural && isMeaningfulCorrection(original, natural) ? natural : corrected;
      dup.explanationRo = e.explanationRo;
      dup.severity = e.severity;
      dup.occurrenceCount += 1;
      dup.lastSeenAt = now;
      dup.occurrences = [...(dup.occurrences ?? [dup.firstSeenAt]), now].slice(-100);
      // greșeală re-făcută = eșec la review
      dup.review = applyReview(dup.review, 'fail');
      dup.status = dup.status === 'mastered' || dup.status === 'almost' ? 'reappeared' : dup.status === 'new' ? 'new' : 'learning';
      await saveMistake(dup);
    } else {
      const m: Mistake = {
        id: newId(),
        original,
        corrected,
        originalFragment,
        correctFragment,
        naturalVersion: natural && isMeaningfulCorrection(original, natural) ? natural : corrected,
        category: e.category,
        severity: e.severity,
        explanationRo: e.explanationRo,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
        occurrences: [now],
        status: 'new',
        review: newReviewState(),
      };
      existing.push(m);
      await saveMistake(m);
    }
  }
}

/** Review reușit/nereușit al unei greșeli (din exerciții sau utilizare spontană). */
export async function reviewMistake(m: Mistake, outcome: 'fail' | 'good' | 'fast' | 'spontaneous'): Promise<Mistake> {
  m.review = applyReview(m.review, outcome);
  m.status = outcome === 'fail' ? (m.status === 'mastered' ? 'reappeared' : 'learning') : nextStatus(m);
  if (outcome !== 'fail' && todayStr() > m.firstSeenAt.slice(0, 10)) {
    // etapa „revizuită ulterior" din pipeline: review reușit într-o zi diferită de detectare
    m.pipeline = { ...(m.pipeline ?? emptyPipeline()), reviewedLater: true };
  }
  await saveMistake(m);
  if (outcome !== 'fail') await addXp(5);
  return m;
}

/** Marchează o etapă din pipeline-ul pedagogic al unei probleme (§P1). */
export async function markMistakePipeline(m: Mistake, stage: keyof MistakePipeline): Promise<void> {
  const p = m.pipeline ?? emptyPipeline();
  if (stage === 'spontaneousUses') {
    if (p.spontaneousUses >= 3) return;
    p.spontaneousUses += 1;
  } else {
    if (p[stage]) return; // deja parcursă
    p[stage] = true;
  }
  m.pipeline = p;
  await saveMistake(m);
}

/**
 * Detectează în replica utilizatorului folosirea corectă a formelor din harta greșelilor.
 * Dacă forma era expresie-țintă a sesiunii → „folosită ghidat"; altfel → utilizare spontană.
 */
export async function detectMistakeCorrectUse(userText: string, targetExpressions: string[]): Promise<string[]> {
  const mistakes = await getMistakes();
  const used: string[] = [];
  const targets = targetExpressions.map((t) => norm(t));
  for (const m of mistakes) {
    if (m.status === 'mastered') continue;
    // fragmentele de un singur cuvânt sunt prea zgomotoase pentru detecție automată
    if (!m.corrected || m.corrected.trim().split(/\s+/).length < 2) continue;
    if (!containsExpression(userText, m.corrected)) continue;
    const p = m.pipeline ?? emptyPipeline();
    const wasTarget = targets.includes(norm(m.corrected));
    if (wasTarget) p.usedGuided = true;
    else p.spontaneousUses = Math.min(3, p.spontaneousUses + 1);
    m.pipeline = p;
    m.review = applyReview(m.review, wasTarget ? 'good' : 'spontaneous');
    m.status = nextStatus(m);
    await saveMistake(m);
    used.push(m.corrected);
  }
  return used;
}

// ---------- Vocabular: activare progresivă (§15) ----------
export async function addVocabItem(partial: Partial<VocabItem> & { word: string }): Promise<VocabItem> {
  const existing = await getVocab();
  const dup = existing.find((v) => norm(v.word) === norm(partial.word));
  if (dup) return dup;
  const v: VocabItem = {
    id: newId(),
    word: partial.word,
    translation: partial.translation ?? '',
    kind: partial.kind ?? (partial.word.trim().includes(' ') ? 'expression' : 'word'),
    cefrLevel: partial.cefrLevel,
    example: partial.example ?? '',
    personalExample: partial.personalExample,
    synonyms: partial.synonyms,
    opposite: partial.opposite,
    sourceSessionId: partial.sourceSessionId,
    recognized: true,
    pronounced: false,
    usedInSentence: false,
    usedInNewContext: false,
    usedSpontaneously: false,
    passiveScore: 30,
    activeScore: 0,
    review: newReviewState(),
    createdAt: new Date().toISOString(),
  };
  await saveVocab(v);
  return v;
}

export async function markVocabUse(v: VocabItem, use: 'pronounced' | 'usedInSentence' | 'usedInNewContext' | 'usedSpontaneously'): Promise<void> {
  v[use] = true;
  v.passiveScore = Math.min(100, v.passiveScore + 15);
  let activeBump: number;
  if (use === 'usedSpontaneously') {
    // activarea completă cere 3 utilizări spontane (§15) — fiecare contează, cu bonus la prima
    v.spontaneousUses = (v.spontaneousUses ?? 0) + 1;
    activeBump = v.spontaneousUses === 1 ? 20 : 15;
  } else {
    activeBump = use === 'usedInNewContext' ? 25 : use === 'usedInSentence' ? 20 : 10;
  }
  v.activeScore = Math.min(100, v.activeScore + activeBump);
  v.review = applyReview(v.review, use === 'usedSpontaneously' ? 'spontaneous' : 'good');
  await saveVocab(v);
}

/**
 * Detectează folosirea spontană a expresiilor-țintă în textul userului.
 * Potrivire pe cuvinte întregi; utilizările repetate se numără până la activarea completă (3).
 */
export async function detectSpontaneousUse(userText: string): Promise<string[]> {
  const vocab = await getVocab();
  const used: string[] = [];
  for (const v of vocab) {
    if ((v.spontaneousUses ?? (v.usedSpontaneously ? 1 : 0)) >= 3) continue;
    if (containsExpression(userText, v.word)) {
      await markVocabUse(v, 'usedSpontaneously');
      used.push(v.word);
    }
  }
  return used;
}

// ---------- Scoruri pe competențe din sesiuni reale (§25) ----------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Măsoară competențele din fereastra ultimelor 5-10 sesiuni + rezultatele de pronunție/ascultare.
 * Întoarce doar competențele pentru care există date; fără exerciții de ascultare,
 * listening rămâne pe seama testului de nivel.
 */
export function measureCompetencies(
  sessions: Session[],
  vocab: VocabItem[],
  pron: PronunciationResult[]
): Partial<CompetencyScores> {
  const out: Partial<CompetencyScores> = {};
  const window = sessions.filter((s) => s.wordCount > 0 && s.userSpeakingSec > 30).slice(-10);
  if (window.length >= 3) {
    const words = window.reduce((a, s) => a + s.wordCount, 0);
    const speakSec = window.reduce((a, s) => a + s.userSpeakingSec, 0);
    const errors = window.reduce((a, s) => a + s.errorCount, 0);
    // gramatică: greșeli / 100 de cuvinte (0 → 95, 12+ → 30)
    const errorsPer100 = (errors / words) * 100;
    out.grammar = Math.round(clamp(95 - errorsPer100 * 5.5, 30, 95));
    // conversație: ritm (cuvinte/min) + pauza medie de gândire
    const wpm = words / (speakSec / 60);
    const wpmScore = clamp((wpm / 110) * 100, 10, 100);
    const pauses = window.map((s) => s.avgHesitationMs).filter((h): h is number => h != null);
    const avgPauseSec = pauses.length ? pauses.reduce((a, b) => a + b, 0) / pauses.length / 1000 : null;
    const pauseScore = avgPauseSec == null ? wpmScore : clamp(100 - (avgPauseSec - 1.5) * 12, 10, 100);
    out.conversation = Math.round(0.6 * wpmScore + 0.4 * pauseScore);
    // vocabular: diversitate lexicală + expresii activate
    const ttr = window.reduce((a, s) => a + s.uniqueWords / Math.max(1, s.wordCount), 0) / window.length;
    const activeCount = vocab.filter((v) => v.activeScore >= 60).length;
    out.vocabulary = Math.round(clamp(ttr * 130, 0, 60) + clamp(activeCount * 1.5, 0, 40));
  }
  const recentPron = pron.filter((r) => r.exercise !== 'listening').slice(-30);
  if (recentPron.length >= 5) {
    out.pronunciation = Math.round(recentPron.reduce((a, r) => a + r.score, 0) / recentPron.length);
  }
  // ascultarea se măsoară din exercițiile listening ladder (§P1)
  const recentListening = pron.filter((r) => r.exercise === 'listening').slice(-30);
  if (recentListening.length >= 5) {
    out.listening = Math.round(recentListening.reduce((a, r) => a + r.score, 0) / recentListening.length);
  }
  return out;
}

/** Amestecă lin măsurătorile în scorurile profilului (70% vechi / 30% măsurat). */
export function blendScores(current: CompetencyScores, measured: Partial<CompetencyScores>): CompetencyScores {
  const next = { ...current };
  for (const k of Object.keys(measured) as (keyof CompetencyScores)[]) {
    const m = measured[k];
    if (m != null) next[k] = Math.round(current[k] * 0.7 + m * 0.3);
  }
  return next;
}

/** Praguri stabile pentru transformarea scorurilor măsurate în niveluri CEFR. */
export function competencyLevelFromScore(score: number): Cefr {
  const value = clamp(score, 0, 100);
  if (value >= 90) return 'C2';
  if (value >= 80) return 'C1';
  if (value >= 65) return 'B2';
  if (value >= 50) return 'B1';
  if (value >= 35) return 'A2';
  return 'A1';
}

export function competencyLevelsFromScores(scores: CompetencyScores): Profile['competencyLevels'] {
  return {
    conversation: competencyLevelFromScore(scores.conversation),
    grammar: competencyLevelFromScore(scores.grammar),
    pronunciation: competencyLevelFromScore(scores.pronunciation),
    vocabulary: competencyLevelFromScore(scores.vocabulary),
    listening: competencyLevelFromScore(scores.listening),
  };
}

const CEFR_SCORE_FLOOR: Record<Cefr, number> = { A1: 0, A2: 35, B1: 50, B2: 65, C1: 80, C2: 90 };

/**
 * Schimbă nivelul general cu cel mult o treaptă și numai când minimum patru
 * sesiuni recente sunt consecvente, iar scorul compozit confirmă direcția.
 */
export function levelFromRecentEvidence(current: Cefr, estimates: Cefr[], overallScore: number): Cefr {
  const currentIndex = CEFR_ORDER.indexOf(current);
  const recent = estimates.slice(-5).map((level) => CEFR_ORDER.indexOf(level)).filter((index) => index >= 0);
  if (recent.length < 4) return current;

  const above = recent.filter((index) => index > currentIndex).length;
  const below = recent.filter((index) => index < currentIndex).length;
  if (above >= 4 && currentIndex < CEFR_ORDER.length - 1) {
    const candidate = CEFR_ORDER[currentIndex + 1];
    return overallScore >= CEFR_SCORE_FLOOR[candidate] ? candidate : current;
  }
  if (below >= 4 && recent.length >= 5 && currentIndex > 0) {
    const downgradeThreshold = CEFR_SCORE_FLOOR[current] - 5;
    return overallScore < downgradeThreshold ? CEFR_ORDER[currentIndex - 1] : current;
  }
  return current;
}

async function updateCompetencyScores(): Promise<void> {
  const [sessions, vocab, pron, profile] = await Promise.all([getSessions(), getVocab(), getPronResults(), getProfile()]);
  const measured = measureCompetencies(sessions, vocab, pron);
  if (Object.keys(measured).length === 0) return;
  profile.scores = blendScores(profile.scores, measured);
  profile.competencyLevels = competencyLevelsFromScores(profile.scores);
  await saveProfile(profile);
}

// ---------- Memoria de conversație pe termen lung (§P1+) ----------

/** Formatul compact injectat în promptul profesorului — plafonat, ca să nu consume tokeni. */
export function formatMemoryForPrompt(m: ConversationMemory): string {
  const parts: string[] = [];
  if (m.facts.length > 0) parts.push(`Known about the learner: ${m.facts.slice(0, 12).join('; ')}.`);
  if (m.topics.length > 0) {
    const recent = m.topics.slice(-8).map((t) => `${t.topic} (${t.date})`).join(', ');
    parts.push(`Recently discussed topics: ${recent}.`);
  }
  if (m.openThreads.length > 0) parts.push(`Open threads to follow up: ${m.openThreads.slice(0, 6).join('; ')}.`);
  return parts.join('\n');
}

/**
 * Actualizează memoria din transcriptul sesiunii — rulează pe modelul GRATUIT (tier 'free'),
 * deci nu consumă din bugetul modelelor plătite; eșecul e neblocant.
 */
export async function updateConversationMemory(session: Session): Promise<void> {
  const userTurns = session.turns.filter((t) => t.role === 'user');
  if (userTurns.length < 3) return; // prea puțin conținut ca să merite o actualizare
  const memory = await getMemory().catch(() => emptyMemory());
  const transcript = compactTranscriptForMemory(session.turns, 7000);
  const date = session.startedAt.slice(0, 10);
  const updated = await chatJson<Pick<ConversationMemory, 'facts' | 'topics' | 'openThreads'>>(
    [{ role: 'user', content: buildMemoryUpdatePrompt(memory, transcript, date) }],
    {
      tier: 'free',
      temperature: 0.2,
      feature: 'memory_update',
      maxTokens: 1400,
      validate: (v: any) =>
        Array.isArray(v?.facts) && v.facts.every((f: unknown) => typeof f === 'string') &&
        Array.isArray(v?.topics) && v.topics.every((t: any) => typeof t?.topic === 'string' && typeof t?.date === 'string') &&
        Array.isArray(v?.openThreads) && v.openThreads.every((t: unknown) => typeof t === 'string'),
    }
  );
  await saveMemory({
    facts: updated.facts.slice(0, 25),
    topics: updated.topics.slice(-30),
    openThreads: updated.openThreads.slice(0, 8),
    updatedAt: new Date().toISOString(),
  });
}

// ---------- Recompensele misiunilor (§24): XP acordat exact o dată la finalizare ----------
export async function awardMissionRewards(): Promise<Mission[]> {
  const awarded: Mission[] = [];
  // zilnice: progresul din activitatea de azi, plătit o singură dată pe zi
  const activity = await getActivity(todayStr());
  const dailyDone = activity.missionsAwarded ?? [];
  const newDaily = newlyCompletedMissions(DAILY_MISSIONS, dailyMissionProgress(activity), dailyDone);
  if (newDaily.length > 0) {
    await updateActivity({ missionsAwarded: [...dailyDone, ...newDaily.map((m) => m.id)] });
    for (const m of newDaily) await addXp(m.xp);
    awarded.push(...newDaily);
  }
  // săptămânale: plătite o singură dată pe săptămâna ISO
  const [profile, acts, sessions, vocab] = await Promise.all([getProfile(), getAllActivity(), getSessions(), getVocab()]);
  const weekId = isoWeekId();
  const weeklyDone = profile.weeklyAwards?.weekId === weekId ? profile.weeklyAwards.ids : [];
  const newWeekly = newlyCompletedMissions(WEEKLY_MISSIONS, weeklyMissionProgress(acts, sessions, vocab), weeklyDone);
  if (newWeekly.length > 0) {
    profile.weeklyAwards = { weekId, ids: [...weeklyDone, ...newWeekly.map((m) => m.id)] };
    await saveProfile(profile);
    for (const m of newWeekly) await addXp(m.xp);
    awarded.push(...newWeekly);
  }
  return awarded;
}

// ---------- Pipeline-ul de după sesiune (§29) ----------
export async function processSessionEnd(session: Session): Promise<void> {
  // 1-4: erorile au fost deja persistate per-replică sau la batch (persistErrors)
  // 5-6: problema dominantă + priorități — folosite la planul de mâine
  // 8: repetițiile sunt programate prin ReviewState
  // 10: nivelul estimat — doar pe mai multe sesiuni (§25, §32)
  await updateCompetencyScores();
  await updateLevelEstimate();
  // memoria pe termen lung se actualizează pe modelul gratuit, ÎN FUNDAL — modelele :free pot
  // sta minute în coadă, iar raportul de final de sesiune nu are voie să aștepte după ele
  void updateConversationMemory(session).catch((e) => console.warn('Actualizarea memoriei a eșuat:', e));
  // XP (§24)
  const minutes = Math.round(session.userSpeakingSec / 60);
  await addXp(minutes * 10 + (session.report ? 15 : 0));
  await bumpActivity('speakingSec', session.userSpeakingSec);
  await bumpActivity('sessionCount', 1);
  // misiunile terminate în această sesiune își primesc XP-ul acum
  await awardMissionRewards();
  // planul de mâine se regenerează la următoarea deschidere (invalidăm doar dacă e azi)
}

async function updateLevelEstimate(): Promise<void> {
  const sessions = await getSessions();
  const withEstimates = sessions.filter((s) => s.levelEstimate).slice(-5);
  if (withEstimates.length < 4) return;
  const profile = await getProfile();
  const previous = profile.currentLevel;
  const next = levelFromRecentEvidence(previous, withEstimates.map((session) => session.levelEstimate!), compositeScore(profile.scores));
  if (next !== previous) {
    profile.currentLevel = next;
    profile.lastLevelChange = { from: previous, to: next, changedAt: new Date().toISOString() };
    await saveProfile(profile);
  }
}

// ---------- Prioritățile (§11, §29): sens > repetate > lecția zilei > frecvente > nenaturale ----------
export function prioritizeMistakes(mistakes: Mistake[], focusCategory?: string): Mistake[] {
  const score = (m: Mistake) =>
    (m.severity === 'high' ? 1000 : m.severity === 'medium' ? 100 : 0) +
    m.occurrenceCount * 50 +
    (focusCategory && m.category === focusCategory ? 500 : 0) +
    (m.category === 'unnatural_phrasing' ? 5 : 10);
  return [...mistakes].sort((a, b) => score(b) - score(a));
}

export async function dominantCategory(): Promise<MistakeCategory | null> {
  const mistakes = await getMistakes();
  const active = mistakes.filter((m) => m.status !== 'mastered');
  if (active.length === 0) return null;
  const counts = new Map<MistakeCategory, number>();
  for (const m of active) counts.set(m.category, (counts.get(m.category) ?? 0) + m.occurrenceCount);
  let best: MistakeCategory | null = null;
  let max = 0;
  for (const [c, n] of counts) if (n > max) { max = n; best = c; }
  return best;
}

// ---------- Planul zilnic (§28 daily_plans) ----------
export async function getOrCreateDailyPlan(): Promise<DailyPlan> {
  const date = todayStr();
  const cached = await getPlan(date);
  if (cached) return cached;

  const profile = await getProfile();
  const mistakes = await getMistakes();
  const vocab = await getVocab();
  const pron = await getPronResults();

  // gramatică: categoria dominantă din greșeli, altfel următorul pas din curriculum
  const domCat = await dominantCategory();
  const curriculumItem =
    GRAMMAR_CURRICULUM.find((c) => c.level === profile.currentLevel && domCat && c.category === domCat) ??
    GRAMMAR_CURRICULUM.find((c) => c.level === profile.currentLevel) ??
    GRAMMAR_CURRICULUM[0];
  const grammarFocus = domCat ?? curriculumItem.category;
  const grammarFocusLabel = domCat ? CATEGORY_LABELS_RO[domCat] : curriculumItem.titleRo;

  // vocabular: expresiile scadente la repetare (§16), max 5 (§29)
  const dueVocab = vocab.filter((v) => isDue(v.review)).sort((a, b) => a.activeScore - b.activeScore).slice(0, 5);

  // pronunție: sunetul cel mai slab din ultimele rezultate (exercițiile de ascultare nu intră aici)
  const soundScores = new Map<string, { sum: number; n: number }>();
  for (const r of pron.filter((x) => x.exercise !== 'listening').slice(-30)) for (const t of r.targets) {
    const cur = soundScores.get(t) ?? { sum: 0, n: 0 };
    cur.sum += r.score; cur.n += 1; soundScores.set(t, cur);
  }
  let pronFocus = 'th';
  let minAvg = 101;
  for (const [snd, { sum, n }] of soundScores) if (sum / n < minAvg) { minAvg = sum / n; pronFocus = snd; }

  // scenariu: situația salvată de utilizator are prioritate (§P1), apoi structura săptămânală (§22)
  const dow = new Date().getDay();
  const weekEntry = WEEKLY_STRUCTURE.find((w) => w.day === dow)!;
  const isIT = profile.mainObjective.includes('IT');
  const scenarioPool = weekEntry.sessionHint === 'professional' || isIT
    ? (isIT ? IT_TRACK.map((m) => ({ id: m.id, titleRo: m.titleRo })) : ROLEPLAY_SCENARIOS.filter((s) => s.professional).map((s) => ({ id: s.id, titleRo: s.titleRo })))
    : ROLEPLAY_SCENARIOS.map((s) => ({ id: s.id, titleRo: s.titleRo }));
  // evităm să repetăm un scenariu folosit în ultimele 7 zile — cu pool-uri de doar ~9-10
  // scenarii, alegerea complet aleatoare repeta des (paradoxul zilei de naștere)
  const recentPlans = await getRecentPlans(7).catch(() => []);
  const recentScenarioIds = new Set(recentPlans.map((p) => p.conversationScenario));
  const freshPool = scenarioPool.filter((s) => !recentScenarioIds.has(s.id));
  const pickPool = freshPool.length > 0 ? freshPool : scenarioPool;
  let scenario = pickPool[Math.floor(Math.random() * pickPool.length)];
  let situationText: string | undefined;
  const pendingSituation = (await getSituations().catch(() => [])).find((s) => !s.used);
  if (pendingSituation) {
    scenario = { id: `situation-${pendingSituation.id}`, titleRo: 'Situația ta salvată' };
    situationText = pendingSituation.text;
    await saveSituation({ ...pendingSituation, used: true });
  }

  const worstMistake = prioritizeMistakes(mistakes.filter((m) => m.status !== 'mastered'))[0];
  const reasonRo = worstMistake
    ? `Azi lucrăm pe ${grammarFocusLabel.toLowerCase()} — greșeala ta cea mai frecventă („${worstMistake.original.slice(0, 50)}…"). ${weekEntry.titleRo}.`
    : `${weekEntry.titleRo}. Construim baza: ${grammarFocusLabel.toLowerCase()}.`;

  const plan: DailyPlan = {
    date,
    targetMinutes: profile.dailyGoalMinutes,
    grammarFocus,
    grammarFocusLabel,
    vocabularyFocus: dueVocab.map((v) => v.word),
    pronunciationFocus: pronFocus,
    conversationScenario: scenario.id,
    conversationScenarioTitle: scenario.titleRo,
    reasonRo: situationText ? `Azi refaci în engleză situația pe care ai salvat-o: „${situationText.slice(0, 80)}…". ${reasonRo}` : reasonRo,
    completed: false,
    ...(situationText ? { situationText } : {}),
  };
  await savePlan(plan);
  return plan;
}

// ---------- Scor compozit (§25): 30/25/20/15/10 ----------
export function compositeScore(scores: Profile['scores']): number {
  return Math.round(
    scores.conversation * 0.3 + scores.grammar * 0.25 + scores.pronunciation * 0.2 + scores.vocabulary * 0.15 + scores.listening * 0.1
  );
}

// ---------- Expresiile-țintă pentru conversație (§3, §30) ----------
export async function targetExpressionsForToday(): Promise<string[]> {
  const vocab = await getVocab();
  const due = vocab.filter((v) => isDue(v.review) && !v.usedSpontaneously).slice(0, 3);
  const mistakes = await getMistakes();
  const dueMistakes = mistakes.filter((m) => isDue(m.review) && m.status !== 'mastered');
  const prioritized = prioritizeMistakes(dueMistakes).slice(0, 2);
  return [...due.map((v) => v.word), ...prioritized.map((m) => m.corrected)];
}
