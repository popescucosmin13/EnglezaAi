// Stratul de date v3 — Firestore, scopat per utilizator (users/{uid}/...).

import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  increment,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db as fs } from '../firebase';
import { getCurrentUid } from '../auth/uid';
import type {
  Profile,
  Session,
  Mistake,
  VocabItem,
  DailyPlan,
  PronunciationResult,
  PronPhraseSet,
  DailyActivity,
  WeeklyReport,
  LevelTestResult,
  Microlesson,
  SavedLesson,
  SavedSituation,
  WeeklyQuizResult,
  ConversationMemory,
} from '../types';
import { isUsableMistake, protectedNamesFromEmail } from '../logic/mistake-quality';
import { storage } from '../storage';
import { emptyMemory } from '../types';
import { todayStr } from '../srs/ladder';

export { todayStr };

const COLLECTIONS = [
  'sessions',
  'mistakes',
  'vocab',
  'plans',
  'pron',
  'activity',
  'reports',
  'tests',
  'lessons',
  'savedLessons',
  'errors',
  'situations',
  'quizzes',
  'meta',
  'pronBank',
  'wordExplain',
  'messageExplain',
  'quizCues',
  'rescueCache',
] as const;
type CollectionName = (typeof COLLECTIONS)[number];

// ---------- Cache în memorie ----------
// Colecțiile citite frecvent (vocab la fiecare replică, mistakes la analiză, sessions la metrici)
// se încarcă o singură dată per deschidere de aplicație; scrierile trec prin cache (write-through).
interface DbCache {
  uid: string;
  profile: Profile | null;
  // promisiuni, ca două apeluri simultane să nu declanșeze două citiri complete
  vocab: Promise<Map<string, VocabItem>> | null; // null = colecția nu a fost încă citită
  mistakes: Promise<Map<string, Mistake>> | null;
  sessions: Promise<Map<string, Session>> | null;
  pron: Promise<Map<string, PronunciationResult>> | null;
  savedLessons: Promise<Map<string, SavedLesson>> | null;
  activity: Map<string, DailyActivity>; // per dată, populat la cerere
}
let cache: DbCache | null = null;

function c(): DbCache {
  const uid = getCurrentUid();
  if (!cache || cache.uid !== uid) {
    cache = { uid, profile: null, vocab: null, mistakes: null, sessions: null, pron: null, savedLessons: null, activity: new Map() };
  }
  return cache;
}

function invalidateCache(): void {
  cache = null;
}

async function loadCollection<T>(name: CollectionName, maxDocs?: number, orderField?: string): Promise<Map<string, T>> {
  // Fără limitare: comportamentul vechi (colecții mici/config). Cu maxDocs, luăm doar cele mai
  // recente documente după câmpul de ordonare — protejează pornirea aplicației pe termen lung.
  const q = maxDocs && orderField
    ? query(col(name), orderBy(orderField, 'desc'), limit(maxDocs))
    : col(name);
  const snap = await getDocs(q);
  const map = new Map<string, T>();
  for (const d of snap.docs) map.set(d.id, d.data() as T);
  return map;
}

function userDoc() {
  return doc(fs, 'users', getCurrentUid());
}
function col(name: CollectionName) {
  return collection(fs, 'users', getCurrentUid(), name);
}
function docIn(name: CollectionName, id: string) {
  return doc(fs, 'users', getCurrentUid(), name, id);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- Profile ----------
export function defaultProfile(): Profile {
  return {
    onboarded: false,
    testDone: false,
    nativeLanguage: 'română',
    mainObjective: 'engleză pentru serviciu',
    perceivedLevel: 'pot conversa, dar fac multe greșeli',
    dailyGoalMinutes: 20,
    temporalObjective: 'progres general',
    interests: [],
    correctionMode: 'immediate',
    romanianHelp: 'multa',
    aiSpeed: 'normal',
    currentLevel: 'A2',
    targetLevel: 'B1',
    competencyLevels: { conversation: 'A2', grammar: 'A2', pronunciation: 'A2', vocabulary: 'A2', listening: 'A2' },
    scores: { conversation: 40, grammar: 40, pronunciation: 40, vocabulary: 40, listening: 40 },
    confidence: 'scăzută',
    topProblems: [],
    recommendedPlanRo: '',
    startDate: todayStr(),
    programDurationDays: 90,
    streak: 0,
    lastActiveDay: '',
    xp: 0,
  };
}

/** Un snapshot dovedește un profil real doar dacă are câmpul `onboarded` — documentul poate
 *  exista și doar cu `{email}`, scris de AuthProvider la login, înainte de primul onboarding. */
function isRealProfileSnap(snap: { exists(): boolean; data(): unknown }): boolean {
  return snap.exists() && (snap.data() as Partial<Profile>).onboarded !== undefined;
}

export async function getProfile(options: { forceServer?: boolean } = {}): Promise<Profile> {
  const cached = c().profile;
  if (cached && !options.forceServer) return cached;
  // După autentificare cerem explicit profilul autoritativ. În caz contrar, la reconectarea
  // aceluiași UID, cache-ul sesiunii precedente poate păstra `onboarded: false` și ar retrimite
  // eronat un utilizator existent în onboarding.
  let snap = options.forceServer ? await getDocFromServer(userDoc()) : await getDoc(userDoc());
  // O citire din CACHE fără profil real nu e dovadă de cont nou: cache-ul poate fi proaspăt
  // (storage șters de iOS) și „populat" doar de scrierea de email a AuthProvider-ului.
  // Cerem confirmarea serverului înainte să tratăm utilizatorul ca nou — altfel un utilizator
  // vechi ar fi trimis prin onboarding și profilul (XP, nivel, streak) i-ar fi suprascris.
  if (!isRealProfileSnap(snap) && snap.metadata.fromCache) {
    snap = await getDocFromServer(userDoc()); // aruncă dacă serverul nu e accesibil; App afișează „Reîncearcă"
  }
  if (snap.exists()) {
    const p = { ...defaultProfile(), ...(snap.data() as Profile) };
    c().profile = p;
    return p;
  }
  // Cont confirmat nou (răspuns de la server): profilul implicit se ține DOAR în memorie.
  // Nu îl scriem aici — scrierea distructivă ar putea suprascrie un profil real la o citire greșită;
  // persistarea se face la saveProfile (finalul onboarding-ului).
  const fresh = defaultProfile();
  c().profile = fresh;
  return fresh;
}
export async function saveProfile(p: Profile): Promise<void> {
  c().profile = p;
  // Platform metadata is written by the current client at authentication.
  // A cached profile must not overwrite a more recent platform observation.
  const { lastPlatform: _platform, lastSeenAt: _seen, appVersion: _version, appBuild: _build, osVersion: _os, ...profile } = p as Profile & { lastPlatform?: unknown; lastSeenAt?: unknown; appVersion?: unknown; appBuild?: unknown; osVersion?: unknown };
  await setDoc(userDoc(), profile, { merge: true });
}

export async function touchStreak(): Promise<Profile> {
  const p = await getProfile();
  const today = todayStr();
  if (p.lastActiveDay === today) return p;
  const yesterday = todayStr(new Date(Date.now() - 86400000));
  p.streak = p.lastActiveDay === yesterday ? p.streak + 1 : 1;
  p.lastActiveDay = today;
  await saveProfile(p);
  return p;
}

export async function addXp(amount: number): Promise<void> {
  // increment() în loc de citire-modificare-scriere: 0 citiri, fără curse între dispozitive
  const p = await getProfile();
  p.xp += amount;
  c().profile = p;
  await setDoc(userDoc(), { xp: increment(amount) }, { merge: true });
  const date = todayStr();
  const a = await getActivity(date);
  a.xp += amount;
  c().activity.set(date, a);
  await setDoc(docIn('activity', date), { date, xp: increment(amount) }, { merge: true });
}

// ---------- Sessions ----------
// Sesiunile cresc nelimitat (una pe zi, minimum). Aplicația lucrează aproape exclusiv cu
// istoricul recent (metrici pe fereastră rulantă, „reia scena", săptămâna curentă), deci
// pornirea încarcă doar ultimele N — istoricul complet rămâne disponibil prin getFullSessionHistory.
const RECENT_SESSIONS_LIMIT = 150;

export async function saveSession(s: Session): Promise<void> {
  (await sessionsCache()).set(s.id, s);
  await setDoc(docIn('sessions', s.id), s);
}
function sessionsCache(): Promise<Map<string, Session>> {
  const cc = c();
  cc.sessions ??= loadCollection<Session>('sessions', RECENT_SESSIONS_LIMIT, 'startedAt');
  return cc.sessions;
}
export async function getSessions(): Promise<Session[]> {
  const all = [...(await sessionsCache()).values()];
  return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
/** Istoricul complet (export, analize pe termen lung) — separat de cache-ul de pornire. */
export async function getFullSessionHistory(): Promise<Session[]> {
  const snap = await getDocs(col('sessions'));
  const all = snap.docs.map((d) => d.data() as Session);
  return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// ---------- Mistakes ----------
function mistakesCache(): Promise<Map<string, Mistake>> {
  const cc = c();
  cc.mistakes ??= loadCollection<Mistake>('mistakes');
  return cc.mistakes;
}
export async function saveMistake(m: Mistake): Promise<void> {
  (await mistakesCache()).set(m.id, m);
  await setDoc(docIn('mistakes', m.id), m);
}
export async function getMistakes(): Promise<Mistake[]> {
  const protectedNames = protectedNamesFromEmail((await getProfile()).email);
  return [...(await mistakesCache()).values()].filter((m) => isUsableMistake(m, protectedNames));
}
export async function deleteMistake(id: string): Promise<void> {
  (await mistakesCache()).delete(id);
  await deleteDoc(docIn('mistakes', id));
}

// ---------- Vocabulary ----------
function vocabCache(): Promise<Map<string, VocabItem>> {
  const cc = c();
  cc.vocab ??= loadCollection<VocabItem>('vocab');
  return cc.vocab;
}
export async function saveVocab(v: VocabItem): Promise<void> {
  (await vocabCache()).set(v.id, v);
  await setDoc(docIn('vocab', v.id), v);
}
export async function getVocab(): Promise<VocabItem[]> {
  return [...(await vocabCache()).values()];
}
export async function deleteVocab(id: string): Promise<void> {
  (await vocabCache()).delete(id);
  await deleteDoc(docIn('vocab', id));
}

// ---------- Daily plans ----------
export async function savePlan(p: DailyPlan): Promise<void> {
  await setDoc(docIn('plans', p.date), p);
}
export async function getPlan(date: string): Promise<DailyPlan | undefined> {
  const snap = await getDoc(docIn('plans', date));
  return snap.exists() ? (snap.data() as DailyPlan) : undefined;
}
/** Ultimele N planuri (indiferent de dată curentă) — folosit ca să nu se repete scenariul recent. */
export async function getRecentPlans(days: number): Promise<DailyPlan[]> {
  const snap = await getDocs(col('plans'));
  return snap.docs
    .map((d) => d.data() as DailyPlan)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);
}

// ---------- Depozit de fraze pronunție/ascultare (§18) ----------
// Seturi generate în avans pe tier-ul gratuit; consumate în zilele când generarea live eșuează.
export async function getPronBank(): Promise<PronPhraseSet[]> {
  const snap = await getDocs(col('pronBank'));
  return snap.docs.map((d) => d.data() as PronPhraseSet);
}
export async function savePronSet(s: PronPhraseSet): Promise<void> {
  await setDoc(docIn('pronBank', s.id), s);
}
export async function deletePronSet(id: string): Promise<void> {
  await deleteDoc(docIn('pronBank', id));
}

// ---------- Chei de cache determinist (§ optimizare tokeni) ----------
// Hash pe 64 de biți (două treceri FNV-1a de 32 biți) — coliziuni neglijabile la volumul unei aplicații single-user.
function fnv1a(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function cacheKey(...parts: string[]): string {
  const s = parts.map((p) => p.toLowerCase().trim()).join('');
  return fnv1a(s, 0x811c9dc5).toString(36) + fnv1a(s, 0x1000193).toString(36);
}

// ---------- Cache explicații de cuvinte (potrivire exactă cuvânt+propoziție) ----------
export async function getCachedWordExplanation(word: string, sentence: string): Promise<Record<string, unknown> | undefined> {
  const snap = await getDoc(docIn('wordExplain', cacheKey(word, sentence)));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
}
export async function cacheWordExplanation(word: string, sentence: string, explanation: Record<string, unknown>): Promise<void> {
  await setDoc(docIn('wordExplain', cacheKey(word, sentence)), explanation);
}

// ---------- Cache explicații/traduceri pentru aceeași bulă și același context ----------
export async function getCachedMessageExplanation(parts: string[]): Promise<Record<string, unknown> | undefined> {
  const snap = await getDoc(docIn('messageExplain', cacheKey(...parts)));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
}
export async function cacheMessageExplanation(parts: string[], explanation: Record<string, unknown>): Promise<void> {
  await setDoc(docIn('messageExplain', cacheKey(...parts)), explanation);
}

// ---------- Cache indicii test săptămânal (reutilizate la „Refă testul săptămânii") ----------
export async function getCachedQuizCues(weekId: string, mistakeIds: string[]): Promise<string[] | undefined> {
  const snap = await getDoc(docIn('quizCues', cacheKey(weekId, [...mistakeIds].sort().join(','))));
  return snap.exists() ? (snap.data() as { cues: string[] }).cues : undefined;
}
export async function cacheQuizCues(weekId: string, mistakeIds: string[], cues: string[]): Promise<void> {
  await setDoc(docIn('quizCues', cacheKey(weekId, [...mistakeIds].sort().join(','))), { cues });
}

// ---------- Cache RESCUE (Speaking Lab): cuvântul englezesc pentru un termen românesc ----------
// Cheia = termenul românesc normalizat; contextul nu intră în cheie, ca reutilizarea să fie maximă
// (același „aspirator" nu mai cheltuie niciodată un al doilea apel AI, indiferent de propoziție).
export interface CachedRescue {
  en: string;
  alternatives?: string[];
}
export async function getCachedRescue(normalizedRo: string): Promise<CachedRescue | undefined> {
  const snap = await getDoc(docIn('rescueCache', cacheKey(normalizedRo)));
  return snap.exists() ? (snap.data() as CachedRescue) : undefined;
}
export async function cacheRescue(normalizedRo: string, value: CachedRescue): Promise<void> {
  await setDoc(docIn('rescueCache', cacheKey(normalizedRo)), value);
}

// ---------- Microlecții cache (curriculum) ----------
export async function getCachedLesson(key: string): Promise<Microlesson | undefined> {
  const snap = await getDoc(docIn('lessons', key));
  return snap.exists() ? (snap.data() as Microlesson) : undefined;
}
export async function cacheLesson(key: string, l: Microlesson): Promise<void> {
  await setDoc(docIn('lessons', key), l);
}

// ---------- Lecții salvate de utilizator (ex. din „Reia scena") ----------
function savedLessonsCache(): Promise<Map<string, SavedLesson>> {
  const cc = c();
  cc.savedLessons ??= loadCollection<SavedLesson>('savedLessons');
  return cc.savedLessons;
}
export async function getSavedLessons(): Promise<SavedLesson[]> {
  return [...(await savedLessonsCache()).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveSavedLesson(l: SavedLesson): Promise<void> {
  (await savedLessonsCache()).set(l.id, l);
  await setDoc(docIn('savedLessons', l.id), l);
}
export async function deleteSavedLesson(id: string): Promise<void> {
  (await savedLessonsCache()).delete(id);
  await deleteDoc(docIn('savedLessons', id));
}

// ---------- Pronunciation ----------
// Rezultatele de pronunție se adună zilnic; graficele/scorurile folosesc fereastra recentă,
// așa că limităm încărcarea inițială (ordonare pe `date`, YYYY-MM-DD — ordonabil lexicografic).
const RECENT_PRON_LIMIT = 400;

function pronCache(): Promise<Map<string, PronunciationResult>> {
  const cc = c();
  cc.pron ??= loadCollection<PronunciationResult>('pron', RECENT_PRON_LIMIT, 'date');
  return cc.pron;
}
export async function savePronResult(r: PronunciationResult): Promise<void> {
  (await pronCache()).set(r.id, r);
  await setDoc(docIn('pron', r.id), r);
}
export async function getPronResults(): Promise<PronunciationResult[]> {
  const all = [...(await pronCache()).values()];
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Activity ----------
export function emptyActivity(date: string): DailyActivity {
  return {
    date,
    speakingSec: 0,
    appActiveSec: 0,
    sessionCount: 0,
    vocabReviews: 0,
    pronPhrases: 0,
    shadowPhrases: 0,
    lessonDone: false,
    expressionsUsed: 0,
    sentencesRepeated: 0,
    noRomanianConvo: false,
    oldMistakeFixed: false,
    noHelpConvo: false,
    testDone: false,
    xp: 0,
  };
}
export async function getActivity(date: string): Promise<DailyActivity> {
  const cached = c().activity.get(date);
  if (cached) return cached;
  const snap = await getDoc(docIn('activity', date));
  const a = snap.exists() ? { ...emptyActivity(date), ...(snap.data() as DailyActivity) } : emptyActivity(date);
  c().activity.set(date, a);
  return a;
}
export async function updateActivity(patch: Partial<DailyActivity>): Promise<DailyActivity> {
  const date = todayStr();
  const a = await getActivity(date);
  const merged = { ...a, ...patch };
  c().activity.set(date, merged);
  await setDoc(docIn('activity', date), merged);
  await touchStreak();
  return merged;
}
export async function bumpActivity(field: keyof DailyActivity, amount: number): Promise<void> {
  const date = todayStr();
  const a = await getActivity(date);
  (a[field] as number) = ((a[field] as number) ?? 0) + amount;
  c().activity.set(date, a);
  // increment() pe câmp: o singură scriere, fără citire prealabilă din Firestore
  await setDoc(docIn('activity', date), { date, [field]: increment(amount) }, { merge: true });
  await touchStreak();
}
export async function getAllActivity(): Promise<DailyActivity[]> {
  // Un document pe zi — ~365/an. Limităm la ultimele 400 de zile: acoperă orice grafic anual
  // fără să descarce istoricul complet la fiecare deschidere a paginii Progres.
  const snap = await getDocs(query(col('activity'), orderBy('date', 'desc'), limit(400)));
  // normalizăm cu emptyActivity: înregistrările vechi n-au câmpurile noi (ex. appActiveSec) → 0
  const all = snap.docs.map((d) => {
    const data = d.data() as DailyActivity;
    return { ...emptyActivity(data.date ?? d.id), ...data };
  });
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Weekly reports ----------
export async function saveReport(r: WeeklyReport): Promise<void> {
  await setDoc(docIn('reports', r.weekId), r);
}
export async function getReports(): Promise<WeeklyReport[]> {
  // Un raport pe săptămână — crește lent, dar pe termen lung limităm la ultimele 2 ani.
  const snap = await getDocs(query(col('reports'), orderBy('weekId', 'desc'), limit(104)));
  const all = snap.docs.map((d) => d.data() as WeeklyReport);
  return all.sort((a, b) => b.weekId.localeCompare(a.weekId));
}

// ---------- Memoria de conversație (§P1+) ----------
export async function getMemory(): Promise<ConversationMemory> {
  const snap = await getDoc(docIn('meta', 'memory'));
  return snap.exists() ? { ...emptyMemory(), ...(snap.data() as ConversationMemory) } : emptyMemory();
}
export async function saveMemory(m: ConversationMemory): Promise<void> {
  await setDoc(docIn('meta', 'memory'), m);
}

// ---------- Documente de stare generice (colecția `meta`) ----------
// Pentru stări mici, care nu merită o colecție proprie și se citesc/scriu dintr-o bucată
// (ex. progresul la cursul de gramatică). Rămân tipizate la apelant, ca stratul de date să
// nu depindă de module de UI — altfel aplicația nativă nu ar mai compila.
export async function getMetaDoc<T>(id: string): Promise<T | undefined> {
  const snap = await getDoc(docIn('meta', id));
  return snap.exists() ? (snap.data() as T) : undefined;
}
export async function saveMetaDoc(id: string, value: Record<string, unknown>): Promise<void> {
  await setDoc(docIn('meta', id), value);
}

// ---------- Situații salvate pentru mâine (§P1) ----------
export async function saveSituation(s: SavedSituation): Promise<void> {
  await setDoc(docIn('situations', s.id), s);
}
export async function getSituations(): Promise<SavedSituation[]> {
  const snap = await getDocs(col('situations'));
  const all = snap.docs.map((d) => d.data() as SavedSituation);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- Testul săptămânal fără indicii (§P1) ----------
export async function saveQuizResult(q: WeeklyQuizResult): Promise<void> {
  await setDoc(docIn('quizzes', `${q.weekId}-${q.date}`), q);
}
export async function getQuizResults(): Promise<WeeklyQuizResult[]> {
  const snap = await getDocs(col('quizzes'));
  const all = snap.docs.map((d) => d.data() as WeeklyQuizResult);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Level tests ----------
export async function saveTestResult(t: LevelTestResult): Promise<void> {
  await setDoc(docIn('tests', t.date), t);
}
export async function getTestResults(): Promise<LevelTestResult[]> {
  const snap = await getDocs(col('tests'));
  const all = snap.docs.map((d) => d.data() as LevelTestResult);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Export / import / ștergere (§34) ----------

// Firestore limitează un writeBatch la 500 de operații — împărțim în tranșe sigure.
const BATCH_LIMIT = 450;

interface BatchOp {
  type: 'set' | 'delete';
  ref: ReturnType<typeof doc>;
  data?: Record<string, unknown>;
}

async function commitChunked(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(fs);
    for (const op of ops.slice(i, i + BATCH_LIMIT)) {
      if (op.type === 'set') batch.set(op.ref, op.data!);
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}
export async function exportAll(): Promise<string> {
  const dump: Record<string, unknown> = {};
  const profileSnap = await getDoc(userDoc());
  dump.profile = profileSnap.exists() ? { profile: profileSnap.data() } : {};
  for (const name of COLLECTIONS) {
    const snap = await getDocs(col(name));
    dump[name] = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  }
  return JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), data: dump }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json);
  const data = parsed.data as Record<string, Record<string, unknown>>;
  const ops: BatchOp[] = [];
  if (data.profile?.profile) ops.push({ type: 'set', ref: userDoc(), data: data.profile.profile as Record<string, unknown> });
  for (const name of COLLECTIONS) {
    if (!data[name]) continue;
    for (const [id, value] of Object.entries(data[name])) {
      ops.push({ type: 'set', ref: docIn(name, id), data: value as Record<string, unknown> });
    }
  }
  await commitChunked(ops);
  invalidateCache();
}

export async function wipeAll(): Promise<void> {
  const ops: BatchOp[] = [{ type: 'delete', ref: userDoc() }];
  for (const name of COLLECTIONS) {
    const snap = await getDocs(col(name));
    for (const d of snap.docs) ops.push({ type: 'delete', ref: d.ref });
  }
  await commitChunked(ops);
  invalidateCache();
  storage.removeItem('en2-cache');
}
