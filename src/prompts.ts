// Prompturile v2 — structura din §30 (conversație), §31 (analiză JSON), §12 (raport), §7 (test).

import type { Profile, SessionType, CorrectionMode, Mistake, Utterance, ConversationMemory } from './types';
import { MISTAKE_CATEGORIES } from './types';
import type { DifficultyDef } from './content';

const CATEGORIES = MISTAKE_CATEGORIES.join(', ');

export interface ConversationConfig {
  type: SessionType;
  scenarioPersona?: string; // persona/topic pentru roleplay/lumi/IT
  scenarioTitle?: string;
  profile: Profile;
  difficulty: DifficultyDef;
  correctionMode: CorrectionMode;
  targetExpressions: string[]; // expresii de reintrodus (§3, §30)
  grammarFocus?: string; // regula zilei
  guided?: boolean; // conversație ghidată (§10.3)
  phaseInstruction?: string; // pentru sesiunea zilnică pe faze (§9) / etapele testului
  memoryContext?: string; // memoria pe termen lung, compactă (§P1+): fapte, subiecte recente, fire deschise
}

export interface ConversationPromptParts {
  /** Reguli stabile pe durata sesiunii; separate pentru a păstra prompt cache-ul între faze. */
  stable: string;
  /** Instrucțiuni care se pot schimba în timpul sesiunii: faza și expresiile-țintă. */
  dynamic: string;
}

/** Promptul conversațional (§30), separat în prefix stabil și stare dinamică. */
export function buildConversationPromptParts(cfg: ConversationConfig): ConversationPromptParts {
  const p = cfg.profile;
  const correctionRules: Record<CorrectionMode, string> = {
    discreet:
      'DISCREET CORRECTION: never point out mistakes explicitly. Instead, naturally reformulate what the learner said correctly inside your reply, then continue the conversation. Example: learner says "Yesterday I go to work" → you say "Oh, you went to work yesterday? Was it a busy day?"',
    immediate:
      'IMMEDIATE CORRECTION: when the learner makes an important mistake (max 1 per turn, only if severity is high), reply ONLY with: "Small correction: \'<corrected sentence>\'. Please repeat it." — do not continue the topic in that turn. On the learner\'s NEXT turn, verify the repetition: if they repeated the corrected form, confirm briefly ("Perfect!") and continue the conversation; if they did not, give the correct form once more and ask again (maximum 2 attempts, then move on without insisting). For minor mistakes, ignore them in speech.',
    final:
      'NO CORRECTIONS during conversation: never mention mistakes or grammar. Keep the conversation flowing naturally. All feedback happens after the session.',
  };
  const guided = cfg.guided
    ? '\nGUIDED MODE: after your reply, provide 2-3 short answer ideas / useful expressions the learner could use, in the "hints" field (English, with Romanian translation in parentheses).'
    : '';
  const rapid = cfg.type === 'rapid' ? '\nRAPID MODE: very short replies (1 sentence), quick unexpected questions, keep pressure on response speed.' : '';
  const target =
    cfg.targetExpressions.length > 0
      ? `Target expressions — steer the conversation so the learner NEEDS to use them; ask questions whose natural answer requires them:\n${cfg.targetExpressions.map((e) => `- ${e}`).join('\n')}\nWhen the learner uses one correctly, list it in "usedTargetExpressions".`
      : '';
  const focus = cfg.grammarFocus ? `\nGrammar focus of the day: ${cfg.grammarFocus}. Create situations that force this structure.` : '';
  const scenario = cfg.scenarioPersona
    ? `\nScenario / role — the WHOLE session takes place inside this scenario. Your very first reply must already be in character, and you stay in the scenario until the learner clearly asks to stop. Do not drift into small talk about the learner's day:\n${cfg.scenarioPersona}`
    : cfg.type === 'daily'
      ? '\nStructured daily session: the CURRENT PHASE INSTRUCTIONS (separate system message) define the current activity and topic — follow them exactly. When they define a scenario/role, switch fully into that role and stay in it for the whole phase.'
      : '\nFree conversation: follow the learner\'s topics, ask short questions, introduce useful expressions.';
  const phase = cfg.phaseInstruction ? `CURRENT PHASE INSTRUCTIONS:\n${cfg.phaseInstruction}` : '';
  const scenarioMode = Boolean(cfg.scenarioPersona) || cfg.type === 'daily';
  const memory = cfg.memoryContext
    ? scenarioMode
      ? `\nLONG-TERM MEMORY (background about the learner, from previous sessions):\n${cfg.memoryContext}\nUse it ONLY to make the scenario concrete and personal (their real job, projects, people, situations). Never abandon the active scenario/phase to follow these threads, and do not open with questions about the learner's day unless the current phase asks for that.`
      : `\nLONG-TERM MEMORY (from previous sessions):\n${cfg.memoryContext}\nUse it: do NOT re-ask what you already know, do NOT open with the same questions as previous days. Prefer following up an open thread or picking a fresh topic connected to the learner's life.`
    : '';
  const roHelp = p.romanianHelp === 'multa' ? 'You may give a short Romanian explanation when the learner is clearly stuck or asks.' : 'Use Romanian only if explicitly asked.';

  const stable = `Role: You are a conversational English teacher inside a language app.

Learner: native language Romanian, level ${p.currentLevel} (target ${p.targetLevel}). Main objective: ${p.mainObjective}. Interests: ${p.interests.join(', ') || 'general'}.
${scenario}${memory}

Rules:
- Speak in short sentences appropriate for level ${p.currentLevel}-${p.targetLevel}.
- Ask exactly ONE question per turn. Never monopolize the conversation — the learner must speak more than you.
- Encourage the learner to speak; if they answer in Romanian, gently push them back to English.
- If the learner asks what a word or expression means (in Romanian or English), PAUSE the roleplay and teach it clearly: give the Romanian meaning in this exact context, a very simple English explanation, pronunciation help, and one short example. Do not count this meta-question as a language mistake. Then offer to continue the conversation.
- Prefer useful, level-appropriate vocabulary. When you introduce a word above the learner's current level, make its meaning easy to infer from the sentence.
- ${roHelp}
- ${cfg.difficulty.promptRules}
- ${correctionRules[cfg.correctionMode]}
- Do not invent evaluations. Do not treat obvious speech-to-text artifacts as learner mistakes.${focus}${rapid}${guided}

OUTPUT — STRICT JSON only, no markdown fences:
{
  "reply": "your spoken reply (plain natural speech)",
  "hints": ["..."],
  "usedTargetExpressions": ["..."]
}
hints: only in guided mode, otherwise []. usedTargetExpressions: target expressions the learner just used correctly, otherwise [].`;
  return { stable, dynamic: [phase, target].filter(Boolean).join('\n\n') };
}

/** Compatibilitate pentru fluxurile care au nevoie de promptul complet într-un singur text. */
export function buildConversationPrompt(cfg: ConversationConfig): string {
  const { stable, dynamic } = buildConversationPromptParts(cfg);
  return dynamic ? `${stable}\n\n${dynamic}` : stable;
}

/** Explicație contextuală la apăsarea unui cuvânt din conversație. */
export function buildWordExplanationPrompt(word: string, sentence: string, profile: Profile): string {
  return `You are an exceptionally clear English tutor for a Romanian learner at level ${profile.currentLevel}.
The learner clicked the word "${word}" in this sentence:
"${sentence}"

Explain the word as it is used IN THIS EXACT CONTEXT. Be accurate, practical, warm, and concise. If it is an inflected form, identify the base form. Distinguish its contextual meaning from other common meanings. Romanian explanations must use natural Romanian with diacritics.

OUTPUT STRICT JSON only:
{
  "word": "the clicked form",
  "baseForm": "dictionary form",
  "pronunciation": "simple pronunciation hint plus IPA if confident",
  "partOfSpeechRo": "partea de vorbire în română",
  "translationRo": "traducerea scurtă potrivită contextului",
  "meaningInContextRo": "explicație foarte clară în română, 2-4 propoziții",
  "simpleEnglish": "definition in very simple English at level ${profile.currentLevel}",
  "whyThisFormRo": "why this form/tense/preposition is used here; empty if not relevant",
  "otherMeaningsRo": ["maximum 3 other frequent meanings, only when useful"],
  "examples": [
    { "en": "short everyday example", "ro": "Romanian translation" },
    { "en": "example relevant to ${profile.mainObjective}", "ro": "Romanian translation" }
  ],
  "collocations": ["maximum 4 common combinations"],
  "memoryTipRo": "a short memory aid, including a Romanian comparison when useful",
  "cefrLevel": "A1|A2|B1|B2|C1|C2"
}`;
}

export function buildMessageHelpPrompt(input: {
  mode: 'explain' | 'translate';
  role: 'user' | 'ai';
  text: string;
  nextTeacherText?: string;
  context: string;
  profile: Profile;
}): string {
  const { mode, role, text, nextTeacherText, context, profile } = input;
  return `You are a precise, patient English tutor for a Romanian learner at CEFR ${profile.currentLevel}.

Task: ${mode === 'translate' ? 'translate and clarify the selected message' : role === 'user' ? 'explain what the learner got wrong, if anything' : 'explain the teacher message, its vocabulary and grammar'}.
Selected ${role === 'user' ? 'learner' : 'teacher'} message: "${text}"
${nextTeacherText ? `Teacher reply immediately after it: "${nextTeacherText}"` : ''}
Recent context:
${context}

Rules:
- Write all explanations and meanings in natural Romanian with diacritics.
- Preserve the exact meaning and tense in the Romanian translation.
- In translate mode, focus only on meaning: return mistakes: [] and do not criticize the message.
- For learner text, identify only real errors. Ignore punctuation, capitalization, casual speech and probable speech-to-text artifacts.
- If correct, return mistakes: []. Never invent a correction just to fill the array.
- corrected = minimal grammatical correction; natural = a common native phrasing.
- Keep it concise but sufficiently clear for independent learning.

OUTPUT STRICT JSON only:
{
  "translationRo": "exact natural Romanian translation",
  "meaningRo": "short explanation of what the message means or why the correction is needed",
  "corrected": "correct English version; same as input when already correct",
  "natural": "more natural English version; same as corrected when no meaningful improvement",
  "mistakes": [
    { "wrong": "exact wrong fragment", "correct": "replacement", "explanationRo": "clear rule in Romanian" }
  ],
  "usefulExpressions": [
    { "expression": "maximum 3 useful English expressions from the message", "meaningRo": "Romanian meaning" }
  ]
}`;
}

function buildAnalysisRules(profile: Profile, focusCategory?: string): string {
  return `You are a precise English grammar evaluator for a Romanian learner (level ${profile.currentLevel}). You receive learner utterances from a spoken conversation (speech-to-text).

For EACH utterance produce an analysis object:
- original: the utterance exactly as received
- corrected: a FULLY correct version of the utterance — fix EVERY grammatical error in it, even minor ones you choose NOT to list in "errors". Keep the learner's words where already correct. This sentence is shown to the learner as "the correct way to say it", so it must contain NO remaining errors.
- naturalVersion: how a native speaker would naturally say it (also fully correct, no remaining errors)
- professionalVersion: a professional/workplace phrasing (only if it differs meaningfully, else same as naturalVersion)
- errors: array of real mistakes only — NEVER invent mistakes; ignore punctuation/capitalization/casual spoken forms and STT artifacts:
  { "category": one of [${CATEGORIES}],
    "originalFragment": "...", "correctFragment": "...",
    "severity": "high" (changes meaning / basic rule) | "medium" | "low",
    "explanationRo": "explicație în română, max 20 cuvinte, menționează interferența cu româna unde există" }
- cefrEstimate: estimated CEFR of this utterance${focusCategory ? `\nPay extra attention to mistakes in the category: ${focusCategory}.` : ''}

Quality rules:
- corrected and naturalVersion must NEVER contain speech fillers such as "uh", "um", "erm" or "hmm".
- Word/phrase repetitions ("we we", "I want I want to") are speech stutters or transcription artifacts, NOT mistakes: never list them in errors — silently drop the duplicate in corrected and naturalVersion.
- NEVER "correct" proper names (people, places, brands) or technical terms you do not recognize (e.g. "vibe coding"): the learner's own name or an unfamiliar term is NOT a mistake. If you are unsure whether a phrase was intentional, do not flag it.
- The "errors" list holds only the few TEACHABLE mistakes; "corrected" must fix ALL of them AND every other error in the utterance. Never leave an error unfixed just because it is not in "errors" — corrected and naturalVersion must be flawless English on their own. If errors is non-empty, corrected must differ from original by more than capitalization or punctuation.
- If the transcription is too uncertain to reconstruct confidently, return errors: [] instead of teaching a guessed sentence.
- Every correctFragment must be visibly represented in corrected.

If an utterance is fully correct: corrected = original, errors = [].`;
}

/** Analiza gramaticală strict JSON (§31) + English Mirror (§13). Poate analiza una sau mai multe replici. */
export function buildAnalysisPrompt(profile: Profile, focusCategory?: string): string {
  return `${buildAnalysisRules(profile, focusCategory)}

OUTPUT — STRICT JSON only:
{ "analyses": [ { "original": "...", "corrected": "...", "naturalVersion": "...", "professionalVersion": "...", "errors": [...], "cefrEstimate": "A2" } ] }
Return the analyses in the same order as the utterances.`;
}

/** O singură evaluare finală produce atât analiza replicilor noi, cât și raportul complet. */
export function buildAnalysisAndReportPrompt(profile: Profile, focusCategory?: string): string {
  return `${buildAnalysisRules(profile, focusCategory)}

You receive the FULL conversation transcript. Analyze ONLY the numbered lines prefixed "Learner N", in their numeric order. Lines prefixed "Teacher" are context and must not receive analysis objects.
If a learner line is marked [ALREADY ANALYZED], use it as report context but do not include it in "analyses".

Also produce the complete post-session report in Romanian. Preserve this exact report structure and prioritize at most 3 real mistakes by: meaning-changing > repeated > frequent > unnatural. Capitalization, punctuation, speech fillers, proper names and unfamiliar technical terms are not mistakes.

OUTPUT — STRICT JSON only:
{
  "analyses": [
    { "original": "...", "corrected": "...", "naturalVersion": "...", "professionalVersion": "...", "errors": [...], "cefrEstimate": "A2" }
  ],
  "report": {
    "wellDone": ["2-4 concrete positives in Romanian, grounded in the transcript"],
    "mainMistakes": [
      { "said": "exact learner phrase", "correct": "corrected", "natural": "more natural version", "explanationRo": "regula pe scurt", "exerciseSentences": ["exact 3 new English practice sentences"] }
    ],
    "newExpressions": ["useful expressions from the conversation, maximum 5"],
    "generalScore": 0,
    "summaryRo": "2-3 propoziții concrete în română"
  }
}
Return one analysis for every learner line that is NOT marked [ALREADY ANALYZED], in the same order.`;
}

/** Raportul după conversație (§12). */
export function buildReportPrompt(): string {
  return `The conversation has ended. Produce the post-session report as STRICT JSON (Romanian text in all "Ro" fields):
{
  "wellDone": ["2-4 concrete positives, in Romanian, citing what the learner actually did"],
  "mainMistakes": [
    { "said": "exact learner phrase", "correct": "corrected", "natural": "more natural version",
      "explanationRo": "regula, scurt, în română",
      "exerciseSentences": ["3 propoziții noi în engleză care exersează aceeași structură"] }
  ],
  "newExpressions": ["useful expressions that appeared in the conversation, max 5"],
  "generalScore": 0-100,
  "summaryRo": "2-3 propoziții de rezumat în română, direct și concret"
}
mainMistakes: MAXIMUM 3, prioritized by: meaning-changing > repeated > frequent > unnatural (§ priority rule). Do NOT list every mistake.
The transcript comes from speech-to-text: capitalization, punctuation and speech fillers are NOT mistakes — never include a mainMistake whose correction only changes those. Never "correct" proper names or unfamiliar technical terms.`;
}

/** Ghid de ton adaptat la nivel: cu cât e mai mic nivelul, cu atât explicația e mai simplă și mai mult „mură-n gură". */
function levelToneGuidanceRo(level: string): string {
  if (level === 'A1' || level === 'A2') {
    return 'Adaptare la nivel (A1/A2 — începător): scrie ca pentru cineva care NU știe deloc regula. Folosește româna cea mai simplă, propoziții scurte, fără jargon; dacă folosești un termen gramatical (ex. „participiu", „auxiliar"), explică-l imediat în paranteză cu cuvinte de zi cu zi. Dă analogii concrete și pași clari.';
  }
  if (level === 'B1' || level === 'B2') {
    return 'Adaptare la nivel (B1/B2 — intermediar): explică clar și complet, poți intra în nuanțe și contraste cu structuri apropiate, dar rămâi pe înțelesul cuiva care încă face greșeala.';
  }
  return 'Adaptare la nivel (avansat): explică precis, cu nuanțele și excepțiile relevante.';
}

/** Microlecție (§17). */
/** Validator structural pentru microlecții — folosit cu chatJson({ validate }). */
export function isMicrolessonShape(v: unknown): boolean {
  const l = v as { rule?: unknown; explanationRo?: unknown; examples?: unknown; personalExamples?: unknown; targetPhrases?: unknown; voiceExercise?: unknown };
  return (
    typeof l?.rule === 'string' &&
    typeof l?.explanationRo === 'string' &&
    Array.isArray(l?.examples) &&
    (l.examples as { en?: unknown }[]).every((e) => typeof e?.en === 'string') &&
    Array.isArray(l?.personalExamples) &&
    Array.isArray(l?.targetPhrases) &&
    typeof l?.voiceExercise === 'string'
  );
}

export function buildMicrolessonPrompt(profile: Profile, topicTitle: string, recentMistakes: Mistake[]): string {
  const mist = recentMistakes
    .slice(0, 5)
    .map((m) => `- "${m.original}" → "${m.corrected}"`)
    .join('\n');
  return `Creează o microlecție de engleză pentru un român, nivel ${profile.currentLevel}, obiectiv: ${profile.mainObjective}.
Subiect: ${topicTitle}.
Greșelile lui recente pe acest subiect (dacă există):
${mist || '(niciuna — folosește greșeli tipice ale românilor)'}

${levelToneGuidanceRo(profile.currentLevel)}

OUTPUT STRICT JSON:
{
  "rule": "numele regulii, scurt, în română",
  "explanationRo": "explicație DETALIATĂ ca pentru un începător, în română (4-7 propoziții scurte): ce înseamnă regula pe înțelesul oricui, de ce există, și greșeala tipică pe care o fac românii (ce calc din română o produce). Explică orice termen gramatical folosit.",
  "patternRo": "tiparul/formula în cuvinte simple, ca o rețetă (ex. „subiect + have/has + verbul la participiu trecut (-ed sau formă neregulată)")",
  "whenToUseRo": "când se folosește regula ȘI când NU se folosește (contrast scurt cu o structură apropiată cu care se confundă)",
  "examples": [ { "en": "...", "ro": "..." }, ... exact 3, de la simplu la puțin mai complex ],
  "personalExamples": [ "2 propoziții exemplu în engleză din contextul profesional al learner-ului (${profile.mainObjective}, ${profile.interests.slice(0, 3).join(', ')})" ],
  "targetPhrases": [ "3 expresii utile legate de regulă, în engleză" ],
  "voiceExercise": "o propoziție în engleză pe care learner-ul să o rostească, folosind regula"
}`;
}

/** Evaluarea testului de nivel (§7). */
export function buildLevelTestEvalPrompt(pronScore: number | null): string {
  return `The level test has ended. You have the full transcript of all stages (simple conversation, past narration, picture description, listening comprehension, professional situation, free conversation).${pronScore != null ? ` The separate pronunciation module scored: ${pronScore}/100.` : ''}

Evaluate the Romanian learner and output STRICT JSON:
{
  "general": "A1|A2|B1|B2|C1|C2",
  "levels": { "conversation": "...", "grammar": "...", "pronunciation": "...", "vocabulary": "...", "listening": "..." },
  "scores": { "conversation": 0-100, "grammar": 0-100, "pronunciation": 0-100, "vocabulary": 0-100, "listening": 0-100 },
  "fluency": 0-100,
  "confidence": "scăzută|medie|ridicată",
  "activeVocabEstimate": "ex: ~800 de cuvinte",
  "topProblems": ["exact 5 probleme principale, în română, concrete (ex: 'Past Simple — folosești prezentul pentru acțiuni trecute')"],
  "recommendedPlanRo": "planul recomandat în 3-4 propoziții în română: obiectiv realist (ex: B1 conversațional în 12-16 săptămâni), pe ce să insiste"
}
Be honest and calibrated — do not inflate levels.`;
}

/** Raport săptămânal (§26). */
export function buildWeeklyReportPrompt(stats: string): string {
  return `Ești coach-ul de engleză al unui român. Datele săptămânii:

${stats}

Scrie raportul săptămânal în ROMÂNĂ, markdown, concret și cu cifre:
1. **Rezumat** — minute vorbite, progres față de săptămâna trecută
2. **Greșeli reduse** și **greșeli persistente** (pe categorii, cu procente unde se poate)
3. **Expresii învățate**
4. **Recomandări** și **obiectivele săptămânii următoare** (3 puncte concrete: gramatică, scenariu, pronunție)
Fără încurajări goale. Răspunde DOAR cu markdown-ul.`;
}

/** Explică-mi ziua (§10.7): povestea în română → engleză + expresii. */
export function buildMyDayPrompt(profile: Profile): string {
  return `The learner (Romanian, level ${profile.currentLevel}, works in: ${profile.mainObjective}) will tell you in ROMANIAN what they did or what situation they face. Transform it into English learning material.

OUTPUT STRICT JSON:
{
  "englishVersion": "the story/situation retold in natural English at their level (5-8 sentences)",
  "expressions": [ { "en": "key expression", "ro": "traducere" }, ... 4-6 most useful expressions from the story ],
  "conversationTopic": "a one-line scenario instruction (in English) for a conversation that forces the learner to talk about this exact situation"
}`;
}

/** Reanalizarea unei corecturi contestate (§32). */
export function buildDisputePrompt(original: string, correction: string, context: string): string {
  return `A learner disputes a correction. Re-analyze carefully with full context.

Conversation context:
${context}

Learner's sentence: "${original}"
The app corrected it to: "${correction}"
The learner says this correction is wrong.

Consider: casual spoken English, STT artifacts, valid alternative phrasings. OUTPUT STRICT JSON:
{ "verdict": "correct_as_said" | "correction_stands" | "both_acceptable",
  "explanationRo": "explicație clară în română, max 40 de cuvinte" }`;
}

/** Fișă de vocabular îmbogățită (§15). */
export function buildVocabCardPrompt(word: string, context: string, profile: Profile): string {
  return `Create a vocabulary card for the English word/expression "${word}" (seen in context: "${context}") for a Romanian learner, level ${profile.currentLevel}, working in ${profile.mainObjective}.
OUTPUT STRICT JSON:
{ "translation": "traducere română", "cefrLevel": "A1|A2|B1|B2|C1|C2",
  "example": "a general example sentence", "personalExample": "an example from the learner's professional context",
  "synonyms": ["max 3"], "opposite": "or empty string" }`;
}

/** Propoziții personalizate de pronunție (§18). */
export function buildPersonalizedPronPrompt(weakSounds: string[], vocab: string[]): string {
  return `Generate 8 short English sentences (6-12 words) for pronunciation practice targeting these problem sounds of a Romanian speaker: ${weakSounds.join(', ')}.
Sound legend: th (think/this), w_v (w vs v), ee_i (sheep/ship), h (aspirated h), ed (-ed endings), stress (word stress).
Where natural, use the learner's vocabulary: ${vocab.slice(0, 15).join(', ') || 'general professional vocabulary'}.
OUTPUT STRICT JSON: { "phrases": [ { "text": "...", "targets": ["th"] } ] }`;
}

/** Traducerea RO a propoziției corecte — sarcina „spune în engleză" din repetarea greșelilor. */
export function buildMistakePromptRoPrompt(corrected: string): string {
  return `Translate this English sentence into natural, conversational Romanian. A Romanian learner will see ONLY your translation and must say the English sentence from memory, so keep the meaning exact and the wording natural (no word-for-word calques).
English sentence: "${corrected}"
OUTPUT STRICT JSON only: { "promptRo": "traducerea în română" }`;
}

/** Mini-lecția „de ce greșesc aici" pentru o greșeală din hartă — regulă generală, nu doar propoziția. */
export function buildMistakeDeepDivePrompt(m: { original: string; corrected: string; category: string; explanationRo: string }): string {
  return `You are an English teacher for Romanian speakers. A learner keeps making this mistake:
Said: "${m.original}"
Correct: "${m.corrected}"
Category: ${m.category}. Short note: ${m.explanationRo}

Teach the UNDERLYING RULE so the learner can apply it anywhere, not just in this sentence. All explanations in Romanian, simple and direct.
OUTPUT STRICT JSON only:
{
  "ruleRo": "regula generală, max 40 de cuvinte",
  "interferenceRo": "de ce vorbitorii de română fac exact această greșeală (ce calc din română o produce), max 30 de cuvinte",
  "examples": [ { "en": "propoziție engleză care aplică regula", "ro": "traducerea ei" } ]
}
examples: exactly 3, varied everyday contexts different from the learner's sentence.`;
}

/** Rezumat rolling al conversației (§33 — controlul costurilor). */
export function buildSummaryPrompt(): string {
  return 'Update the compact conversation summary in 4-6 concise English sentences. Preserve: topics already covered, personal facts the learner shared, important corrections or target expressions, the unresolved current thread, and the latest teacher question still awaiting follow-up. Merge the previous summary with the new turns without duplicating information. This summary replaces all older turns. Output only the updated summary text.';
}

/** Textul pentru etapa de ascultare din test (§7.4). */
export const LISTENING_PASSAGE = {
  text: "Hi! I'm calling about the meeting tomorrow. We moved it from ten to eleven thirty because the conference room is busy. Please bring the report and tell Anna she doesn't need to come.",
  questions: [
    'What time is the meeting now?',
    'What should the learner bring?',
    'Does Anna need to come to the meeting?',
  ],
};

export function formatTurnsForAnalysis(turns: Utterance[]): string {
  return turns
    .filter((t) => t.role === 'user')
    .map((t, i) => `${i + 1}. ${t.text}`)
    .join('\n');
}

// ---------- P1+: memoria de conversație pe termen lung ----------
export function buildMemoryUpdatePrompt(memory: ConversationMemory, transcript: string, date: string): string {
  return `You maintain the compact long-term memory of an English tutoring app about ONE learner (a Romanian professional). Today is ${date}.

CURRENT MEMORY (JSON):
${JSON.stringify({ facts: memory.facts, topics: memory.topics, openThreads: memory.openThreads })}

TODAY'S SESSION TRANSCRIPT:
${transcript}

Update the memory:
- "facts": stable personal facts (job, projects, family, interests, recurring situations). Merge with existing, deduplicate, correct outdated ones. Max 25, each under 15 words, in English.
- "topics": what was discussed, as short labels with dates. Append today's topics (1-4 labels), keep chronological order, max 30 total (drop the oldest).
- "openThreads": unresolved stories worth following up in the NEXT session ("has a client demo on Friday", "was reading a book about X"). Add new ones from today, REMOVE resolved or stale ones. Max 8.

OUTPUT STRICT JSON only:
{ "facts": ["..."], "topics": [{ "topic": "...", "date": "YYYY-MM-DD" }], "openThreads": ["..."] }`;
}

// ---------- Speaking Lab: RESCUE (cuvântul care nu vine) ----------
// Apelat DOAR pe miss de dicționar/cache — de aici plafonul strâns de tokeni. Output minim.
export function buildRescuePrompt(roTerm: string, contextBefore: string, contextAfter: string): string {
  return `A Romanian learner is speaking English and blanked on ONE word. They said it in Romanian: "${roTerm}".
Context (English around the gap): "${contextBefore.slice(-120)} ___ ${contextAfter.slice(0, 80)}".

Give the single most natural English word/short phrase that fills the gap in THIS context. No explanation.
OUTPUT STRICT JSON only: { "en": "the word or short phrase", "alternatives": ["at most 2 common variants"], "register": "neutral|formal|informal" }`;
}

// ---------- Speaking Lab: tema de free talk generată din tag-urile slabe (§5) ----------
// Rulează pe tier ieftin/gratuit; scopul e să forțeze structurile pe care learner-ul le ratează.
export function buildFreeTalkTopicPrompt(profile: Profile, weakTagsRo: string[], recentTopics: string[]): string {
  return `A Romanian learner (level ${profile.currentLevel}, objective: ${profile.mainObjective}) is about to do 4 minutes of free English speaking.
Their weakest grammar/vocabulary areas right now: ${weakTagsRo.join(', ') || 'general fluency'}.
${recentTopics.length ? `Avoid repeating these recent topics: ${recentTopics.join('; ')}.` : ''}

Propose ONE engaging speaking topic whose natural answer FORCES the learner to use their weak structures, tied to their real life/work. Keep it concrete and personal.
OUTPUT STRICT JSON only: { "topicEn": "one warm opening line/question the teacher says to start", "reasonRo": "de ce forțează structura slabă, o propoziție scurtă în română" }`;
}

// ---------- P1: „Nu știu cum să spun" ----------
export function buildDontKnowPrompt(profile: Profile, context: string): string {
  return `A Romanian learner of English (level ${profile.currentLevel}) is in the middle of an English conversation and doesn't know how to say something. They describe it in Romanian (or broken English).

Recent conversation context:
${context || '(none)'}

Give them the most natural, level-appropriate English way to say it IN THIS CONTEXT. Prefer a short, reusable structure over a long literal translation.

OUTPUT STRICT JSON only:
{
  "phraseEn": "the natural English phrase or sentence",
  "literalRo": "traducerea/explicația scurtă în română",
  "tipRo": "un sfat de 1 propoziție despre structură sau când se folosește"
}`;
}

// ---------- P1: test de transfer (aceeași regulă, context nou) ----------
export function buildTransferTestPrompt(profile: Profile, mistake: Mistake): string {
  return `A Romanian learner (level ${profile.currentLevel}) made this mistake and has just reviewed the correction:
- They said: "${mistake.original}"
- Correct: "${mistake.corrected}"
- Rule category: ${mistake.category}
- Explanation shown (Romanian): "${mistake.explanationRo}"

Create ONE transfer exercise: a NEW situation (different topic and vocabulary from the original sentence) where the learner must produce a sentence using THE SAME grammar rule. Describe the situation in Romanian, without revealing the English structure.

CRITICAL — grammatical person must match:
- The situation is what the LEARNER personally says, so expectedEn MUST be in the FIRST PERSON SINGULAR ("I ...") unless the situation EXPLICITLY involves a group the learner belongs to (only then "we").
- Keep the person consistent between situationRo and expectedEn: never phrase the situation about the learner alone ("intenționezi...", "vrei...") and then answer with "we". If situationRo says "tu/eu", expectedEn says "I".
- expectedEn must be flawless, natural English with no remaining errors.

OUTPUT STRICT JSON only:
{
  "situationRo": "situația descrisă în română, 1-2 propoziții, care cere natural regula",
  "expectedEn": "a correct English sentence the learner could say (first person singular unless the situation is about a group)",
  "keyWords": ["2-4 English words that MUST appear (the grammar-critical words, e.g. the auxiliary, the verb form)"]
}`;
}

// ---------- P1: evaluarea răspunsului la testul de transfer (regula + restul propoziției) ----------
export function buildTransferEvalPrompt(
  profile: Profile,
  mistake: Mistake,
  exercise: { situationRo: string; expectedEn: string; keyWords: string[] },
  answer: string
): string {
  return `A Romanian learner (level ${profile.currentLevel}) is doing a "transfer" drill: apply ONE grammar rule they recently got wrong, in a new context.

The rule being drilled:
- Original mistake: "${mistake.original}"
- Corrected to: "${mistake.corrected}"
- Rule category: ${mistake.category}

The new situation (Romanian): "${exercise.situationRo}"
A model correct answer: "${exercise.expectedEn}"
Grammar-critical words for the rule: ${exercise.keyWords.join(', ')}

The learner answered (speech-to-text, so IGNORE capitalization, punctuation and speech fillers like "uh"/"um"): "${answer}"

Evaluate two things SEPARATELY:
1. ruleApplied: did the learner correctly apply THE DRILLED RULE? Not merely include the keywords — the structure must be used correctly.
2. otherErrors: any OTHER real English mistakes in the answer, UNRELATED to the drilled rule. A real mistake changes meaning, grammar, or word choice (wrong word, wrong verb form, missing article, misspelling of a common word). Do NOT flag capitalization, punctuation, speech fillers, proper names, or unfamiliar technical terms. Give the exact wrong fragment from the answer and its minimal correction.

OUTPUT STRICT JSON only:
{
  "ruleApplied": true or false,
  "otherErrors": [{ "wrong": "exact wrong fragment from the answer", "correct": "the corrected fragment" }],
  "noteRo": "one short Romanian sentence: what to fix, or praise if fully correct"
}`;
}

// ---------- P1: evaluarea răspunsului la cardul de repetiție (a produs forma corectă + restul curat) ----------
export function buildReviewEvalPrompt(profile: Profile, mistake: Mistake, answer: string): string {
  return `A Romanian learner (level ${profile.currentLevel}) is re-practicing a past mistake: they must now produce the corrected form.

The mistake being drilled:
- What they said before (wrong): "${mistake.original}"
- Target correct form: "${mistake.corrected}"
- Rule category: ${mistake.category}

The learner now produced (speech-to-text, so IGNORE capitalization, punctuation and speech fillers like "uh"/"um"): "${answer}"

IMPORTANT: the "target correct form" above was recorded automatically and may ITSELF still contain grammar errors. Judge against ACTUAL correct English, not blindly against that stored form.

Evaluate and produce:
1. ruleApplied: did the learner correctly produce the drilled rule/correction? Not merely include the key word — the structure must be correct.
2. otherErrors: any OTHER real English mistakes in the LEARNER'S answer, UNRELATED to the drilled rule. A real mistake changes meaning, grammar, or word choice (wrong word, wrong verb form, missing article, misspelling of a common word). Do NOT flag capitalization, punctuation, speech fillers, proper names, or unfamiliar technical terms. Give the exact wrong fragment from the answer and its minimal correction.
3. correctSentence: the FULLY correct, natural English version of the sentence the learner is meant to say — every grammar error fixed, keeping the same meaning and (where sensible) their own words. This is the reference that will be shown as "correct", so it must be flawless.

OUTPUT STRICT JSON only:
{
  "ruleApplied": true or false,
  "otherErrors": [{ "wrong": "exact wrong fragment from the answer", "correct": "the corrected fragment" }],
  "correctSentence": "the fully correct, natural English sentence",
  "noteRo": "one short Romanian sentence: what to fix, or praise if fully correct"
}`;
}

// ---------- P1: evaluarea „Reia scena" ----------
export function buildRedoSceneEvalPrompt(profile: Profile): string {
  return `You are an English teacher for a Romanian learner (level ${profile.currentLevel}). During a conversation, the learner gave an answer with mistakes. They are now redoing that exact moment, trying to say it better.

Compare the new attempt with the original. Judge only real improvement in grammar and naturalness (ignore speech-to-text punctuation artifacts).

OUTPUT STRICT JSON only:
{
  "improved": true/false,
  "feedbackRo": "feedback cald și concret în română, 1-3 propoziții: ce e mai bine acum și ce mai poate îmbunătăți",
  "bestVersionEn": "the most natural version of what they wanted to say"
}`;
}

/** Lecție de gramatică generată dintr-o propoziție anume (§P1: „Explică-mi timpurile folosite"). */
export function buildSentenceLessonPrompt(profile: Profile, sentence: string): string {
  return `You are an English grammar teacher for a Romanian learner (level ${profile.currentLevel}). Explain the grammar of this exact English sentence: "${sentence}"

Identify the tense(s)/structure(s) actually used in this sentence and explain them so the learner understands WHY the sentence is built this way, not a generic rule.

${levelToneGuidanceRo(profile.currentLevel)}

OUTPUT STRICT JSON:
{
  "rule": "numele timpului/structurii folosite în această propoziție, scurt, în română (ex: 'Present Perfect + prezent simplu')",
  "explanationRo": "explicație DETALIATĂ ca pentru un începător, în română (4-7 propoziții scurte): ce timp/structură e, de ce se folosește AICI, ce parte a propoziției arată asta, și greșeala tipică pe care o fac românii. Explică orice termen gramatical folosit.",
  "patternRo": "tiparul/formula structurii în cuvinte simple (ex. „subiect + have/has + verbul la participiu trecut")",
  "whenToUseRo": "când se folosește această structură ȘI când NU (contrast scurt cu un timp/structură cu care se confundă des)",
  "examples": [ { "en": "...", "ro": "..." }, ... exact 3, folosind aceeași structură gramaticală ca propoziția dată ],
  "personalExamples": [ "2 propoziții exemplu în engleză cu aceeași structură, din contextul profesional al learner-ului (${profile.mainObjective})" ],
  "targetPhrases": [ "3 expresii utile legate de structura asta, în engleză" ],
  "voiceExercise": "propoziția originală sau o variantă foarte apropiată, de rostit cu voce tare"
}`;
}

// ---------- P1: indicii în română pentru testul săptămânal fără ajutor ----------
export function buildQuizCuesPrompt(items: { corrected: string }[]): string {
  return `For each English sentence below, write a short Romanian cue that makes a learner produce that exact sentence (or a very close variant) in English. The cue must NOT contain any English words and must not reveal the grammatical structure — it describes the meaning/situation only.

Sentences:
${items.map((m, i) => `${i + 1}. ${m.corrected}`).join('\n')}

OUTPUT STRICT JSON only:
{ "cues": ["cue în română pentru propoziția 1", "..."] }`;
}
