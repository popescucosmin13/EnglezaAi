import type { Cefr, Profile } from '../types';
import type { DiscoveryLesson, DiscoveryTopic, ForYouState } from './types';

export const DISCOVERY_TOPICS: Record<DiscoveryTopic, { label: string; emoji: string; description: string }> = {
  space: { label: 'Spațiu', emoji: '🪐', description: 'Planete, explorare și univers' },
  mind: { label: 'Minte', emoji: '🧠', description: 'Memorie, somn și învățare' },
  technology: { label: 'Tehnologie', emoji: '💻', description: 'Invenții care schimbă lumea' },
  earth: { label: 'Pământ', emoji: '🌍', description: 'Oceane și planeta vie' },
  nature: { label: 'Natură', emoji: '🌱', description: 'Sisteme naturale surprinzătoare' },
  society: { label: 'Societate', emoji: '🏛️', description: 'Bani, idei și oameni' },
};

export const DISCOVERY_LESSONS: DiscoveryLesson[] = [
  {
    id: 'venus-long-day', topic: 'space',
    titleRo: 'O zi mai lungă decât un an', titleEn: 'A day longer than a year',
    hookEn: 'On one planet, tomorrow arrives after next year.',
    prediction: {
      promptRo: 'Pe Venus, ce durează mai mult?', options: ['O zi', 'Un an', 'Durează la fel'], answer: 'O zi',
      revealRo: 'O rotație durează 243 de zile terestre, iar un an venusian doar 225.',
    },
    easyEn: 'Venus turns very slowly. One day on Venus lasts 243 Earth days, but one year lasts only 225 Earth days.',
    standardEn: 'Venus rotates so slowly that one complete day takes 243 Earth days. Yet it travels around the Sun in only 225 Earth days, so its day is longer than its year.',
    challengeEn: 'Venus has an exceptionally slow, retrograde rotation: a complete rotation takes 243 Earth days, while its orbit lasts roughly 225.',
    supportRo: 'Venus se rotește extrem de lent și în sens opus majorității planetelor.',
    vocabulary: [
      { word: 'to rotate', translation: 'a se roti', meaningEn: 'to turn around a central point' },
      { word: 'to last', translation: 'a dura', meaningEn: 'to continue for a period of time' },
      { word: 'orbit', translation: 'orbită', meaningEn: 'the path around a planet or star' },
    ],
    check: {
      promptRo: 'Completează ideea: “A Venusian day ___ longer than its year.”',
      options: ['is', 'are', 'has'], answer: 'is', explanationRo: '„Day” este singular, deci folosim „is”. Ai fixat simultan faptul și structura.',
    },
    takeawayEn: 'A day on Venus is longer than a year on Venus.',
    source: { label: 'NASA — Venus Facts', url: 'https://science.nasa.gov/venus/venus-facts/', checkedAt: '2026-08-11' },
  },
  {
    id: 'iss-sunrises', topic: 'space',
    titleRo: '16 răsărituri într-o zi', titleEn: 'Sixteen sunrises a day',
    hookEn: 'Imagine seeing another sunrise every ninety minutes.',
    prediction: {
      promptRo: 'Câte răsărituri văd astronauții de pe ISS în 24 de ore?', options: ['2', '8', '16'], answer: '16',
      revealRo: 'Stația înconjoară Pământul aproximativ o dată la 90 de minute.',
    },
    easyEn: 'The space station goes around Earth every 90 minutes. Astronauts see 16 sunrises and 16 sunsets each day.',
    standardEn: 'The International Space Station orbits Earth about once every 90 minutes. As a result, its crew experiences sixteen sunrises and sixteen sunsets in just 24 hours.',
    challengeEn: 'Travelling at about 28,000 kilometres per hour, the ISS completes roughly sixteen orbits—and crosses day and night sixteen times—every 24 hours.',
    supportRo: 'Viteza orbitală foarte mare comprimă ciclul aparent zi-noapte.',
    vocabulary: [
      { word: 'sunrise', translation: 'răsărit', meaningEn: 'the time when the Sun appears' },
      { word: 'crew', translation: 'echipaj', meaningEn: 'the people working on a vehicle' },
      { word: 'to orbit', translation: 'a orbita', meaningEn: 'to travel around an object in space' },
    ],
    check: {
      promptRo: 'De ce văd astronauții atât de multe răsărituri?',
      options: ['ISS orbitează foarte repede', 'Soarele se mișcă mai repede', 'Ziua terestră e mai scurtă'],
      answer: 'ISS orbitează foarte repede', explanationRo: 'Stația face aproximativ 16 orbite în 24 de ore.',
    },
    takeawayEn: 'Astronauts on the ISS experience sixteen sunrises every day.',
    source: { label: 'NASA — Space Station Facts', url: 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/', checkedAt: '2026-08-11' },
  },
  {
    id: 'moon-drifting-away', topic: 'space',
    titleRo: 'Luna se îndepărtează', titleEn: 'The Moon is drifting away',
    hookEn: 'The Moon is a little farther away every year.',
    prediction: {
      promptRo: 'Cu cât se îndepărtează Luna anual?', options: ['Aproximativ 4 cm', 'Aproximativ 4 m', 'Aproximativ 4 km'], answer: 'Aproximativ 4 cm',
      revealRo: 'Măsurătorile indică aproximativ 3,78 centimetri pe an.',
    },
    easyEn: 'The Moon moves away from Earth by about 3.8 centimetres each year. Ocean tides help cause this slow change.',
    standardEn: 'The Moon is gradually moving away from Earth at about 3.8 centimetres per year. The interaction between Earth’s tides and the Moon transfers energy and slowly changes its orbit.',
    challengeEn: 'Tidal interactions transfer angular momentum from Earth to the Moon, causing its orbit to expand by roughly 3.8 centimetres annually.',
    supportRo: 'Efectul este minuscul într-un an, dar important pe intervale geologice.',
    vocabulary: [
      { word: 'gradually', translation: 'treptat', meaningEn: 'slowly, over a period of time' },
      { word: 'tide', translation: 'maree', meaningEn: 'the regular rise and fall of the sea' },
      { word: 'to drift', translation: 'a se deplasa lent', meaningEn: 'to move slowly without a sudden change' },
    ],
    check: {
      promptRo: 'Care propoziție păstrează sensul corect?',
      options: ['The Moon is gradually moving away.', 'The Moon suddenly disappeared.', 'The Moon moves four kilometres a year.'],
      answer: 'The Moon is gradually moving away.', explanationRo: '„Gradually” exprimă o schimbare lentă și continuă.',
    },
    takeawayEn: 'The Moon drifts about 3.8 centimetres farther from Earth each year.',
    source: { label: 'NASA — What the Moon teaches us', url: 'https://science.nasa.gov/solar-system/moon/10-things-what-we-learn-about-earth-by-studying-the-moon/', checkedAt: '2026-08-11' },
  },
  {
    id: 'moon-far-side', topic: 'space',
    titleRo: 'Nu există „partea întunecată”', titleEn: 'There is no permanent dark side',
    hookEn: 'The side we never see still receives sunlight.',
    prediction: {
      promptRo: 'Partea îndepărtată a Lunii primește lumină solară?', options: ['Da', 'Nu', 'Doar o dată pe an'], answer: 'Da',
      revealRo: 'Primește la fel de multă lumină; noi vedem aceeași emisferă din cauza rotației sincronizate.',
    },
    easyEn: 'We always see the same side of the Moon. The far side is not always dark; it also has day and night.',
    standardEn: 'The Moon keeps the same hemisphere facing Earth because its rotation matches its orbit. The far side still receives sunlight, so “the dark side” is a misleading name.',
    challengeEn: 'Tidal locking keeps one lunar hemisphere oriented toward Earth, but both hemispheres experience sunlight during each orbit.',
    supportRo: '„Far side” înseamnă partea îndepărtată, nu o zonă permanent lipsită de lumină.',
    vocabulary: [
      { word: 'far side', translation: 'partea îndepărtată', meaningEn: 'the side facing away from us' },
      { word: 'to face', translation: 'a fi orientat spre', meaningEn: 'to have the front directed toward something' },
      { word: 'misleading', translation: 'înșelător', meaningEn: 'likely to create a wrong idea' },
    ],
    check: {
      promptRo: 'De ce este „dark side” o expresie înșelătoare?',
      options: ['Și partea îndepărtată primește lumină', 'Luna produce lumină', 'Vedem ambele părți în fiecare noapte'],
      answer: 'Și partea îndepărtată primește lumină', explanationRo: '„Far side” este termenul precis în engleză.',
    },
    takeawayEn: 'The Moon’s far side receives sunlight too.',
    source: { label: 'NASA — Moon Facts', url: 'https://science.nasa.gov/moon/facts/', checkedAt: '2026-08-11' },
  },
  {
    id: 'web-born-at-cern', topic: 'technology',
    titleRo: 'Web-ul s-a născut într-un laborator', titleEn: 'The web was born in a laboratory',
    hookEn: 'A tool built for scientists became a tool for everyone.',
    prediction: {
      promptRo: 'Unde a fost inventat World Wide Web?', options: ['La CERN', 'La NASA', 'În Silicon Valley'], answer: 'La CERN',
      revealRo: 'Tim Berners-Lee l-a inventat la CERN în 1989 pentru schimbul de informații între cercetători.',
    },
    easyEn: 'Tim Berners-Lee invented the World Wide Web at CERN in 1989. He wanted scientists to share information more easily.',
    standardEn: 'In 1989, Tim Berners-Lee proposed the World Wide Web while working at CERN. His goal was to help scientists at universities and institutes share information automatically.',
    challengeEn: 'Berners-Lee designed the web at CERN as a distributed information system, combining hypertext with the internet to connect research documents.',
    supportRo: 'Internetul exista deja; Web-ul a adăugat pagini și linkuri ușor de conectat și accesat.',
    vocabulary: [
      { word: 'to invent', translation: 'a inventa', meaningEn: 'to create something for the first time' },
      { word: 'to share', translation: 'a distribui / împărtăși', meaningEn: 'to give access to other people' },
      { word: 'researcher', translation: 'cercetător', meaningEn: 'a person who studies a subject carefully' },
    ],
    check: {
      promptRo: 'Care era problema inițială pe care Web-ul încerca să o rezolve?',
      options: ['Schimbul de informații', 'Editarea fotografiilor', 'Cumpărăturile online'],
      answer: 'Schimbul de informații', explanationRo: 'Scopul inițial era conectarea informațiilor folosite de cercetători.',
    },
    takeawayEn: 'The web was invented to help researchers share information.',
    source: { label: 'CERN — The birth of the Web', url: 'https://home.cern/science/computing/the-birth-of-the-web/where-web-was-born/', checkedAt: '2026-08-11' },
  },
  {
    id: 'gps-relativity', topic: 'technology',
    titleRo: 'GPS-ul are nevoie de Einstein', titleEn: 'GPS needs Einstein',
    hookEn: 'Your map works because satellite clocks do not tick like clocks on Earth.',
    prediction: {
      promptRo: 'Ce ar face GPS-ul fără corecții relativiste?', options: ['Ar acumula erori', 'Ar funcționa identic', 'Ar consuma mai puțină baterie'], answer: 'Ar acumula erori',
      revealRo: 'Viteza sateliților și gravitația diferită schimbă ritmul ceasurilor lor.',
    },
    easyEn: 'GPS satellites carry very accurate clocks. Their clocks tick differently from clocks on Earth, so the system must correct the difference.',
    standardEn: 'GPS calculates position from extremely precise timing signals. Because motion and gravity affect satellite clocks differently, engineers include corrections predicted by Einstein’s theories of relativity.',
    challengeEn: 'Both special- and general-relativistic effects alter the rate of GPS satellite clocks, so the navigation system must compensate for their combined offset.',
    supportRo: 'O diferență minusculă de timp devine o eroare mare de poziție deoarece semnalul călătorește cu viteza luminii.',
    vocabulary: [
      { word: 'accurate', translation: 'precis', meaningEn: 'correct and exact' },
      { word: 'to tick', translation: 'a ticăi / a măsura timpul', meaningEn: 'to mark the passing of time' },
      { word: 'to adjust', translation: 'a ajusta', meaningEn: 'to change slightly for accuracy' },
    ],
    check: {
      promptRo: 'Ce este esențial pentru calcularea poziției prin GPS?',
      options: ['Măsurarea foarte precisă a timpului', 'Temperatura telefonului', 'Culoarea satelitului'],
      answer: 'Măsurarea foarte precisă a timpului', explanationRo: 'GPS transformă diferențele de timp în distanțe.',
    },
    takeawayEn: 'GPS stays accurate by correcting the clocks in its satellites.',
    source: { label: 'NIST — Relativity in the Global Positioning System', url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/TN/nbstechnicalnote1385.pdf', checkedAt: '2026-08-11' },
  },
  {
    id: 'sleep-builds-memory', topic: 'mind',
    titleRo: 'Creierul lucrează când dormi', titleEn: 'Your brain works while you sleep',
    hookEn: 'Sleep is not a pause button for the brain.',
    prediction: {
      promptRo: 'Ce se întâmplă cu informațiile noi în timpul somnului?', options: ['Sunt consolidate în memorie', 'Sunt șterse automat', 'Nu se schimbă nimic'], answer: 'Sunt consolidate în memorie',
      revealRo: 'Fazele somnului contribuie la învățare și la formarea amintirilor.',
    },
    easyEn: 'Your brain stays active while you sleep. Different sleep stages help you learn and form memories.',
    standardEn: 'Sleep is an active biological process, not simply a period of rest. Different stages of sleep help the brain process learning and form new memories.',
    challengeEn: 'Across different sleep stages, the brain carries out processes that support learning, memory formation and physical restoration.',
    supportRo: 'De aceea, somnul face parte din învățare; nu este doar timpul dintre două sesiuni.',
    vocabulary: [
      { word: 'sleep stage', translation: 'fază a somnului', meaningEn: 'one part of the sleep cycle' },
      { word: 'to form', translation: 'a forma', meaningEn: 'to create or develop' },
      { word: 'rest', translation: 'odihnă', meaningEn: 'a period without normal activity' },
    ],
    check: {
      promptRo: 'Alege concluzia susținută de text.',
      options: ['Sleep supports learning.', 'The brain turns off during sleep.', 'Only deep sleep matters.'],
      answer: 'Sleep supports learning.', explanationRo: 'Textul afirmă că mai multe faze ale somnului ajută învățarea și memoria.',
    },
    takeawayEn: 'Sleep is an active part of learning and memory.',
    source: { label: 'NIH — What happens during sleep?', url: 'https://www.nichd.nih.gov/health/topics/sleep/conditioninfo/what-happens', checkedAt: '2026-08-11' },
  },
  {
    id: 'retrieval-practice', topic: 'mind',
    titleRo: 'Testarea poate fi învățare', titleEn: 'Testing can be learning',
    hookEn: 'Trying to remember can be more useful than reading again.',
    prediction: {
      promptRo: 'Ce întărește de obicei memoria pe termen lung?', options: ['Să încerci să-ți amintești', 'Să recitești pasiv', 'Să subliniezi tot'], answer: 'Să încerci să-ți amintești',
      revealRo: 'Cercetările despre retrieval practice arată beneficii mari față de simpla recitire.',
    },
    easyEn: 'Do not only read the same page again. Close it and try to remember the main idea. This effort can make learning stronger.',
    standardEn: 'Retrieval practice means actively bringing information back from memory. Research shows that this effort can improve long-term learning more than repeatedly studying the same material.',
    challengeEn: 'Actively reconstructing knowledge through retrieval practice produces durable learning gains that often exceed those from repeated restudy.',
    supportRo: 'Întrebarea de la finalul fiecărei lecții este parte din învățare, nu doar o notă.',
    vocabulary: [
      { word: 'to retrieve', translation: 'a recupera din memorie', meaningEn: 'to bring stored information back' },
      { word: 'effort', translation: 'efort', meaningEn: 'physical or mental work' },
      { word: 'long-term', translation: 'pe termen lung', meaningEn: 'continuing far into the future' },
    ],
    check: {
      promptRo: 'Care acțiune este retrieval practice?',
      options: ['Închizi textul și explici ideea', 'Recitești aceeași frază', 'Colorezi titlul'],
      answer: 'Închizi textul și explici ideea', explanationRo: 'Trebuie să reconstruiești informația din memorie.',
    },
    takeawayEn: 'Trying to retrieve an idea helps make the memory stronger.',
    source: { label: 'PubMed — Retrieval practice and meaningful learning', url: 'https://pubmed.ncbi.nlm.nih.gov/21252317/', checkedAt: '2026-08-11' },
  },
  {
    id: 'plates-fingernails', topic: 'earth',
    titleRo: 'Continentele se mișcă acum', titleEn: 'Continents are moving now',
    hookEn: 'The ground feels still, but the plates beneath it never stop.',
    prediction: {
      promptRo: 'Cu ce viteză se mișcă de obicei plăcile tectonice?', options: ['Ca unghiile tale', 'Ca un tren', 'Ca un melc'], answer: 'Ca unghiile tale',
      revealRo: 'Majoritatea se deplasează cu câțiva centimetri pe an, aproximativ cât cresc unghiile.',
    },
    easyEn: 'Tectonic plates move a few centimetres each year. That is about as fast as your fingernails grow.',
    standardEn: 'Earth’s tectonic plates usually move only a few centimetres per year—roughly the speed at which fingernails grow. GPS can detect even these tiny changes.',
    challengeEn: 'Although tectonic motion is imperceptible from day to day, geodetic GPS can measure plate velocities down to fractions of a millimetre per year.',
    supportRo: 'Mișcarea lentă, acumulată milioane de ani, schimbă oceane și continente.',
    vocabulary: [
      { word: 'beneath', translation: 'dedesubt', meaningEn: 'under something' },
      { word: 'roughly', translation: 'aproximativ', meaningEn: 'not exactly, but close' },
      { word: 'to detect', translation: 'a detecta', meaningEn: 'to discover something difficult to notice' },
    ],
    check: {
      promptRo: 'Ce înseamnă „roughly the speed” aici?', options: ['Aproximativ aceeași viteză', 'O viteză periculoasă', 'Exact aceeași distanță'],
      answer: 'Aproximativ aceeași viteză', explanationRo: '„Roughly” introduce o aproximație, nu o egalitate exactă.',
    },
    takeawayEn: 'Tectonic plates move about as fast as fingernails grow.',
    source: { label: 'USGS — How fast do tectonic plates move?', url: 'https://www.usgs.gov/faqs/how-fast-do-tectonic-plates-move', checkedAt: '2026-08-11' },
  },
  {
    id: 'ocean-unseen', topic: 'earth',
    titleRo: 'Planeta încă are o lume nevăzută', titleEn: 'Most of the deep ocean is still unseen',
    hookEn: 'We have mapped much more than we have actually seen.',
    prediction: {
      promptRo: 'Cât din fundul oceanului adânc au văzut direct oamenii?', options: ['Sub 0,001%', 'Aproximativ 10%', 'Peste 50%'], answer: 'Sub 0,001%',
      revealRo: 'NOAA estimează că am observat vizual mai puțin de 0,001% din fundul oceanului adânc.',
    },
    easyEn: 'Scientists can map the ocean from ships, but seeing it directly is harder. Humans have seen less than 0.001 percent of the deep seafloor.',
    standardEn: 'Mapping the seafloor and visually exploring it are different tasks. By April 2026, modern high-resolution maps covered 28.7% of the global seafloor, while humans had seen less than 0.001% of the deep-ocean floor.',
    challengeEn: 'Remote mapping has advanced rapidly, yet direct visual observation remains extraordinarily sparse: less than one-thousandth of one percent of the deep seafloor.',
    supportRo: 'Datele procentuale sunt marcate cu momentul măsurării: aprilie 2026.',
    vocabulary: [
      { word: 'seafloor', translation: 'fundul mării', meaningEn: 'the ground at the bottom of the sea' },
      { word: 'to map', translation: 'a cartografia', meaningEn: 'to record the shape and position of an area' },
      { word: 'directly', translation: 'direct', meaningEn: 'without something in between' },
    ],
    check: {
      promptRo: 'Care este diferența-cheie din text?', options: ['A cartografia nu înseamnă a vedea direct', 'Oceanele nu pot fi măsurate', 'Doar sateliții văd oceanul'],
      answer: 'A cartografia nu înseamnă a vedea direct', explanationRo: 'Hărțile pot fi create cu instrumente fără observație vizuală directă.',
    },
    takeawayEn: 'Mapping the ocean is not the same as seeing it directly.',
    source: { label: 'NOAA Ocean Exploration — How much is explored?', url: 'https://oceanexplorer.noaa.gov/ocean-fact/explored/', checkedAt: '2026-08-11' },
  },
  {
    id: 'ocean-oxygen', topic: 'nature',
    titleRo: 'Respiri și datorită oceanului', titleEn: 'The ocean helps you breathe',
    hookEn: 'Some of the oxygen in your next breath began in the ocean.',
    prediction: {
      promptRo: 'Cât din oxigenul lumii produce oceanul?', options: ['Peste jumătate', 'Aproximativ 5%', 'Deloc'], answer: 'Peste jumătate',
      revealRo: 'Organisme marine fotosintetice contribuie la peste jumătate din oxigenul produs la nivel global.',
    },
    easyEn: 'Tiny organisms in the ocean use sunlight to make oxygen. The ocean produces more than half of the world’s oxygen.',
    standardEn: 'Photosynthetic organisms in the ocean—including microscopic phytoplankton—produce more than half of the world’s oxygen. The ocean also stores far more carbon dioxide than the atmosphere.',
    challengeEn: 'Marine photosynthesis contributes over half of global oxygen production, while the ocean acts as a vast reservoir for carbon dioxide.',
    supportRo: 'Nu doar pădurile: fitoplanctonul microscopic are un rol uriaș în sistemul planetei.',
    vocabulary: [
      { word: 'tiny', translation: 'minuscul', meaningEn: 'extremely small' },
      { word: 'to produce', translation: 'a produce', meaningEn: 'to make or create' },
      { word: 'to store', translation: 'a stoca', meaningEn: 'to keep for future use' },
    ],
    check: {
      promptRo: 'Ce organisme sunt menționate ca producători importanți?', options: ['Phytoplankton', 'Deep-sea fish', 'Coral only'],
      answer: 'Phytoplankton', explanationRo: 'Fitoplanctonul folosește fotosinteza și produce oxigen.',
    },
    takeawayEn: 'Ocean organisms produce more than half of the world’s oxygen.',
    source: { label: 'NOAA Ocean Exploration — Why the ocean matters', url: 'https://oceanexplorer.noaa.gov/explainers/intro/', checkedAt: '2026-08-11' },
  },
  {
    id: 'banks-create-money', topic: 'society',
    titleRo: 'Băncile creează bani când împrumută', titleEn: 'Banks create money when they lend',
    hookEn: 'Most money is not paper, and it does not begin at a printing press.',
    prediction: {
      promptRo: 'Ce se întâmplă când o bancă acordă un împrumut?', options: ['Creează și un depozit nou', 'Mută neapărat bancnote existente', 'Nu schimbă masa monetară'], answer: 'Creează și un depozit nou',
      revealRo: 'Banca înscrie simultan împrumutul și un depozit electronic în contul clientului.',
    },
    easyEn: 'Most money is electronic. When a bank gives a loan, it creates a new deposit in the customer’s account. It creates money, but not wealth, because the customer also has a debt.',
    standardEn: 'Commercial banks create much of the money used in the economy when they make loans. A new loan is matched by a new deposit in the borrower’s account; repaying the loan removes that electronic money.',
    challengeEn: 'Bank lending expands deposit money by creating a matching asset and liability, although regulation, profitability and monetary policy constrain the process.',
    supportRo: 'A crea bani nu înseamnă a crea avere: împrumutatul primește și o datorie egală.',
    vocabulary: [
      { word: 'loan', translation: 'împrumut', meaningEn: 'money that must be paid back' },
      { word: 'borrower', translation: 'debitor / împrumutat', meaningEn: 'a person who receives a loan' },
      { word: 'to repay', translation: 'a rambursa', meaningEn: 'to pay borrowed money back' },
    ],
    check: {
      promptRo: 'De ce împrumutul nu îl face automat mai bogat pe client?', options: ['Primește și o datorie', 'Banii nu pot fi cheltuiți', 'Depozitul este numerar'],
      answer: 'Primește și o datorie', explanationRo: 'Contul crește, dar apare simultan obligația de rambursare.',
    },
    takeawayEn: 'A bank loan creates a deposit and a matching debt.',
    source: { label: 'Bank of England — How is money created?', url: 'https://www.bankofengland.co.uk/explainers/how-is-money-created', checkedAt: '2026-08-11' },
  },
];

export function discoveryArticle(lesson: DiscoveryLesson, level: Cefr): string {
  if (level === 'A1' || level === 'A2') return lesson.easyEn;
  if ((level === 'C1' || level === 'C2') && lesson.challengeEn) return lesson.challengeEn;
  return lesson.standardEn;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase('ro-RO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

type DiscoveryProfileSignals = Pick<Profile, 'interests' | 'mainObjective'>;

export function discoveryTopicForInterests(profile: DiscoveryProfileSignals, topic: DiscoveryTopic): number {
  const text = normalize([...profile.interests, profile.mainObjective].join(' '));
  const keywords: Record<DiscoveryTopic, string[]> = {
    space: ['spatiu', 'astronomie', 'univers', 'stiinta'],
    mind: ['psihologie', 'minte', 'creier', 'sanatate', 'invatare'],
    technology: ['tehnologie', 'it', 'programare', 'calculatoare', 'software'],
    earth: ['geografie', 'planeta', 'geologie', 'ocean', 'stiinta'],
    nature: ['natura', 'biologie', 'animale', 'mediu', 'stiinta'],
    society: ['business', 'economie', 'istorie', 'societate', 'bani'],
  };
  return keywords[topic].filter((keyword) => text.includes(keyword)).length;
}

export function discoveryScore(lesson: DiscoveryLesson, profile: DiscoveryProfileSignals, state: ForYouState): number {
  const memory = state.discovery[lesson.id];
  const followed = state.followedTopics.includes(lesson.topic) ? 5 : 0;
  const affinity = state.topicAffinity[lesson.topic] ?? 0;
  const interest = discoveryTopicForInterests(profile, lesson.topic) * 1.8;
  const novelty = memory ? Math.max(-3, 2 - memory.views * 0.7) : 4;
  const due = memory?.nextReviewAt && memory.nextReviewAt <= new Date().toISOString() ? 3 : 0;
  const needsPractice = memory?.attempts && memory.mastery < 70 ? 2.5 : 0;
  return 8 + followed + affinity + interest + novelty + due + needsPractice;
}
