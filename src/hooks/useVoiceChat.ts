// Hook-ul central de conversație vocală: microfon → STT → LLM → TTS,
// corectare pe 3 moduri (§11), analiză JSON (§31), rezumat rolling (§33), raport final (§12).

import { useEffect, useRef, useState } from 'react';
import type {
  Utterance,
  UtteranceAnalysis,
  AnalyzedError,
  Session,
  SessionReport,
  SessionType,
  CorrectionMode,
  Profile,
  Cefr,
  GrammarMatch,
  MistakeCategory,
} from '../types';
import { chatJson, chatText, type ChatMessage } from '../api/openrouter';
import { transcribe } from '../api/stt';
import { Recorder, LiveRecognizer, getWebSpeech } from '../audio/recorder';
import { SilenceWatcher, VoiceMeter } from '../audio/vad';
import { speak, stopSpeaking } from '../audio/tts';
import { getSettings, hasOpenRouterKey } from '../settings';
import { useHandsFree } from './useHandsFree';
import {
  buildConversationPromptParts,
  buildAnalysisPrompt,
  buildAnalysisAndReportPrompt,
  buildReportPrompt,
  buildSummaryPrompt,
  formatTurnsForAnalysis,
  type ConversationConfig,
} from '../prompts';
import { persistErrors, processSessionEnd, detectSpontaneousUse, detectMistakeCorrectUse } from '../logic/engine';
import { newId, saveSession, updateActivity, bumpActivity, addXp } from '../db/db';
import { emit } from '../events';
import type { DifficultyDef } from '../content';
import { checkWithLanguageTool } from '../api/languagetool';
import {
  hasSpeechFillers,
  isDisfluencyOnlyCorrection,
  isMeaningfulCorrection,
  normalizeForCorrectionComparison,
  replaceFirstCorrection,
  sanitizeCorrectionText,
} from '../logic/mistake-quality';
import {
  FULL_CONTEXT_TURNS,
  RECENT_CONTEXT_TURNS,
  SUMMARY_REFRESH_TURNS,
  formatRollingSummaryInput,
  shouldAppendUserContent,
  turnsAfterSummary,
} from '../logic/context-optimization';

export type ChatBusy = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'ending';

interface ConvoTurnResponse {
  reply: string;
  hints?: string[];
  usedTargetExpressions?: string[];
}
interface AnalysisResponse {
  analyses: UtteranceAnalysis[];
}
interface AnalysisAndReportResponse extends AnalysisResponse {
  report: SessionReport;
}

// Validatoare structurale (§31): un răspuns malformat declanșează retry în chatJson, nu date corupte.
const isConvoTurn = (v: unknown): boolean =>
  typeof (v as ConvoTurnResponse)?.reply === 'string' && (v as ConvoTurnResponse).reply.trim().length > 0;
const isAnalysisResponse = (v: unknown): boolean => {
  const a = (v as AnalysisResponse)?.analyses;
  return Array.isArray(a) && a.every((x) => {
    if (typeof x?.original !== 'string' || typeof x?.corrected !== 'string' || !Array.isArray(x?.errors)) return false;
    const correctedNormalized = normalizeForCorrectionComparison(x.corrected);
    const validErrors = x.errors.every((e) =>
      typeof e?.originalFragment === 'string'
      && typeof e?.correctFragment === 'string'
      && typeof e?.explanationRo === 'string'
      && isMeaningfulCorrection(e.originalFragment, e.correctFragment)
      && correctedNormalized.includes(normalizeForCorrectionComparison(e.correctFragment))
    );
    return validErrors && (x.errors.length === 0 || (isMeaningfulCorrection(x.original, x.corrected) && !hasSpeechFillers(x.corrected)));
  });
};
const isSessionReport = (v: unknown): boolean => {
  const r = v as SessionReport;
  return Array.isArray(r?.wellDone)
    && Array.isArray(r?.mainMistakes)
    && r.mainMistakes.every((m) =>
      typeof m?.said === 'string'
      && typeof m?.correct === 'string'
      && typeof m?.natural === 'string'
      && typeof m?.explanationRo === 'string'
      // Cerem 3 propoziții în prompt, dar 2 sau 4 nu justifică pierderea întregului raport.
      && Array.isArray(m?.exerciseSentences)
      && m.exerciseSentences.length >= 1
    )
    && Array.isArray(r?.newExpressions)
    && typeof r?.generalScore === 'number'
    && typeof r?.summaryRo === 'string';
};
const isAnalysisAndReportResponse = (v: unknown): boolean =>
  isAnalysisResponse(v) && isSessionReport((v as AnalysisAndReportResponse)?.report);

function refineAiAnalysis(userText: string, analysis?: UtteranceAnalysis): UtteranceAnalysis {
  const original = userText.trim();
  if (!analysis) return { original, corrected: original, naturalVersion: original, errors: [] };

  const errors = (analysis.errors ?? []).filter((e) =>
    typeof e.originalFragment === 'string'
    && typeof e.correctFragment === 'string'
    && isMeaningfulCorrection(e.originalFragment, e.correctFragment)
    // repetițiile involuntare („we we") sunt bâlbe de vorbire/STT, nu greșeli de predat
    && !isDisfluencyOnlyCorrection(e.originalFragment, e.correctFragment)
  );
  let corrected = sanitizeCorrectionText(analysis.corrected || original);

  // Dacă AI-ul a raportat erori, dar a întors doar o schimbare cosmetică, reconstruim
  // propoziția din fragmentele concrete în loc să salvăm o „corectură” identică.
  if (!isMeaningfulCorrection(original, corrected)) {
    corrected = original;
    for (const error of errors) {
      const applied = replaceFirstCorrection(corrected, error.originalFragment, error.correctFragment);
      if (applied.applied) corrected = applied.text;
    }
    corrected = sanitizeCorrectionText(corrected);
  }

  if (!isMeaningfulCorrection(original, corrected)) {
    return { ...analysis, original, corrected: original, naturalVersion: original, errors: [] };
  }

  const natural = sanitizeCorrectionText(analysis.naturalVersion || corrected);
  const correctedNormalized = normalizeForCorrectionComparison(corrected);
  const representedErrors = errors.filter((e) =>
    correctedNormalized.includes(normalizeForCorrectionComparison(e.correctFragment))
  );
  return {
    ...analysis,
    original,
    corrected,
    naturalVersion: isMeaningfulCorrection(original, natural) ? natural : corrected,
    errors: representedErrors,
  };
}

export interface VoiceChatConfig {
  type: SessionType;
  scenarioId?: string;
  scenarioTitle?: string;
  scenarioPersona?: string;
  profile: Profile;
  difficulty: DifficultyDef;
  correctionMode: CorrectionMode;
  targetExpressions?: string[];
  grammarFocus?: string;
  guided?: boolean;
  speakReplies?: boolean;
  resumeKey?: string; // salvează local sesiunea activă pentru reluare după închiderea PWA-ului
  memoryContext?: string; // memoria pe termen lung (§P1+) — subiecte anterioare, fire deschise
}

interface VoiceChatDraft {
  savedAt: number;
  turns: Utterance[];
  startTime: number;
  speakingSec: number;
  lastReplyAt: number;
  hesitations: number[];
  summary: string;
  summaryThrough?: number;
  usedRomanian: boolean;
  phase?: string;
  targets: string[];
  batchAnalysisDone?: boolean;
  grammarMatches?: GrammarMatch[];
}

function countWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

const RO_MARKERS = /[ăâîșț]|\b(și|sau|este|sunt|pentru|acum|vreau|trebuie|nu știu|adică)\b/i;

export function useVoiceChat(cfg: VoiceChatConfig) {
  const [turns, setTurns] = useState<Utterance[]>([]);
  const [busy, setBusy] = useState<ChatBusy>('idle');
  const busyRef = useRef<ChatBusy>('idle');
  const [interim, setInterim] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [resumedDraft, setResumedDraft] = useState(false);
  // hands-free (mașină): stare + wake lock + rutare TTS — logica în hook-ul dedicat
  const { handsFree, handsFreeRef, setHandsFree: setHandsFreeBase, releaseWakeLock } = useHandsFree();

  const recorder = useRef(new Recorder());
  const live = useRef(new LiveRecognizer());
  const silence = useRef(new SilenceWatcher());
  const voiceMeter = useRef(new VoiceMeter());
  const autoRecordSuspended = useRef(false);
  const emptyAutoTakes = useRef(0);
  // plasă de siguranță când detecția de tăcere nu poate porni (fără WebAudio / limită iOS atinsă)
  const autoStopFallback = useRef<number | null>(null);
  const restartTimer = useRef<number | null>(null);
  const interimRef = useRef('');
  // pauza de gândire reală: de la finalul replicii AI până la apăsarea microfonului (nu include vorbirea)
  const pendingHesitation = useRef<number | undefined>(undefined);
  const turnsRef = useRef<Utterance[]>([]);
  const startTime = useRef(0);
  const speakingSec = useRef(0);
  const lastReplyAt = useRef(0);
  const recStartAt = useRef(0);
  const hesitations = useRef<number[]>([]);
  const summaryRef = useRef('');
  const summaryThroughRef = useRef(0);
  const summaryRefreshing = useRef(false);
  const usedRomanian = useRef(false);
  const phaseRef = useRef<string | undefined>(undefined);
  const targetsRef = useRef<string[]>(cfg.targetExpressions ?? []);
  const batchAnalysisDone = useRef(false);
  const grammarMatchesRef = useRef<GrammarMatch[] | undefined>(undefined);

  turnsRef.current = turns;

  function changeBusy(next: ChatBusy) {
    busyRef.current = next;
    setBusy(next);
  }

  function updateInterim(text: string) {
    interimRef.current = text;
    setInterim(text);
  }

  const draftStorageKey = cfg.resumeKey ? `englezaai.voice-draft.${cfg.resumeKey}` : '';

  function readDraft(): VoiceChatDraft | null {
    if (!draftStorageKey) return null;
    try {
      const draft = JSON.parse(localStorage.getItem(draftStorageKey) || 'null') as VoiceChatDraft | null;
      if (!draft?.turns?.length || Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) return null;
      return draft;
    } catch {
      return null;
    }
  }

  function hasSavedDraft(): boolean {
    return Boolean(readDraft());
  }

  function saveDraft() {
    if (!draftStorageKey || turnsRef.current.length === 0) return;
    const draft: VoiceChatDraft = {
      savedAt: Date.now(),
      turns: turnsRef.current,
      startTime: startTime.current,
      speakingSec: speakingSec.current,
      lastReplyAt: lastReplyAt.current,
      hesitations: hesitations.current,
      summary: summaryRef.current,
      summaryThrough: summaryThroughRef.current,
      usedRomanian: usedRomanian.current,
      phase: phaseRef.current,
      targets: targetsRef.current,
      batchAnalysisDone: batchAnalysisDone.current,
      grammarMatches: grammarMatchesRef.current,
    };
    try { localStorage.setItem(draftStorageKey, JSON.stringify(draft)); } catch { /* storage indisponibil */ }
  }

  function clearSavedDraft() {
    if (draftStorageKey) localStorage.removeItem(draftStorageKey);
    setResumedDraft(false);
  }

  useEffect(() => {
    saveDraft();
  }, [turns]);

  // (rutarea TTS + wake lock pentru modul auto sunt în useHandsFree)

  // Redarea blocată de browser (autoplay policy, sesiune audio ocupată) nu mai trece neobservată:
  // altfel conversația continuă „mută" și pare că aplicația s-a blocat.
  useEffect(() => {
    const onBlocked = () => setError('Sunetul e blocat de telefon. Atinge ecranul o dată ca să repornească vocea.');
    window.addEventListener('engleza-audio-blocked', onBlocked);
    return () => window.removeEventListener('engleza-audio-blocked', onBlocked);
  }, []);

  // la demontare: oprim detecția de tăcere, măsurarea vorbirii, microfonul rămas deschis și timerele
  useEffect(() => {
    const s = silence.current;
    const r = recorder.current;
    const vm = voiceMeter.current;
    return () => {
      s.stop();
      vm.stop();
      r.cancel();
      clearAutoStopFallback();
      cancelScheduledListen();
    };
  }, []);

  useEffect(() => {
    if (!draftStorageKey) return;
    const persist = () => saveDraft();
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', persist);
    return () => {
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', persist);
    };
  }, [draftStorageKey]);

  function conversationConfig(): ConversationConfig {
    return {
      type: cfg.type,
      scenarioPersona: cfg.scenarioPersona,
      scenarioTitle: cfg.scenarioTitle,
      profile: cfg.profile,
      difficulty: cfg.difficulty,
      correctionMode: cfg.correctionMode,
      targetExpressions: targetsRef.current,
      grammarFocus: cfg.grammarFocus,
      guided: cfg.guided,
      phaseInstruction: phaseRef.current,
      memoryContext: cfg.memoryContext,
    };
  }

  function systemPromptMessages(): ChatMessage[] {
    const { stable, dynamic } = buildConversationPromptParts(conversationConfig());
    const messages: ChatMessage[] = [{ role: 'system', content: stable }];
    if (dynamic) messages.push({ role: 'system', content: dynamic });
    return messages;
  }

  /**
   * Reîmprospătează rezumatul incremental ÎN FUNDAL — modelul gratuit poate sta zeci de
   * secunde în coadă și nu are voie să întârzie replica profesorului. Până se termină,
   * contextul folosește rezumatul vechi plus TOATE turele neincluse încă în el (fără pierderi).
   */
  function refreshSummaryInBackground(all: Utterance[], summarizeThrough: number) {
    if (summaryRefreshing.current) return;
    summaryRefreshing.current = true;
    const from = summaryThroughRef.current;
    const newlyAged = all.slice(from, summarizeThrough);
    const text = formatRollingSummaryInput(summaryRef.current, newlyAged);
    void chatText([
      { role: 'system', content: buildSummaryPrompt() },
      { role: 'user', content: text },
    ], { temperature: 0.2, tier: 'free', feature: 'conversation_summary', maxTokens: 450 })
      .then((summary) => {
        // Alt refresh nu poate rula în paralel (guard), deci intervalul [from, summarizeThrough) e încă valid.
        summaryRef.current = summary;
        summaryThroughRef.current = summarizeThrough;
        saveDraft();
      })
      .catch(() => { /* păstrăm rezumatul vechi */ })
      .finally(() => { summaryRefreshing.current = false; });
  }

  /** Context compact: prefix stabil cache-uibil + rezumat incremental + ultimele replici. */
  function contextMessages(): ChatMessage[] {
    const all = turnsRef.current;
    let recent = all;
    if (all.length > FULL_CONTEXT_TURNS) {
      const summarizeThrough = Math.max(0, all.length - RECENT_CONTEXT_TURNS);
      const newlyAgedCount = summarizeThrough - summaryThroughRef.current;
      if (!summaryRef.current || newlyAgedCount >= SUMMARY_REFRESH_TURNS) {
        refreshSummaryInBackground(all, summarizeThrough);
      }
      // Între două actualizări păstrăm și turele care au ieșit din fereastra de 8,
      // dar nu au intrat încă în rezumat; astfel nu se pierde nicio informație.
      recent = turnsAfterSummary(all, summaryThroughRef.current);
    }
    const msgs: ChatMessage[] = systemPromptMessages();
    if (summaryRef.current) msgs.push({ role: 'system', content: `Summary of the conversation so far: ${summaryRef.current}` });
    for (const t of recent) msgs.push({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text });
    return msgs;
  }

  function setPhase(instruction: string | undefined) {
    phaseRef.current = instruction;
    saveDraft();
  }
  function setTargets(t: string[]) {
    targetsRef.current = t;
    saveDraft();
  }
  /** Adaugă o expresie-țintă în mers (ex. învățată prin „Nu știu cum să spun"). */
  function addTarget(phrase: string) {
    if (!targetsRef.current.includes(phrase)) {
      targetsRef.current = [...targetsRef.current, phrase];
      saveDraft();
    }
  }

  async function aiTurn(userContent: string, hiddenInstruction = false, isOpening = false): Promise<string> {
    changeBusy('thinking');
    const msgs = contextMessages();
    // Replica trimisă prin sendUserText este deja ultima intrare din context. Instrucțiunile
    // interne de fază nu sunt vizibile în transcript și trebuie adăugate explicit.
    if (hiddenInstruction || shouldAppendUserContent(turnsRef.current, userContent)) {
      msgs.push({ role: 'user', content: userContent });
    }
    const res = await chatJson<ConvoTurnResponse>(msgs, {
      temperature: 0.7,
      feature: `conversation_turn_${cfg.type}`,
      // Plafon cu rezervă: un JSON trunchiat la limită costă un retry întreg, mai scump decât marja.
      maxTokens: 1000,
      // Utilizatorul așteaptă activ replica — un provider agățat trebuie tăiat repede, nu la 150s.
      timeoutMs: 60_000,
      validate: isConvoTurn,
    });
    setHints(res.hints ?? []);
    if ((res.usedTargetExpressions ?? []).length > 0) {
      await bumpActivity('expressionsUsed', res.usedTargetExpressions!.length);
      await addXp(res.usedTargetExpressions!.length * 8);
    }
    setTurns((prev) => [...prev, { role: 'ai', text: res.reply, ts: Date.now() }]);
    if (cfg.speakReplies !== false) {
      changeBusy('speaking');
      await speak(res.reply, cfg.difficulty.ttsRate);
    }
    lastReplyAt.current = Date.now();
    if (busyRef.current === 'speaking') changeBusy('idle');
    // Salutul de deschidere NU pornește microfonul singur: altfel, redeschiderea aplicației pe ruta
    // unei sesiuni (HashRouter reține ruta) ar declanșa înregistrarea fără ca utilizatorul să atingă nimic.
    // Hands-free repornește normal microfonul de la a doua replică, după ce omul a apăsat mic o dată.
    if (!isOpening) {
      // În modul auto lăsăm o clipă după replică: ecoul din boxele mașinii și comutarea Bluetooth
      // înapoi pe canalul de convorbire nu trebuie să intre în înregistrare.
      if (handsFreeRef.current) scheduleListenAgain(500);
      else maybeAutoRecord();
    }
    return res.reply;
  }

  /** Analiza unei singure replici — folosită de Mirror la cerere (analyzeTurnOnDemand). */
  async function analyzeUtterance(text: string): Promise<UtteranceAnalysis | undefined> {
    try {
      const res = await chatJson<AnalysisResponse>([
        { role: 'system', content: buildAnalysisPrompt(cfg.profile, cfg.grammarFocus) },
        { role: 'user', content: `1. ${text}` },
      ], {
        temperature: 0.2,
        tier: 'utility',
        feature: 'turn_analysis',
        routingContext: { level: cfg.profile.currentLevel, focus: cfg.grammarFocus },
        maxTokens: 900,
        validate: (v) => isAnalysisResponse(v) && (v as AnalysisResponse).analyses.length === 1,
      });
      return refineAiAnalysis(text, res.analyses?.[0]);
    } catch (e) {
      console.warn('Analiza a eșuat:', e);
      return undefined;
    }
  }

  async function attachAnalysis(analysis: UtteranceAnalysis | undefined, userTurnTs: number) {
    if (!analysis) return;
    setTurns((prev) => prev.map((t) => (t.ts === userTurnTs && t.role === 'user' ? { ...t, analysis } : t)));
    const map = new Map(analysis.errors.map((e) => [e, { original: analysis.original, corrected: analysis.corrected, natural: analysis.naturalVersion }]));
    await persistErrors(analysis.errors, map);
  }

  /**
   * Mirror la cerere (tap pe bulă): analizează O SINGURĂ replică, doar dacă nu are deja analiză.
   * Turele analizate așa sunt sărite de analyzePending (batch de la final) — nicio replică
   * nu e trimisă la AI de două ori, deci costul rămâne proporțional cu ce chiar te-a interesat.
   */
  async function analyzeTurnOnDemand(ts: number): Promise<Utterance | undefined> {
    const existing = turnsRef.current.find((t) => t.ts === ts && t.role === 'user');
    if (!existing) return undefined;
    if (existing.analysis) return existing;
    const analysis = await analyzeUtterance(existing.text);
    if (!analysis) return undefined;
    await attachAnalysis(analysis, ts);
    return { ...existing, analysis };
  }

  function ltCategory(match: GrammarMatch): MistakeCategory {
    const key = `${match.ruleId} ${match.category}`.toLowerCase();
    if (/article|determiner/.test(key)) return 'article';
    if (/preposition/.test(key)) return 'preposition';
    if (/pronoun/.test(key)) return 'pronoun';
    if (/plural/.test(key)) return 'plural';
    if (/question/.test(key)) return 'question_form';
    if (/word.order/.test(key)) return 'word_order';
    if (/present.perfect/.test(key)) return 'present_perfect';
    if (/past|irregular/.test(key)) return /irregular/.test(key) ? 'irregular_verb' : 'past_simple';
    if (/agreement|third.person|verb/.test(key)) return 'present_simple';
    if (/auxiliary/.test(key)) return 'auxiliary';
    if (/conditional/.test(key)) return 'conditional';
    return 'other';
  }

  function ltExplanation(category: MistakeCategory): string {
    const explanations: Partial<Record<MistakeCategory, string>> = {
      article: 'Verifică articolul potrivit pentru substantiv și context.',
      preposition: 'Prepoziția corectă depinde de expresia folosită.',
      pronoun: 'Pronumele trebuie să corespundă persoanei și rolului din propoziție.',
      plural: 'Forma substantivului trebuie acordată corect la singular sau plural.',
      question_form: 'În întrebări, auxiliarul și ordinea cuvintelor trebuie ajustate.',
      word_order: 'Ordinea cuvintelor în engleză este diferită de cea din română.',
      present_perfect: 'Present Perfect leagă o acțiune trecută de momentul prezent.',
      past_simple: 'Pentru o acțiune încheiată în trecut folosim forma de Past Simple.',
      irregular_verb: 'Verbul are o formă neregulată care trebuie memorată.',
      present_simple: 'La persoana a treia singular, verbul primește de obicei terminația „-s”.',
      auxiliary: 'Auxiliarul trebuie ales și acordat cu subiectul și timpul verbal.',
      conditional: 'Condiționala cere combinația corectă de timpuri verbale.',
    };
    return explanations[category] ?? 'LanguageTool a detectat o structură care trebuie corectată.';
  }

  async function mergeAnalysisResults(
    all: Utterance[],
    toAnalyze: Utterance[],
    freshAnalyses: UtteranceAnalysis[],
    ltMatches: GrammarMatch[]
  ): Promise<Utterance[]> {
    const userTurns = all.filter((t) => t.role === 'user');
    const toAnalyzeTs = new Set(toAnalyze.map((t) => t.ts));
    let freshIndex = 0;
    let cursor = 0;
    const mergedAnalyses = userTurns.map((turn) => {
      const start = cursor;
      const end = start + turn.text.length;
      cursor = end + 1;
      if (turn.analysis) return turn.analysis; // deja analizat la cerere — păstrăm neschimbat, fără re-persistare
      const raw = freshAnalyses[freshIndex++];
      const base = refineAiAnalysis(turn.text, raw);
      const aiNatural = sanitizeCorrectionText(raw?.naturalVersion ?? '');
      const keepAiNatural = isMeaningfulCorrection(turn.text, aiNatural);
      const localMatches = ltMatches.filter((m) => m.offset >= start && m.offset < end && m.replacements[0]);
      for (const match of localMatches) {
        const localOffset = match.offset - start;
        const wrong = turn.text.slice(localOffset, localOffset + match.length);
        const correct = match.replacements[0];
        if (!wrong || !correct || !isMeaningfulCorrection(wrong, correct) || isDisfluencyOnlyCorrection(wrong, correct) || base.errors.some((e) => e.originalFragment.toLowerCase() === wrong.toLowerCase())) continue;
        const applied = replaceFirstCorrection(base.corrected, wrong, correct);
        // Nu salvăm o eroare LanguageTool dacă recomandarea ei nu apare în propoziția verde.
        if (!applied.applied) continue;
        const category = ltCategory(match);
        base.errors.push({ category, originalFragment: wrong, correctFragment: correct, severity: 'medium', explanationRo: ltExplanation(category) });
        base.corrected = sanitizeCorrectionText(applied.text);
        if (!keepAiNatural) base.naturalVersion = base.corrected;
      }
      if (!isMeaningfulCorrection(base.original, base.corrected)) base.errors = [];
      return base;
    });

    let index = 0;
    const enriched = all.map((turn) => turn.role === 'user' ? { ...turn, analysis: mergedAnalyses[index++] } : turn);
    turnsRef.current = enriched;
    setTurns(enriched);
    for (const turn of enriched) {
      if (turn.role !== 'user' || !turn.analysis || !toAnalyzeTs.has(turn.ts)) continue;
      const a = turn.analysis;
      const map = new Map(a.errors.map((e) => [e, { original: a.original, corrected: a.corrected, natural: a.naturalVersion }]));
      await persistErrors(a.errors, map);
    }
    batchAnalysisDone.current = enriched.filter((t) => t.role === 'user').every((t) => Boolean(t.analysis));
    return enriched;
  }

  /**
   * Un singur batch AI + un apel gratuit LanguageTool pentru replicile încă neanalizate.
   * Replicile analizate la cerere sau într-o fază anterioară nu sunt trimise din nou.
   */
  async function analyzePending(): Promise<Utterance[]> {
    const all = turnsRef.current;
    const userTurns = all.filter((t) => t.role === 'user');
    if (userTurns.length === 0) return all;
    const toAnalyze = userTurns.filter((t) => !t.analysis);
    if (toAnalyze.length === 0) {
      batchAnalysisDone.current = true;
      return all;
    }
    const combined = userTurns.map((t) => t.text).join('\n');
    // Modelul ieftin ratează des numărul exact de analize cerut de validare → cădem pe modelul
    // bun în loc să lăsăm pasul de corectare gol (altfel caseta arăta mereu „0 greșeli").
    const runBatch = (tier: 'utility' | 'chat') => chatJson<AnalysisResponse>([
      { role: 'system', content: buildAnalysisPrompt(cfg.profile, cfg.grammarFocus) },
      { role: 'user', content: formatTurnsForAnalysis(toAnalyze) },
    ], {
      temperature: 0.2,
      tier,
      feature: 'batch_analysis',
      routingContext: { level: cfg.profile.currentLevel, focus: cfg.grammarFocus },
      maxTokens: Math.min(6000, 900 + toAnalyze.length * 320),
      validate: (v) => isAnalysisResponse(v) && (v as AnalysisResponse).analyses.length === toAnalyze.length,
    });
    const [aiResult, ltResult] = await Promise.allSettled([
      runBatch('utility').catch((e) => {
        console.warn('Analiza batch (utility) a eșuat, reîncerc pe modelul bun:', e);
        return runBatch('chat');
      }),
      checkWithLanguageTool(combined),
    ]);
    const freshAnalyses = aiResult.status === 'fulfilled' ? aiResult.value.analyses ?? [] : [];
    if (aiResult.status === 'rejected') console.warn('Analiza batch a eșuat:', aiResult.reason);
    const ltMatches = ltResult.status === 'fulfilled' ? ltResult.value : [];
    if (ltResult.status === 'rejected') console.warn('LanguageTool a eșuat:', ltResult.reason);
    grammarMatchesRef.current = ltResult.status === 'fulfilled' ? ltMatches : undefined;
    return mergeAnalysisResults(all, toAnalyze, freshAnalyses, ltMatches);
  }

  /** Un singur apel Sonnet pentru analizele rămase și raportul final complet. */
  async function analyzeAndBuildReport(): Promise<{ turns: Utterance[]; report?: SessionReport }> {
    const all = turnsRef.current;
    const userTurns = all.filter((t) => t.role === 'user');
    if (userTurns.length === 0) return { turns: all };
    const toAnalyze = userTurns.filter((t) => !t.analysis);
    const combined = userTurns.map((t) => t.text).join('\n');
    let learnerIndex = 0;
    const transcript = all.map((turn) => {
      if (turn.role === 'ai') return `Teacher: ${turn.text}`;
      learnerIndex += 1;
      return `Learner ${learnerIndex}${turn.analysis ? ' [ALREADY ANALYZED]' : ''}: ${turn.text}`;
    }).join('\n');

    const [aiResult, ltResult] = await Promise.allSettled([
      chatJson<AnalysisAndReportResponse>([
        { role: 'system', content: buildAnalysisAndReportPrompt(cfg.profile, cfg.grammarFocus) },
        { role: 'user', content: `FULL TRANSCRIPT:\n${transcript}` },
      ], {
        temperature: 0.25,
        feature: 'session_analysis_report',
        maxTokens: Math.min(7000, 1900 + toAnalyze.length * 350),
        validate: (v) => isAnalysisAndReportResponse(v) && (v as AnalysisAndReportResponse).analyses.length === toAnalyze.length,
      }),
      checkWithLanguageTool(combined),
    ]);

    // Eșecul urcă la finish(), care rulează analiza de rezervă și raportul separat în paralel.
    if (aiResult.status === 'rejected') throw aiResult.reason;
    const ltMatches = ltResult.status === 'fulfilled' ? ltResult.value : [];
    if (ltResult.status === 'rejected') console.warn('LanguageTool a eșuat:', ltResult.reason);
    grammarMatchesRef.current = ltResult.status === 'fulfilled' ? ltMatches : undefined;
    const enriched = await mergeAnalysisResults(all, toAnalyze, aiResult.value.analyses ?? [], ltMatches);
    return { turns: enriched, report: aiResult.value.report };
  }

  async function sendUserText(text: string) {
    if (!text.trim()) return;
    if (busyRef.current === 'speaking') {
      stopSpeaking();
      changeBusy('idle');
    }
    setError('');
    if (RO_MARKERS.test(text)) usedRomanian.current = true;
    // vocal: pauza până la pornirea microfonului; scris: până la trimitere
    const hesitationMs = pendingHesitation.current ?? (lastReplyAt.current > 0 ? Date.now() - lastReplyAt.current : undefined);
    pendingHesitation.current = undefined;
    if (hesitationMs != null) hesitations.current.push(hesitationMs);
    const ts = Date.now();
    setTurns((prev) => [...prev, { role: 'user', text: text.trim(), ts, hesitationMs }]);
    await new Promise((r) => setTimeout(r, 0));
    await detectSpontaneousUse(text).then(async (used) => {
      if (used.length > 0) await bumpActivity('expressionsUsed', used.length);
    });
    // pipeline-ul greșelilor (§P1): forma corectă folosită ghidat (era țintă) sau spontan
    await detectMistakeCorrectUse(text, targetsRef.current).catch(() => []);
    try {
      // fără analiză automată per-replică (cost) — Mirror analizează la cerere (analyzeTurnOnDemand),
      // restul se acoperă în batch-ul economic de la finalul sesiunii (analyzePending)
      await aiTurn(text.trim());
    } catch (e: any) {
      setError(String(e?.message ?? e));
      changeBusy('idle');
    }
  }

  async function start(openingInstruction: string) {
    if (!hasOpenRouterKey()) {
      setError('Lipsește cheia OpenRouter — adaug-o în Setări.');
      return;
    }
    const draft = readDraft();
    if (draft) {
      turnsRef.current = draft.turns;
      setTurns(draft.turns);
      // Mutăm începutul înainte cu durata pauzei, ca timpul din fundal să nu intre în statistici.
      startTime.current = draft.startTime ? draft.startTime + Math.max(0, Date.now() - draft.savedAt) : Date.now();
      speakingSec.current = draft.speakingSec || 0;
      lastReplyAt.current = draft.lastReplyAt || 0;
      hesitations.current = draft.hesitations || [];
      summaryRef.current = draft.summary || '';
      summaryThroughRef.current = draft.summaryThrough ?? 0;
      usedRomanian.current = draft.usedRomanian || false;
      phaseRef.current = draft.phase;
      targetsRef.current = draft.targets || [];
      batchAnalysisDone.current = draft.batchAnalysisDone || false;
      grammarMatchesRef.current = draft.grammarMatches;
      setResumedDraft(true);
      changeBusy('idle');
      return;
    }
    autoRecordSuspended.current = false;
    startTime.current = Date.now();
    speakingSec.current = 0;
    hesitations.current = [];
    summaryRef.current = '';
    summaryThroughRef.current = 0;
    batchAnalysisDone.current = false;
    grammarMatchesRef.current = undefined;
    usedRomanian.current = false;
    setTurns([]);
    setResumedDraft(false);
    setError('');
    try {
      await aiTurn(`(${openingInstruction})`, true, true);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      changeBusy('idle');
    }
  }

  // (wake lock-ul este gestionat de useHandsFree)

  function clearAutoStopFallback() {
    if (autoStopFallback.current == null) return;
    window.clearTimeout(autoStopFallback.current);
    autoStopFallback.current = null;
  }

  function cancelScheduledListen() {
    if (restartTimer.current == null) return;
    window.clearTimeout(restartTimer.current);
    restartTimer.current = null;
  }

  /**
   * Hands-free repornește ascultarea NELIMITAT: la volan nu poți apăsa butonul de microfon, deci
   * o tăcere (ești atent la drum) sau o transcriere goală nu au voie să încheie sesiunea. Pauza
   * crește puțin după fiecare tur gol, ca să nu ținem microfonul deschis într-o buclă strânsă.
   */
  function scheduleListenAgain(delayMs: number) {
    if (!handsFreeRef.current || autoRecordSuspended.current) return;
    cancelScheduledListen();
    restartTimer.current = window.setTimeout(() => {
      restartTimer.current = null;
      maybeAutoRecord();
    }, delayMs);
  }

  async function beginRecording() {
    cancelScheduledListen();
    try {
      await recorder.current.start();
      recStartAt.current = Date.now();
      pendingHesitation.current = lastReplyAt.current > 0 ? Date.now() - lastReplyAt.current : undefined;
      if (getSettings().sttProvider === 'webspeech' && getWebSpeech()) live.current.start(updateInterim);
      changeBusy('recording');
      // măsurăm vorbirea reală (nu durata cu microfonul deschis) pentru statistici corecte
      {
        const stream = recorder.current.getStream();
        if (stream) voiceMeter.current.start(stream);
      }
      if (handsFreeRef.current) {
        const stream = recorder.current.getStream();
        const started = stream ? silence.current.start(stream, {
          onAutoStop: (hadSpeech) => {
            clearAutoStopFallback();
            if (busyRef.current !== 'recording') return;
            if (!hadSpeech) {
              // nu s-a vorbit deloc — închidem microfonul și reascultăm peste o clipă (la volan
              // nu există „apasă din nou pe mic")
              live.current.stop();
              voiceMeter.current.stop();
              recorder.current.cancel();
              updateInterim('');
              pendingHesitation.current = undefined;
              changeBusy('idle');
              scheduleListenAgain(1200);
              return;
            }
            void stopAndSend();
          },
        }) : false;
        // Fără detecție de tăcere (WebAudio indisponibil) microfonul ar rămâne deschis la nesfârșit.
        if (!started) {
          clearAutoStopFallback();
          autoStopFallback.current = window.setTimeout(() => {
            autoStopFallback.current = null;
            if (busyRef.current === 'recording') void stopAndSend();
          }, 20_000);
        }
      }
    } catch {
      setError('Nu am acces la microfon. Verifică permisiunile browserului.');
      changeBusy('idle');
    }
  }

  /** Context pentru STT: subiectul și replica profesorului dezambiguizează cuvintele neclare. */
  function transcriptionContext(): string {
    const lastTeacher = [...turnsRef.current].reverse().find((t) => t.role === 'ai')?.text ?? '';
    const targets = targetsRef.current.slice(0, 8).join(', ');
    return [
      cfg.scenarioTitle ? `Conversation scenario: ${cfg.scenarioTitle}.` : '',
      lastTeacher ? `The teacher just said: "${lastTeacher.slice(0, 220)}" — the learner now answers it.` : '',
      targets ? `Vocabulary likely to appear: ${targets}.` : '',
    ].filter(Boolean).join('\n');
  }

  /** Oprește înregistrarea, transcrie și trimite replica (buton mic sau detecția de tăcere). */
  async function stopAndSend() {
    if (busyRef.current !== 'recording') return;
    silence.current.stop();
    clearAutoStopFallback();
    const liveText = live.current.stop();
    changeBusy('transcribing');
    // preferăm timpul efectiv vorbit (VAD); fallback pe durata totală dacă WebAudio nu a măsurat nimic
    const wallSec = (Date.now() - recStartAt.current) / 1000;
    const voicedSec = voiceMeter.current.stop();
    speakingSec.current += voicedSec > 0 ? Math.min(voicedSec, wallSec) : wallSec;
    try {
      const blob = await recorder.current.stop();
      const { text } = await transcribe(blob, liveText || interimRef.current, transcriptionContext());
      updateInterim('');
      if (!text.trim()) {
        setError('Nu am auzit nimic — mai încearcă.');
        changeBusy('idle');
        // hands-free: reluăm ascultarea, cu pauză crescătoare (fără recursivitate: timer, nu await)
        if (handsFreeRef.current) {
          emptyAutoTakes.current += 1;
          scheduleListenAgain(Math.min(4000, 600 + emptyAutoTakes.current * 600));
        }
        return;
      }
      emptyAutoTakes.current = 0;
      await sendUserText(text);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      changeBusy('idle');
      // o transcriere eșuată (rețea proastă pe drum) nu trebuie să încheie modul auto
      if (handsFreeRef.current) scheduleListenAgain(2000);
    }
  }

  /** Hands-free: repornește microfonul singur după ce AI-ul termină de vorbit. */
  function maybeAutoRecord() {
    if (!handsFreeRef.current || autoRecordSuspended.current) return;
    if (busyRef.current !== 'idle') return;
    void beginRecording();
  }

  /** Pornește/oprește modul hands-free (mașină). Persistă între sesiuni. */
  function setHandsFree(on: boolean) {
    setHandsFreeBase(on); // stare + TTS + wake lock (useHandsFree)
    if (on) {
      emptyAutoTakes.current = 0;
      if (busyRef.current === 'idle' && turnsRef.current.length > 0) void beginRecording();
    } else {
      // înregistrarea curentă continuă, dar doar cu oprire manuală
      silence.current.stop();
      clearAutoStopFallback();
      cancelScheduledListen();
    }
  }

  /** Suspendă repornirea automată a microfonului (ex. cât e afișat un popup). */
  function suspendAutoRecord(on: boolean) {
    autoRecordSuspended.current = on;
    if (on) cancelScheduledListen();
  }

  /** Reia ascultarea hands-free după închiderea unui popup. */
  function resumeListening() {
    maybeAutoRecord();
  }

  async function micPress() {
    setError('');
    const currentBusy = busyRef.current;
    if (currentBusy === 'speaking') {
      stopSpeaking();
      changeBusy('idle');
      await beginRecording();
      return;
    }
    if (currentBusy === 'recording') {
      await stopAndSend();
      return;
    }
    if (currentBusy !== 'idle') return;
    await beginRecording();
  }

  function summarizeAnalyzedTurns(turns: Utterance[]): { errors: AnalyzedError[]; levelEstimate?: Cefr } {
    const errors = turns.filter((t) => t.role === 'user').flatMap((t) => t.analysis?.errors ?? []);
    const estimates = turns.filter((t) => t.role === 'user' && t.analysis?.cefrEstimate).map((t) => t.analysis!.cefrEstimate!);
    const levelEstimate = estimates.length > 0 ? (estimates.sort()[Math.floor(estimates.length / 2)] as Cefr) : undefined;
    return { errors, levelEstimate };
  }

  /**
   * Analiza grea + raportul narativ (un apel Sonnet cu tot transcriptul) rulează AICI, în fundal,
   * fără să fie așteptată de `finish()` — utilizatorul vede deja sesiunea salvată (busy: 'idle')
   * și poate naviga oriunde. Continuă să ruleze după demontarea paginii (SPA, fără reload);
   * `setState`-urile din closure devin no-op tăcut pe un hook demontat, dar `saveSession` nu
   * depinde de React și rulează până la capăt.
   */
  async function finishAnalysisInBackground(base: Session, rawTurns: Utterance[], shouldSave: boolean): Promise<void> {
    let enriched = rawTurns;
    let report: SessionReport | undefined;
    try {
      const result = await analyzeAndBuildReport();
      enriched = result.turns;
      report = result.report;
    } catch (e) {
      console.warn('Analiza și raportul final au eșuat:', e);
      // Plasă de siguranță: analiza restantă și raportul separat nu depind una de alta,
      // deci rulează în PARALEL.
      const transcript = rawTurns
        .map((t) => `${t.role === 'user' ? 'Learner' : 'Teacher'}: ${t.text}`)
        .join('\n');
      const [pendingRes, reportRes] = await Promise.allSettled([
        analyzePending(),
        chatJson<SessionReport>([
          ...systemPromptMessages(),
          { role: 'user', content: `Transcript:\n${transcript}\n\n${buildReportPrompt()}` },
        ], { temperature: 0.3, feature: 'session_report_fallback', maxTokens: 2500, validate: isSessionReport }),
      ]);
      if (pendingRes.status === 'fulfilled') enriched = pendingRes.value;
      else console.warn('Analiza de rezervă a eșuat și ea:', pendingRes.reason);
      if (reportRes.status === 'fulfilled') report = reportRes.value;
      else console.warn('Raportul separat a eșuat și el:', reportRes.reason);
    }
    // Filtru determinist: diferențele doar de majuscule/punctuație nu sunt greșeli (transcriptul STT nu le are fiabile).
    if (report) {
      report.mainMistakes = report.mainMistakes.filter(
        (m) => isMeaningfulCorrection(m.said, m.correct) && !hasSpeechFillers(m.correct) && !isDisfluencyOnlyCorrection(m.said, m.correct)
      );
    }
    const { errors, levelEstimate } = summarizeAnalyzedTurns(enriched);
    const finalSession: Session = {
      ...base,
      turns: enriched,
      report,
      reportStatus: report ? 'ready' : 'failed',
      errorCount: errors.length,
      highSeverityCount: errors.filter((e) => e.severity === 'high').length,
      levelEstimate,
    };
    if (shouldSave) {
      try {
        await saveSession(finalSession);
        // bonusul de „+15 XP pentru raport" (parte din processSessionEnd) se acordă separat aici,
        // fără să rerulăm restul (XP pe minute, streak, misiuni) — acela a rulat deja o singură dată în finish()
        if (report) await addXp(15).catch(() => {});
      } catch (e) {
        console.warn('Salvarea raportului final a eșuat:', e);
      }
    }
    emit('engleza-report-ready', finalSession.id);
  }

  /** Încheie sesiunea: salvează imediat (fără să blocheze UI), analiza grea + raportul rulează în fundal (§12, §29). */
  async function finish(opts?: { withReport?: boolean; save?: boolean }): Promise<{ session: Session; report?: SessionReport }> {
    stopSpeaking();
    autoRecordSuspended.current = true; // fără repornire automată în timpul analizei finale
    cancelScheduledListen();
    clearAutoStopFallback();
    releaseWakeLock();
    if (busyRef.current === 'recording') {
      silence.current.stop();
      live.current.stop();
      voiceMeter.current.stop();
      recorder.current.cancel();
    }
    changeBusy('ending');
    const all = turnsRef.current;
    const userTurns = all.filter((t) => t.role === 'user');
    const willAnalyze = opts?.withReport !== false && userTurns.length > 0 && hasOpenRouterKey();

    // Analiza ieftină, fără raport narativ (ex. testul de nivel), rămâne sincronă — e rapidă oricum.
    const turns = willAnalyze ? all : await analyzePending();

    const words = userTurns.flatMap((t) => countWords(t.text));
    const { errors, levelEstimate } = summarizeAnalyzedTurns(turns);
    const session: Session = {
      id: newId(),
      type: cfg.type,
      scenarioId: cfg.scenarioId,
      scenarioTitle: cfg.scenarioTitle,
      startedAt: new Date(startTime.current || Date.now()).toISOString(),
      durationSec: Math.round((Date.now() - (startTime.current || Date.now())) / 1000),
      userSpeakingSec: Math.round(speakingSec.current),
      wordCount: words.length,
      uniqueWords: new Set(words).size,
      avgHesitationMs: hesitations.current.length
        ? Math.round(hesitations.current.reduce((a, b) => a + b, 0) / hesitations.current.length)
        : undefined,
      errorCount: errors.length,
      highSeverityCount: errors.filter((e) => e.severity === 'high').length,
      turns,
      levelEstimate,
      report: undefined,
      reportStatus: willAnalyze ? 'pending' : 'ready',
      ...(grammarMatchesRef.current ? { grammarMatches: grammarMatchesRef.current } : {}),
    };

    const shouldSave = opts?.save !== false && userTurns.length > 0;
    if (shouldSave) {
      // o eroare de salvare nu trebuie să piardă raportul afișat utilizatorului
      try {
        await saveSession(session);
        await processSessionEnd(session);
        if (!usedRomanian.current && userTurns.length >= 4) {
          await updateActivity({ noRomanianConvo: true });
          await addXp(25);
        }
        if (cfg.type === 'nohelp' || cfg.type === 'exam') {
          await updateActivity(cfg.type === 'exam' ? { noHelpConvo: true, testDone: true } : { noHelpConvo: true });
        }
      } catch (e: any) {
        console.warn('Salvarea sesiunii a eșuat:', e);
        setError(`Sesiunea nu s-a putut salva complet: ${String(e?.message ?? e)}`);
      }
    }
    clearSavedDraft();
    changeBusy('idle');

    if (willAnalyze) void finishAnalysisInBackground(session, all, shouldSave);
    return { session, report: undefined };
  }

  return {
    turns,
    busy,
    interim,
    hints,
    error,
    setError,
    micPress,
    sendUserText,
    start,
    finish,
    setPhase,
    setTargets,
    addTarget,
    aiTurn,
    analyzePending,
    analyzeTurnOnDemand,
    hasSavedDraft,
    clearSavedDraft,
    resumedDraft,
    handsFree,
    setHandsFree,
    suspendAutoRecord,
    resumeListening,
  };
}
