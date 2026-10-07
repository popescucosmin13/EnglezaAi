// Schema de date v2 — după §28 din planul actualizat, stocată local în IndexedDB.

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const CEFR_ORDER: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ---------- Categorii de greșeli (§14) ----------
export const MISTAKE_CATEGORIES = [
  'present_simple',
  'past_simple',
  'present_perfect',
  'article',
  'preposition',
  'question_form',
  'auxiliary',
  'pronoun',
  'plural',
  'irregular_verb',
  'conditional',
  'word_order',
  'unnatural_phrasing',
  'pronunciation',
  'vocabulary',
  'other',
] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const CATEGORY_LABELS_RO: Record<MistakeCategory, string> = {
  present_simple: 'Present Simple',
  past_simple: 'Past Simple',
  present_perfect: 'Present Perfect',
  article: 'Articole',
  preposition: 'Prepoziții',
  question_form: 'Întrebări',
  auxiliary: 'Auxiliare',
  pronoun: 'Pronume',
  plural: 'Plural',
  irregular_verb: 'Verbe neregulate',
  conditional: 'Condiționale',
  word_order: 'Ordinea cuvintelor',
  unnatural_phrasing: 'Expresii nenaturale',
  pronunciation: 'Pronunție',
  vocabulary: 'Vocabular',
  other: 'Altele',
};

export type Severity = 'high' | 'medium' | 'low';

// ---------- Stările unei greșeli (§14) ----------
export type MistakeStatus = 'new' | 'learning' | 'improving' | 'almost' | 'mastered' | 'reappeared';
export const STATUS_LABELS_RO: Record<MistakeStatus, string> = {
  new: 'nouă',
  learning: 'în curs de învățare',
  improving: 'în îmbunătățire',
  almost: 'aproape rezolvată',
  mastered: 'stăpânită',
  reappeared: 'reapărută',
};

// ---------- Repetiție spațiată pe scară fixă (§16) ----------
export interface ReviewState {
  step: number; // index în scara [0=azi/aceeași sesiune, 1z, 3z, 7z, 14z, 30z, 60z]
  nextReviewAt: string; // YYYY-MM-DD
  lastReviewedAt?: string;
  correctUses: number; // utilizări corecte (inclusiv spontane, în conversație)
  failures: number;
}

// ---------- Competențe (§4) ----------
export interface CompetencyScores {
  conversation: number; // 0-100
  grammar: number;
  pronunciation: number;
  vocabulary: number;
  listening: number;
}
export interface CompetencyLevels {
  conversation: Cefr;
  grammar: Cefr;
  pronunciation: Cefr;
  vocabulary: Cefr;
  listening: Cefr;
}
export const COMPETENCY_LABELS_RO: Record<keyof CompetencyScores, string> = {
  conversation: 'Conversație',
  grammar: 'Gramatică',
  pronunciation: 'Pronunție',
  vocabulary: 'Vocabular',
  listening: 'Înțelegere',
};

// ---------- Profil (users + learning_profiles din §28) ----------
export type CorrectionMode = 'discreet' | 'immediate' | 'final';
export type DifficultyMode = 'patient' | 'normal' | 'intensive' | 'professional' | 'exam';

export interface Profile {
  onboarded: boolean;
  testDone: boolean;
  email?: string; // completat automat la login; folosit în Admin Center pentru identificare
  // onboarding (§6)
  nativeLanguage: string;
  mainObjective: string;
  perceivedLevel: string;
  dailyGoalMinutes: number;
  temporalObjective: string;
  interests: string[];
  correctionMode: CorrectionMode;
  romanianHelp: 'multa' | 'putina';
  aiSpeed: 'lent' | 'normal' | 'provocare';
  // nivel
  currentLevel: Cefr;
  targetLevel: Cefr;
  competencyLevels: CompetencyLevels;
  scores: CompetencyScores;
  confidence: 'scăzută' | 'medie' | 'ridicată';
  topProblems: string[];
  recommendedPlanRo: string;
  // progres
  startDate: string; // ziua 1 a programului de învățare
  /** Durata curentă a programului; poate fi extinsă în pași de 30 de zile. */
  programDurationDays?: number;
  /** Ultima schimbare automată a nivelului, afișată utilizatorului pe Acasă. */
  lastLevelChange?: { from: Cefr; to: Cefr; changedAt: string };
  streak: number;
  lastActiveDay: string;
  xp: number;
  /** Misiunile săptămânale premiate: săptămâna ISO curentă + ID-urile deja plătite. */
  weeklyAwards?: { weekId: string; ids: string[] };
}

// ---------- Conversație ----------
export interface AnalyzedError {
  category: MistakeCategory;
  originalFragment: string;
  correctFragment: string;
  severity: Severity;
  explanationRo: string;
  disputed?: boolean;
}

// Analiza strict JSON (§31) + English Mirror (§13)
export interface UtteranceAnalysis {
  original: string;
  corrected: string;
  naturalVersion: string;
  professionalVersion?: string;
  errors: AnalyzedError[];
  shouldInterrupt?: boolean;
  cefrEstimate?: Cefr;
}

export interface Utterance {
  role: 'user' | 'ai';
  text: string;
  ts: number;
  hesitationMs?: number;
  analysis?: UtteranceAnalysis;
}

export type SessionType =
  | 'daily'
  | 'free'
  | 'roleplay'
  | 'guided'
  | 'nohelp'
  | 'rapid'
  | 'professional'
  | 'myday'
  | 'exam'
  | 'leveltest'
  | 'lab';

export const SESSION_TYPE_LABELS_RO: Record<SessionType, string> = {
  daily: 'Sesiunea zilnică',
  free: 'Conversație liberă',
  roleplay: 'Joc de rol',
  guided: 'Conversație ghidată',
  nohelp: 'Fără ajutor',
  rapid: 'Conversație rapidă',
  professional: 'Mod profesional',
  myday: 'Explică-mi ziua',
  exam: 'Mod examen',
  leveltest: 'Test de nivel',
  lab: 'Speaking Lab',
};

// ---------- Speaking Lab: metrici de fluență (calculate pe client, fără tokeni) ----------
export interface FluencyMetrics {
  ttfwMs: number; // Time To First Word — mediana pauzei până la primul cuvânt
  mlr: number; // Mean Length of Run — cuvinte pe replică, fără filler-e
  pausesOver1_5s: number; // pauze de gândire > 1.5s
  codeSwitches: number; // cuvinte scăpate în română
  fillerRate: number; // ezitări pe minut de vorbire
  wordsPerMinute: number; // ritm global de vorbire
  utterances: number; // câte replici au intrat în calcul
}

// ---------- Speaking Lab: un cuvânt salvat prin RESCUE (blocaj lexical rezolvat pe loc) ----------
export type RescueTrigger = 'explicit' | 'code_switch';
export interface RescueEvent {
  trigger: RescueTrigger;
  roTerm: string; // ce a spus/scris în română (sau descrierea)
  enWord: string; // cuvântul englezesc primit
  alternatives?: string[];
  sourceSentence?: string; // propoziția în care s-a blocat
  source: 'dictionary' | 'cache' | 'ai'; // de unde a venit răspunsul (telemetrie tokeni)
  ts: number;
}

// ---------- Fraze de pronunție/ascultare (§18) ----------
export interface PronPhrase {
  text: string;
  targets: string[];
}
/** Un set generat în avans, păstrat în depozitul Firestore pentru zilele când generarea eșuează. */
export interface PronPhraseSet {
  id: string;
  phrases: PronPhrase[];
  createdAt: string;
}

// Raportul după conversație (§12)
export interface ReportMistake {
  said: string;
  correct: string;
  natural: string;
  explanationRo: string;
  exerciseSentences: string[]; // 3 propoziții de rostit
}
export interface SessionReport {
  wellDone: string[];
  mainMistakes: ReportMistake[];
  newExpressions: string[];
  generalScore: number; // 0-100
  summaryRo: string;
}

export interface Session {
  id: string;
  type: SessionType;
  scenarioId?: string;
  scenarioTitle?: string;
  startedAt: string;
  durationSec: number;
  userSpeakingSec: number;
  wordCount: number;
  uniqueWords: number;
  avgHesitationMs?: number;
  errorCount: number;
  highSeverityCount: number;
  turns: Utterance[];
  levelEstimate?: Cefr;
  report?: SessionReport;
  grammarMatches?: GrammarMatch[]; // verificare deterministă automată, fără apel AI suplimentar
  /** Speaking Lab: metricile de fluență ale sesiunii, calculate pe client (fără tokeni). */
  fluency?: FluencyMetrics;
  /** Speaking Lab: cuvintele salvate prin RESCUE în timpul sesiunii. */
  rescues?: RescueEvent[];
  /** Starea raportului narativ — absent = sesiune veche, tratată drept 'ready'. */
  reportStatus?: 'pending' | 'ready' | 'failed';
  /** Marcat true când utilizatorul a deschis raportul din Istoric (pentru notificarea „raport nou"). */
  reportSeen?: boolean;
  /** Corectările (forma corectă, normalizată) reformulate cu succes din raport — ca la redeschidere să apară ca rezolvate. */
  resolvedMistakes?: string[];
}

export interface GrammarMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: string[];
  ruleId: string;
  category: string;
}

// ---------- Pipeline-ul stării unei probleme (§P1) ----------
// detectată → explicată → repetată corect → folosită ghidat → context nou → revizuită ulterior → spontan x3
export interface MistakePipeline {
  explained: boolean; // utilizatorul a văzut explicația (review în Practică / corectare)
  repeatedOk: boolean; // a produs forma corectă la un review
  usedGuided: boolean; // a folosit-o în conversație când era expresie-țintă
  usedInNewContext: boolean; // a trecut testul de transfer (aceeași regulă, alt context)
  reviewedLater: boolean; // review reușit într-o zi ulterioară detectării
  spontaneousUses: number; // folosită spontan în conversație, fără să fie țintă (activare completă la 3)
}

export function emptyPipeline(): MistakePipeline {
  return { explained: false, repeatedOk: false, usedGuided: false, usedInNewContext: false, reviewedLater: false, spontaneousUses: 0 };
}

export const PIPELINE_STAGES_RO: { key: keyof MistakePipeline; label: string }[] = [
  { key: 'explained', label: 'explicată' },
  { key: 'repeatedOk', label: 'repetată corect' },
  { key: 'usedGuided', label: 'folosită ghidat' },
  { key: 'usedInNewContext', label: 'context nou' },
  { key: 'reviewedLater', label: 'revizuită ulterior' },
  { key: 'spontaneousUses', label: 'spontan x3' },
];

// ---------- Greșeli (§28 mistakes) ----------
/** Mini-lecția „de ce greșesc aici": regula, interferența cu româna și exemple noi. */
export interface MistakeDeepDive {
  ruleRo: string;
  interferenceRo: string;
  examples: { en: string; ro: string }[];
}

export interface Mistake {
  id: string;
  original: string;
  corrected: string;
  naturalVersion?: string;
  /** Fragmentul exact greșit (ex. "She like") — afișat în locul propoziției întregi; lipsă la datele vechi. */
  originalFragment?: string;
  /** Corectura atomică a fragmentului (ex. "She likes"). */
  correctFragment?: string;
  category: MistakeCategory;
  severity: Severity;
  explanationRo: string;
  /** Traducerea RO a propoziției corecte — sarcina „spune în engleză" la repetare; generată la prima afișare. */
  promptRo?: string;
  /** Mini-lecția per greșeală, generată la cerere și refolosită la fiecare review. */
  deepDive?: MistakeDeepDive;
  /** Testul de transfer (context nou, aceeași regulă) — generat o dată, refolosit până e trecut (§ optimizare tokeni). */
  transferTest?: { situationRo: string; expectedEn: string; keyWords: string[] };
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  /** Datele (ISO) fiecărei apariții — permite trenduri corecte pe săptămâni; plafonat la 100. */
  occurrences?: string[];
  status: MistakeStatus;
  review: ReviewState;
  disputed?: boolean;
  /** Etapele pedagogice parcurse (§P1); lipsă la datele vechi = nimic parcurs încă. */
  pipeline?: MistakePipeline;
}

// ---------- Vocabular (§15, §28) ----------
export interface VocabItem {
  id: string;
  word: string;
  translation: string;
  kind: 'word' | 'expression';
  cefrLevel?: Cefr;
  example: string;
  personalExample?: string;
  synonyms?: string[];
  opposite?: string;
  sourceSessionId?: string;
  // etapele activării (§15): recunoscut → pronunțat → folosit → context nou → spontan
  recognized: boolean;
  pronounced: boolean;
  usedInSentence: boolean;
  usedInNewContext: boolean;
  usedSpontaneously: boolean;
  /** Numărul de utilizări spontane în conversație — activarea completă cere 3 (§15). */
  spontaneousUses?: number;
  passiveScore: number; // 0-100
  activeScore: number; // 0-100
  review: ReviewState;
  createdAt: string;
}

export function vocabStage(v: VocabItem): string {
  const spont = v.spontaneousUses ?? (v.usedSpontaneously ? 1 : 0);
  if (spont >= 3) return 'activ (spontan 3+)';
  if (spont > 0) return `aproape activ (spontan ${spont}/3)`;
  if (v.usedInNewContext) return 'aproape activ';
  if (v.usedInSentence) return 'folosit în propoziție';
  if (v.pronounced) return 'pronunțat';
  if (v.recognized) return 'recunoscut';
  return 'nou';
}

// ---------- Plan zilnic (§28 daily_plans) ----------
export interface Microlesson {
  rule: string;
  explanationRo: string; // explicație detaliată, pe înțelesul unui începător, adaptată la nivel
  patternRo?: string; // tiparul/formula în cuvinte simple (ex. „subiect + have/has + verb la participiu")
  whenToUseRo?: string; // când se folosește vs. când NU, pe scurt
  examples: { en: string; ro: string }[]; // 3
  personalExamples: string[]; // 2, din contextul userului
  targetPhrases: string[]; // 3 expresii
  voiceExercise: string; // propoziția de rostit
}

/** Lecție generată dintr-o propoziție proprie (ex. din „Reia scena") și salvată de utilizator. */
export interface SavedLesson extends Microlesson {
  id: string;
  createdAt: string;
  sourceEn: string; // propoziția din care a fost generată lecția
}

export interface DailyPlan {
  date: string;
  targetMinutes: number;
  grammarFocus: MistakeCategory | string;
  grammarFocusLabel: string;
  vocabularyFocus: string[]; // cuvinte/expresii de reactivat
  pronunciationFocus: string; // sunetul zilei
  conversationScenario: string; // id scenariu recomandat
  conversationScenarioTitle: string;
  reasonRo: string; // de ce e importantă sesiunea (afișat pe Acasă)
  microlesson?: Microlesson;
  completed: boolean;
  /** Situația salvată de utilizator („Salvează situația de la muncă pentru mâine") folosită azi ca scenariu. */
  situationText?: string;
}

// ---------- Situații salvate pentru sesiunea de mâine (§P1) ----------
export interface SavedSituation {
  id: string;
  text: string; // descrierea utilizatorului (română sau engleză)
  createdAt: string;
  used: boolean; // consumată de un plan zilnic
}

// ---------- Memoria de conversație pe termen lung (§P1+) ----------
// Actualizată după fiecare sesiune de modelul gratuit; injectată compact în promptul profesorului
// ca să nu repete aceleași întrebări și să lege conversațiile de zilele anterioare.
export interface ConversationMemory {
  facts: string[]; // fapte stabile despre utilizator (job, interese, proiecte în desfășurare)
  topics: { topic: string; date: string }[]; // subiectele discutate, cronologic
  openThreads: string[]; // fire deschise de urmărit data viitoare („întrebat de interviul de vineri")
  updatedAt: string;
}

export function emptyMemory(): ConversationMemory {
  return { facts: [], topics: [], openThreads: [], updatedAt: '' };
}

// ---------- Testul săptămânal fără indicii (§P1) ----------
export interface WeeklyQuizItem {
  mistakeId: string;
  cueRo: string; // situația în română, fără forma corectă
  expectedEn: string; // forma corectă așteptată
  saidEn: string; // ce a spus utilizatorul
  ok: boolean;
}
export interface WeeklyQuizResult {
  weekId: string;
  date: string;
  items: WeeklyQuizItem[];
  score: number; // 0-100
}

// ---------- Pronunție ----------
export interface WordScore {
  word: string;
  score: number;
}
export interface PhonemeScore {
  phoneme: string;
  score: number;
}
export interface PronunciationResult {
  id: string;
  date: string;
  exercise: 'repeat' | 'shadowing' | 'minimal_pairs' | 'word_stress' | 'rhythm' | 'personalized' | 'listening';
  phrase: string;
  targets: string[];
  score: number;
  fluencyScore?: number;
  prosodyScore?: number;
  wordScores: WordScore[];
  source: 'azure' | 'stt-diff';
}

// ---------- Test de nivel (§7) ----------
export interface LevelTestResult {
  date: string;
  general: Cefr;
  levels: CompetencyLevels;
  fluency: number; // 0-100
  confidence: 'scăzută' | 'medie' | 'ridicată';
  activeVocabEstimate: string;
  topProblems: string[]; // 5
  recommendedPlanRo: string;
}

// ---------- Activitate & gamificare (§24) ----------
export interface DailyActivity {
  date: string;
  speakingSec: number;
  /** Timp activ petrecut în aplicație (secunde) — numărat doar cât ecranul e vizibil și există interacțiune. */
  appActiveSec: number;
  sessionCount: number;
  vocabReviews: number;
  pronPhrases: number;
  shadowPhrases: number;
  lessonDone: boolean;
  expressionsUsed: number;
  sentencesRepeated: number;
  noRomanianConvo: boolean;
  oldMistakeFixed: boolean;
  noHelpConvo: boolean;
  testDone: boolean;
  xp: number;
  /** ID-urile misiunilor zilnice deja premiate cu XP (o singură dată pe zi). */
  missionsAwarded?: string[];
}

export interface WeeklyReport {
  weekId: string;
  markdown: string;
  createdAt: string;
  /** Amprenta datelor-sursă: același raport nu se regenerează dacă statisticile nu s-au schimbat. */
  inputHash?: string;
}
