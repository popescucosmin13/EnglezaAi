import type { CardEvaluation, CurriculumExercise, CurriculumLesson } from '../microlearning/types';
import { forYouExerciseLabel } from './exercise';
import type { ForYouCard } from './types';

export interface ForYouExplanation {
  eyebrow: string;
  title: string;
  summary: string;
  pattern?: string;
  example?: { en: string; ro?: string };
  pitfall?: string;
  memoryTip: string;
}

function firstText(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? 'Observă sensul, forma și contextul înainte să alegi răspunsul.';
}

function exercisePattern(exercise: CurriculumExercise): string {
  const patterns: Record<string, string> = {
    multiple_choice: 'Elimină opțiunile care schimbă timpul, persoana sau intenția propoziției. Varianta corectă trebuie să păstreze toate cele trei.',
    active_recall: 'Recuperează propoziția din memorie înainte să cauți indicii. Efortul de recuperare întărește accesul rapid la expresie.',
    sentence_order: 'Identifică mai întâi tipul propoziției. Într-o afirmație, tiparul de bază este subiect + auxiliar/verb + restul ideii; într-o întrebare, auxiliarul vine de regulă înaintea subiectului.',
    gap_fill: 'Citește cuvântul dinainte și cel de după spațiu. Ele îți arată ce categorie lipsește: auxiliar, verb, articol sau prepoziție.',
    translation: 'Tradu ideea și intenția, nu fiecare cuvânt separat. Verifică apoi ordinea naturală din engleză.',
    dictation: 'Ascultă propoziția în grupuri de sens, apoi reconstruiește forma. Cuvintele funcționale scurte sunt cele mai ușor de omis.',
    listening_comprehension: 'Caută informația cerută în întrebare, nu încerca să traduci fiecare sunet. Reține grupul de cuvinte din jurul ideii-cheie.',
    listening_checkpoint: 'Ascultă mai întâi sensul global, apoi forma exactă. A doua etapă fixează legătura dintre sunet și scriere.',
    quick_transfer: 'Păstrează structura învățată, dar schimbă detaliile astfel încât răspunsul să fie al tău.',
    transfer: 'Aplică același tipar într-un context nou. Dacă poți schimba situația fără să pierzi structura, regula începe să devină flexibilă.',
    targeted_retry: 'Reconstruiește mai întâi partea care ți-a creat dificultăți, apoi completează restul propoziției.',
    scenario_response: 'Construiește un răspuns complet: reacție potrivită situației + expresii țintă + suficiente detalii pentru a suna natural.',
    unseen_transfer: 'Alege singur contextul, dar păstrează funcția structurii: întrebare, experiență, comparație, condiție sau opinie.',
  };
  return patterns[exercise.type] ?? 'Separă sensul pe care vrei să-l transmiți de forma gramaticală folosită pentru a-l exprima.';
}

function exercisePitfall(exercise: CurriculumExercise): string {
  const pitfalls: Record<string, string> = {
    multiple_choice: 'Două variante pot conține cuvinte corecte, dar numai una poate corespunde exact contextului cerut.',
    sentence_order: 'Nu păstra automat ordinea din română și nu așeza punctuația ca pe un cuvânt obișnuit.',
    gap_fill: 'Nu completa doar după sens; forma verbului și acordul pot elimina o variantă aparent logică.',
    translation: 'O traducere literală poate fi inteligibilă, dar nenaturală în engleză.',
    dictation: 'Nu inventa un cuvânt doar pentru că se potrivește sensului; verifică sunetul și structura.',
    listening_comprehension: 'Dacă traduci mental fiecare cuvânt, poți pierde exact informația următoare.',
    listening_checkpoint: 'Nu confunda ceea ce te așteptai să auzi cu ceea ce s-a spus efectiv.',
    scenario_response: 'Un singur enunț corect poate fi prea puțin dacă situația cere un răspuns dezvoltat.',
  };
  return pitfalls[exercise.type] ?? 'Nu memora doar răspunsul-model; observă tiparul ca să-l poți refolosi în alt context.';
}

function exerciseMemoryTip(exercise: CurriculumExercise): string {
  if (exercise.type === 'sentence_order') return 'După verificare, ascunde răspunsul și reconstruiește propoziția încă o dată fără elemente.';
  if (exercise.type === 'dictation' || exercise.type.startsWith('listening_')) return 'Repetă propoziția cu voce tare în același ritm, apoi scrie-o o dată din memorie.';
  if (exercise.type === 'gap_fill') return 'Spune propoziția completă, nu doar cuvântul lipsă. Memoria reține mai bine grupul întreg.';
  if (exercise.type === 'multiple_choice') return 'Explică într-o propoziție de ce fiecare variantă greșită nu se potrivește.';
  return 'Creează imediat un exemplu personal cu același tipar și spune-l cu voce tare.';
}

function curriculumExplanation(
  card: Extract<ForYouCard, { kind: 'quiz' | 'listening' }>,
  answered: boolean,
): ForYouExplanation {
  const { exercise, lesson } = card;
  const expected = exercise.answer
    ?? exercise.full_answer
    ?? exercise.accepted_answers?.[0]
    ?? exercise.model_answers?.[0];
  return {
    eyebrow: forYouExerciseLabel(exercise),
    title: answered ? 'Cum funcționează răspunsul' : 'Cum să gândești exercițiul',
    summary: firstText(exercise.model_note_ro, lesson.explanation_ro, lesson.objective_ro, lesson.purpose_ro),
    pattern: exercisePattern(exercise),
    example: answered && expected ? { en: expected } : undefined,
    pitfall: exercisePitfall(exercise),
    memoryTip: exerciseMemoryTip(exercise),
  };
}

export function buildForYouExplanation(card: ForYouCard, answered: boolean): ForYouExplanation {
  if (card.kind === 'quiz' || card.kind === 'listening') return curriculumExplanation(card, answered);
  if (card.kind === 'discovery') return answered ? {
    eyebrow: 'Idee + limbă',
    title: 'De ce merită reținut',
    summary: card.discovery.supportRo,
    pattern: `Ideea centrală poate fi rezumată într-o singură propoziție: “${card.discovery.takeawayEn}”`,
    example: { en: card.discovery.standardEn, ro: card.discovery.prediction.revealRo },
    pitfall: 'Nu memora doar cifra sau surpriza; leagă faptul de cauza explicată în text.',
    memoryTip: 'Închide explicația și povestește faptul în engleză unei persoane imaginare, folosind două cuvinte noi.',
  } : {
    eyebrow: 'Strategie de învățare',
    title: 'De ce începe cu o predicție',
    summary: 'Predicția îți activează cunoștințele existente și îți dă un motiv concret să cauți răspunsul în text.',
    pattern: 'Ghicește → citește activ → verifică → explică în propriile cuvinte.',
    pitfall: 'Predicția nu este evaluată și nu consumă XP. Nu încerca să găsești răspunsul înainte să alegi.',
    memoryTip: 'Formulează rapid motivul alegerii tale; vei observa mai ușor ce informație nouă schimbă acea idee.',
  };
  if (card.kind === 'phrase') return {
    eyebrow: 'Expresie naturală',
    title: 'Sensul din spatele expresiei',
    summary: firstText(card.lesson.purpose_ro, card.lesson.scenario_ro, card.lesson.objective_ro),
    pattern: card.lesson.explanation_ro,
    example: { en: card.english, ro: card.romanian },
    pitfall: 'Nu înlocui fiecare cuvânt cu echivalentul românesc; păstrează expresia ca un singur bloc de limbă.',
    memoryTip: 'Schimbă un singur detaliu din propoziție și repet-o de trei ori cu ritm natural.',
  };
  if (card.kind === 'dialogue') return {
    eyebrow: 'Conversație reală',
    title: 'Ce face dialogul să sune natural',
    summary: firstText(card.lesson.scenario_ro, card.lesson.purpose_ro, card.lesson.objective_ro),
    pattern: card.lesson.explanation_ro,
    example: { en: card.lines.map((line) => `${line.speaker}: ${line.text}`).join(' / ') },
    pitfall: 'Nu învăța replicile izolat; fiecare răspuns depinde de intenția replicii anterioare.',
    memoryTip: 'Acoperă a doua replică, răspunde tu, apoi compară ritmul și formularea.',
  };
  if (card.kind === 'insight') return {
    eyebrow: 'Tipar de limbă',
    title: 'Regula, explicată în context',
    summary: firstText(card.lesson.objective_ro, card.lesson.purpose_ro),
    pattern: card.rule,
    example: { en: card.example, ro: card.translation },
    pitfall: 'O regulă recunoscută nu este încă o regulă activă; trebuie folosită într-o propoziție nouă.',
    memoryTip: 'Creează o pereche: un exemplu corect și unul intenționat greșit, apoi explică diferența.',
  };
  if (card.kind === 'story') return {
    eyebrow: 'Înțelegere din context',
    title: answered ? 'Indiciul care duce la răspuns' : 'Cum să urmărești povestea',
    summary: answered
      ? `Răspunsul este „${card.episode.answer}”; caută propoziția care îl afirmă sau îl implică direct.`
      : 'Urmărește cine face acțiunea, unde se află și ce se schimbă de la o propoziție la alta.',
    pattern: `Expresii utile: ${card.episode.targetPhrases.join(' · ')}`,
    example: answered ? { en: card.episode.text } : undefined,
    pitfall: 'Nu alege doar un cuvânt pe care l-ai văzut în text; verifică dacă răspunde exact întrebării.',
    memoryTip: 'Rezuma episodul în două propoziții, fără să recitești textul.',
  };
  if (card.kind === 'mistake') {
    const deepDive = card.mistake.deepDive;
    return {
      eyebrow: 'Greșeală personală',
      title: answered ? 'De ce forma corectă se potrivește aici' : 'Ce trebuie să observi în context',
      summary: answered ? card.mistake.explanationRo : 'Identifică timpul, persoana și intenția situației salvate înainte să compari formele.',
      pattern: deepDive?.ruleRo ?? `Categoria acestei capcane este „${card.mistake.category.replaceAll('_', ' ')}”.`,
      example: answered ? { en: card.mistake.correctFragment ?? card.mistake.corrected } : undefined,
      pitfall: deepDive?.interferenceRo ?? 'Cealaltă formă poate fi corectă în alt context; nu transforma această corectură într-o regulă absolută.',
      memoryTip: deepDive?.examples?.[0]
        ? `Compară cu: “${deepDive.examples[0].en}” — ${deepDive.examples[0].ro}`
        : 'Creează două contexte scurte în care formele diferite ar fi corecte.',
    };
  }
  if (card.kind === 'vocab') return answered ? {
    eyebrow: 'Vocabular activ',
    title: `“${card.vocab.word}” în context`,
    summary: `Înseamnă „${card.vocab.translation}”, dar devine vocabular activ doar când îl produci fără indiciu.`,
    pattern: card.vocab.synonyms?.length ? `Sinonime apropiate: ${card.vocab.synonyms.join(', ')}.` : 'Învață expresia împreună cu substantivele sau verbele care apar natural lângă ea.',
    example: { en: card.vocab.personalExample || card.vocab.example },
    pitfall: card.vocab.opposite ? `Nu o confunda cu opusul ei: ${card.vocab.opposite}.` : 'Recunoașterea la citire nu garantează că o vei putea folosi spontan.',
    memoryTip: 'Scrie o propoziție adevărată despre tine și folosește expresia din nou mâine, într-un context diferit.',
  } : {
    eyebrow: 'Strategie de vocabular',
    title: 'Cum recuperezi expresia fără să vezi răspunsul',
    summary: `Pornește de la sensul „${card.vocab.translation}” și imaginează o situație concretă în care ai spune asta.`,
    pattern: 'Sens → situație → începutul propoziției → expresia engleză.',
    pitfall: 'Nu deschide explicația ca să cauți forma engleză; folosește mai întâi contextul ca indiciu.',
    memoryTip: 'Dacă nu apare imediat, încearcă să-ți amintești propoziția în care ai salvat expresia.',
  };
  return {
    eyebrow: 'Explicație',
    title: 'Cum să gândești cardul',
    summary: 'Leagă sensul cerut de forma engleză și verifică întotdeauna contextul complet.',
    pattern: 'Sens → context → structură → verificare.',
    pitfall: 'Nu alege o formă doar pentru că pare familiară.',
    memoryTip: 'Reformulează ideea într-un exemplu personal imediat după card.',
  };
}

export function curriculumFeedback(
  exercise: CurriculumExercise,
  lesson: CurriculumLesson,
  result: CardEvaluation,
): string {
  const expected = result.expected;
  if (exercise.type === 'sentence_order') {
    const expectedWithTerminalPunctuation = /[.!?]$/.test(expected) ? expected : `${expected}.`;
    return result.correct
      ? `Ai reconstruit tiparul corect: “${expectedWithTerminalPunctuation}” Observă ordinea grupurilor, nu doar ordinea cuvintelor individuale.`
      : `Ordinea recomandată este “${expectedWithTerminalPunctuation}” Identifică subiectul și verbul/auxiliarul, apoi atașează restul ideii.`;
  }
  if (exercise.type === 'gap_fill') {
    return result.correct
      ? `“${expected}” completează atât sensul, cât și structura. Spune acum propoziția întreagă ca să fixezi grupul de cuvinte.`
      : `Aici se potrivește “${expected}”. Verifică acordul și cuvintele aflate imediat înainte și după spațiu.`;
  }
  if (exercise.type === 'multiple_choice') {
    return result.correct
      ? `“${expected}” păstrează sensul și intenția cerute. Compară timpul și persoana cu celelalte variante.`
      : `Varianta potrivită este “${expected}”. Celelalte opțiuni schimbă sensul, timpul sau persoana.`;
  }
  if (exercise.type === 'dictation' || exercise.type.startsWith('listening_')) {
    return result.correct
      ? `Ai identificat corect grupul sonor: “${expected}”. Repetă-l o dată cu același ritm.`
      : `Forma auzită este “${expected}”. Ascultă din nou grupurile scurte și cuvintele funcționale.`;
  }
  if (['quick_transfer', 'transfer', 'scenario_response', 'unseen_transfer'].includes(exercise.type)) {
    return result.correct
      ? `Răspunsul tău folosește suficient din tiparul țintă. Compară-l cu modelul “${expected}”, fără să-l copiezi mecanic.`
      : `Răspunsul are nevoie de o legătură mai clară cu tiparul lecției. Un model posibil este “${expected}”. ${lesson.objective_ro}`;
  }
  return result.correct
    ? `Răspunsul este corect. Observă forma completă “${expected}” și refolosește tiparul într-un exemplu personal.`
    : `Varianta recomandată este “${expected}”. ${firstText(exercise.model_note_ro, lesson.explanation_ro)}`;
}
