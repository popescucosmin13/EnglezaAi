// Conținut static: lumi pe niveluri (§19), traseul IT (§20), jocuri de rol (§10.2),
// minimal pairs / accent / ritm (§18), curriculum de gramatică (§17), moduri de dificultate (§23),
// opțiuni de onboarding (§6), misiuni (§24), structura săptămânală (§22).

import type { Cefr, DifficultyMode, MistakeCategory } from './types';
import type { IconName } from './components/Icon';

// ---------- Scenarii de conversație ----------
export interface ScenarioDef {
  id: string;
  icon: IconName;
  title: string;
  titleRo: string;
  persona: string; // instrucțiuni EN pentru AI
  level?: Cefr;
  professional?: boolean;
}

export const ROLEPLAY_SCENARIOS: ScenarioDef[] = [
  { id: 'restaurant', icon: 'utensils', title: 'Restaurant', titleRo: 'La restaurant', persona: 'You are a waiter in a restaurant. The learner is a customer: greet them, take their order, handle a small problem with the bill.' },
  { id: 'hotel', icon: 'hotel', title: 'Hotel', titleRo: 'La hotel', persona: 'You are a hotel receptionist. Handle check-in, questions about facilities, and a room problem the learner reports.' },
  { id: 'airport', icon: 'plane', title: 'Airport', titleRo: 'La aeroport', persona: 'You are airport staff (check-in and security). Guide the learner through check-in, baggage questions and a delayed flight.' },
  { id: 'pharmacy', icon: 'pharmacy', title: 'Pharmacy', titleRo: 'La farmacie', persona: 'You are a pharmacist. The learner describes symptoms and needs advice about medicine.' },
  { id: 'shop', icon: 'shopping', title: 'Shopping', titleRo: 'La cumpărături', persona: 'You are a shop assistant. Help the learner find products, sizes, prices, and handle a return.' },
  { id: 'doctor', icon: 'stethoscope', title: 'Doctor', titleRo: 'La medic', persona: 'You are a doctor. Ask about symptoms, give simple advice, schedule a follow-up.' },
  { id: 'bank', icon: 'bank', title: 'Bank', titleRo: 'La bancă', persona: 'You are a bank clerk. Help the learner open an account, discuss a card problem, explain fees.' },
  { id: 'interview', icon: 'briefcase', title: 'Job Interview', titleRo: 'Interviu de angajare', persona: 'You are a hiring manager interviewing the learner for a job in their field. Ask behavioral and role questions, follow up on vague answers.', professional: true },
  { id: 'meeting', icon: 'barChart', title: 'Meeting', titleRo: 'Ședință', persona: 'You are a colleague running a status meeting. Ask the learner for updates, blockers and next steps. Keep it structured.', professional: true },
  { id: 'tech_support', icon: 'monitorCog', title: 'Tech Support', titleRo: 'Suport tehnic', persona: 'You are a non-technical user with a computer problem. The learner is the IT support specialist who must diagnose and explain the fix simply.', professional: true },
  { id: 'negotiation', icon: 'handshake', title: 'Negotiation', titleRo: 'Negociere', persona: 'You are a vendor sales representative. The learner negotiates price and contract terms. Be professionally resistant.', professional: true },
  { id: 'presentation', icon: 'presentation', title: 'Presentation', titleRo: 'Prezentare', persona: 'You are an audience member. The learner presents a project or solution; ask questions and request clarifications.', professional: true },
  { id: 'manager', icon: 'user', title: 'Manager 1:1', titleRo: 'Discuție cu managerul', persona: 'You are the learner\'s manager in a 1:1. Discuss workload, feedback, career goals and a current project.', professional: true },
];

// ---------- Lumi pe niveluri (§19) ----------
export interface World {
  id: string;
  level: Cefr;
  icon: IconName;
  titleRo: string;
  topics: { id: string; titleRo: string; prompt: string }[];
}

export const WORLDS: World[] = [
  {
    id: 'a1_me', level: 'A1', icon: 'user', titleRo: 'Despre mine',
    topics: [
      { id: 'name', titleRo: 'Nume și prezentare', prompt: 'Practice introducing yourself: name, age, where you are from.' },
      { id: 'family', titleRo: 'Familia', prompt: 'Talk about the learner\'s family members and what they do.' },
      { id: 'home_city', titleRo: 'Unde locuiesc', prompt: 'Talk about where the learner lives: city, neighborhood, likes/dislikes.' },
      { id: 'job', titleRo: 'Profesia', prompt: 'Talk about the learner\'s job: what they do, where, daily tasks (simple).' },
      { id: 'hobbies', titleRo: 'Hobby-uri', prompt: 'Talk about hobbies and free time activities.' },
      { id: 'daily', titleRo: 'Programul zilnic', prompt: 'The learner describes their daily routine (wake up, work, evening).' },
      { id: 'likes', titleRo: 'Preferințe', prompt: 'Talk about likes and dislikes: food, music, weather, activities.' },
      { id: 'plans', titleRo: 'Planuri simple', prompt: 'Talk about simple plans: this evening, weekend, next week (going to).' },
      { id: 'friends', titleRo: 'Prieteni', prompt: 'Talk about the learner\'s friends: who they are, what you do together.' },
      { id: 'final', titleRo: 'Conversație finală', prompt: 'Free conversation combining all "About me" topics: introduction, family, job, hobbies, plans.' },
    ],
  },
  {
    id: 'a1_home', level: 'A1', icon: 'home', titleRo: 'Acasă',
    topics: [
      { id: 'rooms', titleRo: 'Camerele', prompt: 'Describe the rooms in the learner\'s home (there is / there are).' },
      { id: 'objects', titleRo: 'Obiecte', prompt: 'Talk about objects around the house and where they are (prepositions of place).' },
      { id: 'activities', titleRo: 'Activități acasă', prompt: 'What the learner does at home: cooking, relaxing, working.' },
      { id: 'cleaning', titleRo: 'Curățenie', prompt: 'Talk about household chores: who does what, how often.' },
      { id: 'cooking', titleRo: 'Gătit', prompt: 'Talk about cooking: favorite dishes, simple recipes, kitchen vocabulary.' },
      { id: 'shopping', titleRo: 'Cumpărături', prompt: 'Roleplay: shopping for groceries, asking for products and prices.' },
      { id: 'neighbors', titleRo: 'Vecini', prompt: 'Talk about neighbors and the building/street where the learner lives.' },
      { id: 'problems', titleRo: 'Probleme casnice', prompt: 'Describe a household problem (broken heating, leaking tap) and ask for help.' },
      { id: 'describe', titleRo: 'Descrierea locuinței', prompt: 'The learner gives a full description of their home.' },
      { id: 'sim', titleRo: 'Simulare finală', prompt: 'Roleplay: showing a friend around your home and planning a dinner together.' },
    ],
  },
  {
    id: 'a1_city', level: 'A1', icon: 'building', titleRo: 'Orașul',
    topics: [
      { id: 'directions', titleRo: 'Direcții', prompt: 'Asking for and giving directions in the city.' },
      { id: 'transport', titleRo: 'Transport', prompt: 'Talk about public transport: bus, metro, tickets, schedules.' },
      { id: 'shops', titleRo: 'Magazine', prompt: 'Talk about shops and services in the learner\'s city.' },
      { id: 'services', titleRo: 'Servicii', prompt: 'Roleplay: post office, bank, city hall — simple requests.' },
      { id: 'schedule', titleRo: 'Program', prompt: 'Ask about opening hours and schedules.' },
      { id: 'places', titleRo: 'Locații', prompt: 'Describe favorite places in the city: parks, cafes, cinemas.' },
      { id: 'meetups', titleRo: 'Întâlniri', prompt: 'Arrange to meet someone: time, place, activity.' },
      { id: 'questions', titleRo: 'Întrebări', prompt: 'Practice asking questions to strangers politely (Excuse me, could you...).' },
      { id: 'convos', titleRo: 'Conversații', prompt: 'Short casual conversations around the city: taxi, café, street.' },
      { id: 'test', titleRo: 'Test', prompt: 'Final test conversation: navigate a full day in the city in English.' },
    ],
  },
  {
    id: 'a2_life', level: 'A2', icon: 'globe', titleRo: 'Viața de zi cu zi',
    topics: [
      { id: 'travel', titleRo: 'Călătorii', prompt: 'Talk about trips: where, when, what you did (past simple).' },
      { id: 'restaurant', titleRo: 'Restaurant', prompt: 'Full restaurant roleplay: booking, ordering, complaining politely, paying.' },
      { id: 'hotel', titleRo: 'Hotel', prompt: 'Full hotel roleplay: booking, check-in, problems, check-out.' },
      { id: 'health', titleRo: 'Sănătate', prompt: 'Talk about health: symptoms, doctor visits, healthy habits.' },
      { id: 'daily', titleRo: 'Activități zilnice', prompt: 'Compare weekdays and weekends; frequency adverbs.' },
      { id: 'past', titleRo: 'Trecut', prompt: 'Tell stories about last weekend, childhood, a memorable day.' },
      { id: 'plans', titleRo: 'Planuri', prompt: 'Talk about future plans: going to, will, arrangements.' },
      { id: 'social', titleRo: 'Socializare', prompt: 'Small talk practice: weather, weekend, news, compliments.' },
      { id: 'phone', titleRo: 'La telefon', prompt: 'Phone call roleplay: making appointments, asking for information.' },
      { id: 'work', titleRo: 'Muncă', prompt: 'Talk about the learner\'s work: responsibilities, colleagues, a typical day.' },
    ],
  },
  {
    id: 'b1_work', level: 'B1', icon: 'message', titleRo: 'Conversații reale',
    topics: [
      { id: 'meetings', titleRo: 'Ședințe', prompt: 'Meeting simulation: status updates, agreeing/disagreeing, action items.' },
      { id: 'problems', titleRo: 'Probleme', prompt: 'Describe a problem at work and discuss solutions.' },
      { id: 'opinions', titleRo: 'Opinii', prompt: 'Express and defend opinions on everyday topics.' },
      { id: 'experiences', titleRo: 'Experiențe', prompt: 'Talk about experiences using Present Perfect (Have you ever...).' },
      { id: 'interviews', titleRo: 'Interviuri', prompt: 'Job interview practice with follow-up questions.' },
      { id: 'presentations', titleRo: 'Prezentări', prompt: 'Give a short structured presentation, then answer questions.' },
      { id: 'negotiations', titleRo: 'Negocieri simple', prompt: 'Negotiate simple things: price, deadline, responsibilities.' },
      { id: 'spontaneous', titleRo: 'Conversații spontane', prompt: 'Random topics with quick topic changes; no preparation.' },
      { id: 'stories', titleRo: 'Povești', prompt: 'Storytelling: narrate events with connectors (first, then, suddenly, in the end).' },
      { id: 'argue', titleRo: 'Argumentare', prompt: 'Build arguments: because, although, on the other hand; mini-debates.' },
    ],
  },
  {
    id: 'b2_pro', level: 'B2', icon: 'rocket', titleRo: 'Profesional avansat',
    topics: [
      { id: 'business', titleRo: 'Business', prompt: 'Business discussions: strategy, clients, market, KPIs.' },
      { id: 'leadership', titleRo: 'Leadership', prompt: 'Talk about leading people: delegating, feedback, motivation.' },
      { id: 'presentations', titleRo: 'Prezentări complexe', prompt: 'Present complex topics with structure and signposting language.' },
      { id: 'debates', titleRo: 'Dezbateri', prompt: 'Debate controversial topics; the AI takes the opposite side.' },
      { id: 'negotiation', titleRo: 'Negociere', prompt: 'Advanced negotiation with pushback, concessions and closing.' },
      { id: 'persuasion', titleRo: 'Persuasiune', prompt: 'Persuade a skeptical colleague/manager to adopt your proposal.' },
      { id: 'incidents', titleRo: 'Incidente', prompt: 'Report and manage a serious incident: facts, impact, plan.' },
      { id: 'management', titleRo: 'Management', prompt: 'Management conversations: priorities, resources, conflict resolution.' },
      { id: 'formal', titleRo: 'Comunicare formală', prompt: 'Formal register practice: requests, disagreement, escalation done politely.' },
      { id: 'natural', titleRo: 'Limbaj natural', prompt: 'Idioms, phrasal verbs and natural phrasing in professional talk.' },
    ],
  },
];

// ---------- Traseul IT (§20) ----------
export const IT_TRACK: { id: string; titleRo: string; prompt: string }[] = [
  { id: 'it_role', titleRo: 'Prezentarea rolului', prompt: 'The learner introduces their IT role, responsibilities and daily tasks.' },
  { id: 'it_infra', titleRo: 'Descrierea infrastructurii', prompt: 'The learner describes their company infrastructure: servers, network, cloud services.' },
  { id: 'it_troubleshoot', titleRo: 'Depanare', prompt: 'Troubleshooting roleplay: a user reports a problem, the learner asks diagnostic questions and explains the fix.' },
  { id: 'it_accounts', titleRo: 'Conturi și permisiuni', prompt: 'Explain an account/permissions issue (access denied, group membership, identity mismatch).' },
  { id: 'it_network', titleRo: 'Rețelistică', prompt: 'Discuss a network issue: IP conflict, DNS, VPN, firewall rules.' },
  { id: 'it_m365', titleRo: 'Microsoft 365', prompt: 'Discuss Microsoft 365: OneDrive sync issues, Exchange, Teams, SharePoint permissions.' },
  { id: 'it_security', titleRo: 'Securitate', prompt: 'Explain a security topic: phishing, MFA, endpoint protection, a suspicious alert.' },
  { id: 'it_backup', titleRo: 'Backup', prompt: 'Discuss backup and recovery: schedules, restore requests, a failed backup.' },
  { id: 'it_incident', titleRo: 'Incidente', prompt: 'Report a security/IT incident to management: what happened, impact, remediation.' },
  { id: 'it_vendors', titleRo: 'Furnizori', prompt: 'Vendor call: support ticket escalation, license renewal, SLA discussion.' },
  { id: 'it_support', titleRo: 'Suport utilizatori', prompt: 'Patient support conversation with a frustrated non-technical user.' },
  { id: 'it_docs', titleRo: 'Documentație', prompt: 'Explain a procedure verbally as if writing documentation: step-by-step, clear.' },
  { id: 'it_meetings', titleRo: 'Ședințe', prompt: 'IT team meeting: sprint status, blockers, planning.' },
  { id: 'it_projects', titleRo: 'Proiecte', prompt: 'Present a project status update: progress, risks, next milestones.' },
  { id: 'it_solutions', titleRo: 'Prezentarea soluțiilor', prompt: 'Present a technical solution to management: problem, options, recommendation, costs.' },
];

// ---------- Pronunție (§18) ----------
export const MINIMAL_PAIRS: { a: string; b: string; sentence: string }[] = [
  { a: 'ship', b: 'sheep', sentence: 'The ship carried sheep across the sea.' },
  { a: 'live', b: 'leave', sentence: 'I live here, but I leave at six.' },
  { a: 'think', b: 'sink', sentence: 'I think the boat will sink.' },
  { a: 'three', b: 'tree', sentence: 'Three birds sat in the tree.' },
  { a: 'work', b: 'walk', sentence: 'I walk to work every morning.' },
  { a: 'this', b: 'these', sentence: 'This file is old, but these files are new.' },
  { a: 'bad', b: 'bed', sentence: 'A bad bed ruins your sleep.' },
  { a: 'full', b: 'fool', sentence: 'The full glass fooled no one.' },
];

export const WORD_STRESS: { word: string; stressed: string; note: string }[] = [
  { word: 'present (cadou)', stressed: 'PREsent', note: 'substantiv — accent pe prima silabă' },
  { word: 'present (a prezenta)', stressed: 'preSENT', note: 'verb — accent pe a doua silabă' },
  { word: 'photograph', stressed: 'PHOtograph', note: 'accent pe prima silabă' },
  { word: 'photography', stressed: 'phoTOgraphy', note: 'accentul se mută pe a doua silabă' },
  { word: 'record (înregistrare)', stressed: 'REcord', note: 'substantiv' },
  { word: 'record (a înregistra)', stressed: 'reCORD', note: 'verb' },
  { word: 'develop', stressed: 'deVELop', note: 'accent pe a doua silabă' },
  { word: 'management', stressed: 'MANagement', note: 'accent pe prima silabă' },
];

export const RHYTHM_SENTENCES: { text: string; stressedWords: string[] }[] = [
  { text: 'I need to check the server before the meeting.', stressedWords: ['need', 'check', 'server', 'meeting'] },
  { text: 'The issue appears to be a permissions problem.', stressedWords: ['issue', 'appears', 'permissions', 'problem'] },
  { text: 'Can you send me the logs from yesterday?', stressedWords: ['send', 'logs', 'yesterday'] },
  { text: 'We fixed the bug and deployed the update.', stressedWords: ['fixed', 'bug', 'deployed', 'update'] },
  { text: 'I have been working on this since Monday.', stressedWords: ['working', 'since', 'Monday'] },
];

// ---------- Curriculum de gramatică (§17) ----------
export interface CurriculumItem {
  id: string;
  level: Cefr;
  titleRo: string;
  category: MistakeCategory;
}
export const GRAMMAR_CURRICULUM: CurriculumItem[] = [
  { id: 'to_be', level: 'A1', titleRo: 'Verbul to be', category: 'present_simple' },
  { id: 'pronouns', level: 'A1', titleRo: 'Pronume', category: 'pronoun' },
  { id: 'present_simple', level: 'A1', titleRo: 'Present Simple', category: 'present_simple' },
  { id: 'questions_a1', level: 'A1', titleRo: 'Întrebări de bază', category: 'question_form' },
  { id: 'articles', level: 'A1', titleRo: 'Articole (a/an/the)', category: 'article' },
  { id: 'plural', level: 'A1', titleRo: 'Pluralul', category: 'plural' },
  { id: 'there_is', level: 'A1', titleRo: 'There is / there are', category: 'word_order' },
  { id: 'can', level: 'A1', titleRo: 'Can / can\'t', category: 'auxiliary' },
  { id: 'prepositions_a1', level: 'A1', titleRo: 'Prepoziții de bază', category: 'preposition' },
  { id: 'past_simple', level: 'A2', titleRo: 'Past Simple', category: 'past_simple' },
  { id: 'future', level: 'A2', titleRo: 'Viitorul (will / going to)', category: 'auxiliary' },
  { id: 'comparatives', level: 'A2', titleRo: 'Comparative', category: 'other' },
  { id: 'superlatives', level: 'A2', titleRo: 'Superlative', category: 'other' },
  { id: 'adverbs', level: 'A2', titleRo: 'Adverbe', category: 'word_order' },
  { id: 'present_continuous', level: 'A2', titleRo: 'Present Continuous', category: 'present_simple' },
  { id: 'countable', level: 'A2', titleRo: 'Countable / uncountable', category: 'plural' },
  { id: 'some_any', level: 'A2', titleRo: 'Some / any', category: 'article' },
  { id: 'should_must', level: 'A2', titleRo: 'Should / must', category: 'auxiliary' },
  { id: 'present_perfect', level: 'B1', titleRo: 'Present Perfect', category: 'present_perfect' },
  { id: 'past_continuous', level: 'B1', titleRo: 'Past Continuous', category: 'past_simple' },
  { id: 'conditional_1_2', level: 'B1', titleRo: 'Condiționalul 1 și 2', category: 'conditional' },
  { id: 'relative_clauses', level: 'B1', titleRo: 'Propoziții relative', category: 'word_order' },
  { id: 'passive', level: 'B1', titleRo: 'Passive voice', category: 'other' },
  { id: 'reported_speech', level: 'B1', titleRo: 'Reported speech', category: 'other' },
  { id: 'gerund_infinitive', level: 'B1', titleRo: 'Gerunziu și infinitiv', category: 'other' },
  { id: 'modals_b1', level: 'B1', titleRo: 'Verbe modale', category: 'auxiliary' },
  { id: 'advanced_tenses', level: 'B2', titleRo: 'Timpuri avansate', category: 'present_perfect' },
  { id: 'mixed_conditionals', level: 'B2', titleRo: 'Condiționale mixte', category: 'conditional' },
  { id: 'inversion', level: 'B2', titleRo: 'Inversiune', category: 'word_order' },
  { id: 'modal_nuance', level: 'B2', titleRo: 'Nuanțe modale', category: 'auxiliary' },
  { id: 'formal', level: 'B2', titleRo: 'Limbaj formal', category: 'unnatural_phrasing' },
  { id: 'argumentation', level: 'B2', titleRo: 'Structuri de argumentare', category: 'unnatural_phrasing' },
  { id: 'connectors', level: 'B2', titleRo: 'Conectarea ideilor', category: 'word_order' },
];

// ---------- Moduri de dificultate (§23) ----------
export interface DifficultyDef {
  id: DifficultyMode;
  titleRo: string;
  descRo: string;
  ttsRate: number;
  promptRules: string;
  correctionOverride?: 'discreet' | 'immediate' | 'final';
  timeLimitMin?: number;
}
export const DIFFICULTY_MODES: DifficultyDef[] = [
  {
    id: 'patient', titleRo: 'Profesor răbdător', descRo: 'Viteză redusă, explicații în română, multe sugestii', ttsRate: 0.85,
    promptRules: 'Speak slowly with simple vocabulary. Offer suggestions and sentence starters when the learner hesitates. You may explain briefly in Romanian when the learner struggles.',
  },
  {
    id: 'normal', titleRo: 'Conversație normală', descRo: 'Viteză naturală, corectare discretă', ttsRate: 1,
    promptRules: 'Speak at a natural pace. Translate only if explicitly asked.',
  },
  {
    id: 'intensive', titleRo: 'Mod intensiv', descRo: 'Rapid, fără traducere, întrebări neașteptate', ttsRate: 1.05,
    promptRules: 'Keep a fast pace, ask unexpected follow-up questions, never translate, push the learner to answer quickly.', correctionOverride: 'final',
  },
  {
    id: 'professional', titleRo: 'Mod profesional', descRo: 'Ton formal, vocabular specializat, evaluare strictă', ttsRate: 1,
    promptRules: 'Use a formal professional tone and specialized vocabulary. Simulate real workplace stakes. Evaluate strictly.',
  },
  {
    id: 'exam', titleRo: 'Mod examen', descRo: 'Timp limitat, fără ajutor, scor și feedback la final', ttsRate: 1,
    promptRules: 'Act as an examiner: no help, no suggestions, no translations. Ask progressively harder questions.', correctionOverride: 'final', timeLimitMin: 10,
  },
];

// ---------- Onboarding (§6) ----------
export const ONBOARDING_OPTIONS = {
  objectives: ['conversații generale', 'engleză pentru serviciu', 'engleză pentru IT', 'interviuri', 'călătorii', 'relocare', 'business', 'ședințe', 'prezentări', 'pronunție', 'examene'],
  perceivedLevels: ['nu pot vorbi deloc', 'înțeleg câteva cuvinte', 'pot construi propoziții simple', 'pot conversa, dar fac multe greșeli', 'vorbesc bine, dar vreau să devin mai natural'],
  times: [10, 20, 30, 45, 60],
  temporalObjectives: ['interviu peste o lună', 'ședință importantă', 'mutare în străinătate', 'progres general', 'vacanță', 'dezvoltare profesională'],
  interests: ['tehnologie', 'familie', 'călătorii', 'filme', 'sport', 'business', 'muzică', 'jocuri', 'știri', 'antreprenoriat'],
};

// ---------- Misiuni (§24) ----------
export interface Mission {
  id: string;
  titleRo: string;
  xp: number;
  target: number;
}
export const DAILY_MISSIONS: Mission[] = [
  { id: 'speak10', titleRo: 'Vorbește 10 minute', xp: 30, target: 10 },
  { id: 'expr3', titleRo: 'Folosește 3 expresii noi', xp: 20, target: 3 },
  { id: 'repeat5', titleRo: 'Repetă 5 propoziții', xp: 15, target: 5 },
  { id: 'noro', titleRo: 'O conversație fără română', xp: 25, target: 1 },
  { id: 'oldfix', titleRo: 'Corectează o greșeală veche', xp: 20, target: 1 },
];
export const WEEKLY_MISSIONS: Mission[] = [
  { id: 'w_min100', titleRo: '100 de minute vorbite', xp: 100, target: 100 },
  { id: 'w_conv5', titleRo: '5 conversații', xp: 60, target: 5 },
  { id: 'w_sim2', titleRo: '2 simulări profesionale', xp: 50, target: 2 },
  { id: 'w_expr20', titleRo: '20 de expresii active', xp: 80, target: 20 },
  { id: 'w_test1', titleRo: 'Un test complet', xp: 40, target: 1 },
];

// ---------- Structura săptămânală (§22) ----------
export const WEEKLY_STRUCTURE: { day: number; titleRo: string; sessionHint: string }[] = [
  { day: 1, titleRo: 'Lecție nouă + conversație ghidată', sessionHint: 'guided' },
  { day: 2, titleRo: 'Gramatică și vocabular', sessionHint: 'daily' },
  { day: 3, titleRo: 'Scenariu real', sessionHint: 'roleplay' },
  { day: 4, titleRo: 'Pronunție și shadowing', sessionHint: 'pron' },
  { day: 5, titleRo: 'Conversație profesională', sessionHint: 'professional' },
  { day: 6, titleRo: 'Test conversațional', sessionHint: 'exam' },
  { day: 0, titleRo: 'Recapitulare, analiză și plan', sessionHint: 'review' },
];

// ---------- Programul extensibil, pornit de la structura inițială de 90 de zile (§21) ----------
export const DEFAULT_PROGRAM_DURATION_DAYS = 90;
export const PROGRAM_EXTENSION_DAYS = 30;

export function normalizeProgramDuration(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PROGRAM_DURATION_DAYS;
  return Math.max(
    DEFAULT_PROGRAM_DURATION_DAYS,
    Math.round(Number(value) / PROGRAM_EXTENSION_DAYS) * PROGRAM_EXTENSION_DAYS
  );
}

export function ninetyDayStage(daysSinceStart: number, durationDays = DEFAULT_PROGRAM_DURATION_DAYS): { stage: string; goalsRo: string[] } {
  const duration = normalizeProgramDuration(durationDays);
  const activeDayIndex = Math.min(Math.max(0, daysSinceStart), duration - 1);
  if (activeDayIndex < 30)
    return { stage: 'Zilele 1–30', goalsRo: ['eliminarea blocajului', 'răspunsuri simple', 'vocabular de bază activ', 'prezent și trecut corect', 'conversații de 5–10 minute'] };
  if (activeDayIndex < 60)
    return { stage: 'Zilele 31–60', goalsRo: ['răspunsuri mai lungi', 'conversații profesionale', 'reducerea pauzelor', 'Present Perfect', 'exprimarea opiniilor'] };
  if (activeDayIndex < 90)
    return { stage: 'Zilele 61–90', goalsRo: ['conversații spontane', 'ședințe simulate', 'interviuri', 'explicații clare', 'limbaj mai natural'] };

  const extensionIndex = Math.floor((activeDayIndex - 90) / PROGRAM_EXTENSION_DAYS);
  const start = 91 + extensionIndex * PROGRAM_EXTENSION_DAYS;
  const end = Math.min(start + PROGRAM_EXTENSION_DAYS - 1, duration);
  return {
    stage: `Extensie · zilele ${start}–${Math.max(start, end)}`,
    goalsRo: ['consolidarea nivelului actual', 'situații reale mai dificile', 'reducerea greșelilor recurente', 'vocabular activ mai bogat', 'fluență și autonomie'],
  };
}

// ---------- Propozițiile testului de pronunție din testul de nivel (§7.6) ----------
export const LEVEL_TEST_PRON_SENTENCES = [
  'I think this is the third time.',
  'She sells sheep and ships.',
  'We worked and walked yesterday.',
  'The vet checked the wet vest.',
  'How has your house helped you?',
  'I watched, waited and finished it.',
];
