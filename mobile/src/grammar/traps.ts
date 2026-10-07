// Modulul 4 — Capcanele vorbitorilor de română: calcuri („traduceri cuvânt cu cuvânt"),
// prieteni falși și verbele care cer o anumită formă după ele.

import type { GrammarLesson } from './types';

export const TRAPS_LESSONS: GrammarLesson[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'ro-calques',
    moduleId: 'traps',
    level: 'A2',
    titleRo: 'Traduceri cuvânt cu cuvânt care sună greșit',
    goalRo: 'Recunoști și repari cele mai frecvente calcuri din română.',
    shortRo: 'I agree (nu „I am agree") · depends ON · take a photo · miss the bus · at the same time · I feel good.',
    mnemonicRo: 'Când traduci cuvânt cu cuvânt din română, oprește-te: probabil englezul folosește cu totul alt verb.',
    category: 'unnatural_phrasing',
    bodyRo: `Astea sunt greșelile după care un vorbitor nativ recunoaște instant un român. Toate vin din traducerea directă a unei structuri românești.

# Top 15
- ~~I am agree~~ → **I agree.** („a fi de acord" e un singur verb: agree)
- ~~I have 25 years~~ → **I am 25.**
- ~~It depends of~~ → **It depends on.**
- ~~in the same time~~ → **at the same time**
- ~~I make a photo~~ → **I take a photo.**
- ~~make a shower~~ → **take/have a shower**
- ~~I feel me good~~ → **I feel good.** (feel nu e reflexiv)
- ~~How it looks?~~ → **How does it look?**
- ~~I am living in Romania since 2010~~ → **I have lived in Romania since 2010.**
- ~~We are 5 persons~~ → **There are five of us.**
- ~~I lost the bus~~ → **I missed the bus.**
- ~~Close the light~~ → **Turn off the light.**
- ~~I say you that…~~ → **I'm telling you that…** (tell + persoană, say + lucru)
- ~~It's very cold, isn't it true?~~ → **…, isn't it?**
- ~~I have need of help~~ → **I need help.**

# say vs tell
- **tell** + cuiva: tell **me**, tell **him** the truth
- **say** + ce: say **something**, say **that**…
- I **told** him. / I **said** that.

# borrow vs lend
- **borrow** = a împrumuta DE LA cineva: Can I **borrow** your pen?
- **lend** = a împrumuta CUIVA: Can you **lend** me your pen?

# do vs make
- **do** = activități, muncă: do homework, do the dishes, do business, do exercise
- **make** = a produce ceva nou: make a cake, make a decision, make a mistake, make money

# Reflexivele care nu există în engleză
Româna are „mă simt, mă odihnesc, mă întorc". Engleza nu:
- I **feel** tired. · I **rest**. · I **come back**.
(Există reflexiv doar cu sens special: I taught **myself**. = m-am învățat singur.)`,
    examples: [
      { en: 'I agree with you.', ro: 'Sunt de acord cu tine.', bad: 'I am agree with you.' },
      { en: 'It depends on the weather.', ro: 'Depinde de vreme.', bad: 'It depends of the weather.' },
      { en: 'Can you take a photo of us?', ro: 'Poți să ne faci o poză?', bad: 'Can you make a photo of us?' },
      { en: 'I missed the train.', ro: 'Am pierdut trenul.', bad: 'I lost the train.' },
      { en: 'There are five of us.', ro: 'Suntem cinci.', bad: 'We are five persons.' },
      { en: 'Turn off the light, please.', ro: 'Stinge lumina, te rog.', bad: 'Close the light, please.' },
      { en: 'I feel much better today.', ro: 'Mă simt mult mai bine azi.', bad: 'I feel me much better today.' },
    ],
    exercises: [
      { kind: 'fix', text: 'I am agree with your plan.', answer: 'I agree with your plan.', explainRo: '„agree" e verb, nu adjectiv — nu ia „am".' },
      { kind: 'fix', text: 'It depends of you.', answer: 'It depends on you.', explainRo: 'depend + on, mereu.' },
      { kind: 'fix', text: 'I lost the bus this morning.', answer: 'I missed the bus this morning.', explainRo: '„a pierde" un mijloc de transport = miss.' },
      { kind: 'fix', text: 'I want to make a photo.', answer: 'I want to take a photo.', accept: ['I want to take a picture.'], explainRo: 'take a photo / take a picture.' },
      { kind: 'fix', text: 'We are four persons.', answer: 'There are four of us.', accept: ['There are four people.'], explainRo: 'Structura englezească e „there are X of us".' },
      { kind: 'choice', text: 'Can I ___ your charger?', options: ['borrow', 'lend'], answer: 'borrow', explainRo: 'Tu iei de la altcineva → borrow.' },
      { kind: 'choice', text: 'I need to ___ a decision.', options: ['do', 'make'], answer: 'make', explainRo: 'make a decision (a produce ceva nou).' },
      { kind: 'choice', text: 'He ___ me the truth.', options: ['said', 'told'], answer: 'told', explainRo: 'tell + persoană; say + conținut.' },
      { kind: 'translate', text: 'În același timp, trebuie să fim atenți.', answer: 'At the same time, we have to be careful.', accept: ['At the same time, we must be careful.'], explainRo: '„at the same time", nu „in the same time".' },
      { kind: 'translate', text: 'Cum arată?', answer: 'How does it look?', accept: ['What does it look like?'], explainRo: 'Întrebarea are nevoie de auxiliarul „does".' },
      { kind: 'order', text: 'Sunt de acord cu tine.', answer: 'I agree with you.', explainRo: '„agree" e verb — fără „am" înaintea lui.' },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'false-friends',
    moduleId: 'traps',
    level: 'B1',
    titleRo: 'Prieteni falși (cuvinte care te păcălesc)',
    goalRo: 'Nu mai folosești cuvinte englezești cu sensul lor românesc.',
    shortRo: 'actually = de fapt · eventually = în cele din urmă · library = bibliotecă · magazine = revistă · sensible = rezonabil.',
    mnemonicRo: 'Dacă un cuvânt englezesc „sună românește", verifică-l — de obicei înseamnă altceva.',
    category: 'vocabulary',
    bodyRo: `Cuvinte care seamănă cu unele românești, dar înseamnă altceva. Sunt periculoase pentru că par sigure.

# Cele mai frecvente
- **actually** = de fapt (NU „actual/în prezent" → *currently*)
- **eventually** = în cele din urmă (NU „eventual" → *possibly*)
- **sensible** = rezonabil, cu cap (NU „sensibil" → *sensitive*)
- **library** = bibliotecă (NU „librărie" → *bookshop / bookstore*)
- **magazine** = revistă (NU „magazin" → *shop / store*)
- **sympathetic** = înțelegător (NU „simpatic" → *nice, likeable, friendly*)
- **pretend** = a se preface (NU „a pretinde" → *to claim*)
- **deception** = înșelăciune (NU „decepție" → *disappointment*)
- **assist** = a ajuta (NU „a asista" la ceva → *to attend*)
- **preservative** = conservant (NU „prezervativ" → *condom*)
- **fabric** = țesătură (NU „fabrică" → *factory*)
- **camera** = aparat foto (NU „cameră" → *room*)
- **agenda** = ordine de zi (NU „agendă/carnet" → *diary, planner*)
- **editor** = redactor (NU „editură" → *publishing house*)
- **support** = a susține (NU „a suporta/tolera" → *to put up with, to stand*)
- **realize** = a-și da seama (NU „a realiza un lucru" → *to achieve, to make*)
- **control** = a controla/a conduce (verificare → *to check*)
- **novel** = roman (NU „nuvelă" → *short story*)
- **abusive** = agresiv, violent verbal (NU „abuziv" în sens de excesiv → *excessive*)

# Alte capcane de sens
- **person / people**: „persoane" la plural e **people**, nu „persons" (persons apare doar în limbaj juridic).
- **funny** = amuzant vs **fun** = distractiv: The party was **fun**. He is **funny**.
- **learn** = a învăța (tu) vs **teach** = a preda (altcuiva)
- **hear** = a auzi vs **listen (to)** = a asculta
- **look / see / watch**: look at (a privi), see (a vedea), watch (a urmări)
- **home / house**: home = acasă (sentiment), house = clădirea`,
    examples: [
      { en: "Actually, I don't agree.", ro: 'De fapt, nu sunt de acord.', noteRo: '„actually" = de fapt; pentru „în prezent" se folosește „currently".' },
      { en: 'I bought a book at the bookshop.', ro: 'Am cumpărat o carte de la librărie.', bad: 'I bought a book at the library.' },
      { en: 'She is very nice.', ro: 'Ea e foarte simpatică.', bad: 'She is very sympathetic.' },
      { en: 'He pretended to be sick.', ro: 'S-a prefăcut că e bolnav.', bad: 'He pretended his rights.' },
      { en: 'I attended the conference.', ro: 'Am asistat la conferință.', bad: 'I assisted the conference.' },
    ],
    exercises: [
      { kind: 'choice', text: '___ , I work in IT. (de fapt)', options: ['Actually', 'Currently'], answer: 'Actually', explainRo: 'actually = de fapt.' },
      { kind: 'choice', text: 'I borrowed the book from the ___ . (bibliotecă)', options: ['library', 'bookshop'], answer: 'library', explainRo: 'library = bibliotecă; bookshop = librărie.' },
      { kind: 'choice', text: 'He is a very ___ person. (simpatic)', options: ['sympathetic', 'likeable'], answer: 'likeable', explainRo: 'sympathetic = înțelegător, nu simpatic.' },
      { kind: 'choice', text: 'She ___ that she was the owner. (a pretins)', options: ['pretended', 'claimed'], answer: 'claimed', explainRo: 'pretend = a se preface.' },
      { kind: 'choice', text: 'I need to buy a new ___ . (aparat foto)', options: ['camera', 'room'], answer: 'camera', explainRo: 'camera = aparat foto; „cameră" = room.' },
      { kind: 'fix', text: 'There were three persons in the room.', answer: 'There were three people in the room.', explainRo: 'Pluralul uzual de la person e „people".' },
      { kind: 'fix', text: 'I want to realize my dream project.', answer: 'I want to achieve my dream project.', accept: ['I want to make my dream project happen.'], explainRo: 'realize = a-și da seama; „a realiza" ceva = achieve / accomplish.' },
      { kind: 'translate', text: 'În cele din urmă, a acceptat.', answer: 'Eventually, he accepted.', accept: ['Eventually, she accepted.', 'In the end, he accepted.'], explainRo: 'eventually = în cele din urmă.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'verb-patterns',
    moduleId: 'traps',
    level: 'B1',
    titleRo: 'Ce urmează după verb: -ing sau to?',
    goalRo: 'Alegi corect între „I enjoy doing" și „I want to do".',
    shortRo: 'want / need / decide + to + verb · enjoy / mind / finish / avoid + verb-ing · după ORICE prepoziție, mereu -ing.',
    mnemonicRo: 'I look forward TO meetING you — „to" de acolo e prepoziție, nu infinitiv.',
    requires: ['present-simple'],
    category: 'other',
    bodyRo: `Româna spune „vreau **să** merg", „îmi place **să** merg" — cu aceeași structură. Engleza are trei tipare diferite.

# 1. Verb + **to** + verb
want, need, decide, hope, plan, promise, agree, learn, offer, refuse, seem, try, would like, manage, expect, afford
- I **want to go**. · She **decided to leave**. · I'**d like to help**.

# 2. Verb + verb**-ing**
enjoy, like*, love*, hate*, mind, finish, keep, avoid, suggest, practise, imagine, miss, can't stand, look forward to
- I **enjoy reading**. · Do you **mind waiting**? · I **finished working** at 6.
- (*like / love / hate merg și cu „to", cu sens aproape identic.)

# 3. După prepoziție → mereu **-ing**
- I'm interested **in learning** German.
- Thank you for **helping** me.
- She left without **saying** goodbye.
- I'm good **at cooking**.

Atenție: „look forward **to**" are „to" ca prepoziție, deci: I look forward **to hearing** from you (nu „to hear").

# 4. Verb + persoană + to
tell, ask, want, allow, advise, remind, teach, help
- He **told me to wait**. · She **asked me to come**.

# Diferență de sens
- **stop smoking** = te lași de fumat / **stop to smoke** = te oprești ca să fumezi
- **remember to lock** = nu uita să încui / **remember locking** = îți amintești că ai încuiat
- **try to open** = încerci (e greu) / **try opening** = încearcă asta ca soluție

# make / let / help
Fără „to": He **made me wait**. · Let me **know**. · Help me **carry** this.`,
    examples: [
      { en: 'I enjoy learning English.', ro: 'Îmi place să învăț engleză.', bad: 'I enjoy to learn English.' },
      { en: 'I want to learn English.', ro: 'Vreau să învăț engleză.', bad: 'I want learning English.' },
      { en: 'Thank you for helping me.', ro: 'Mulțumesc că m-ai ajutat.', bad: 'Thank you for help me.' },
      { en: 'I look forward to seeing you.', ro: 'Abia aștept să te văd.', bad: 'I look forward to see you.' },
      { en: 'He told me to call back.', ro: 'Mi-a zis să sun înapoi.', bad: 'He told me call back.' },
    ],
    exercises: [
      { kind: 'choice', text: 'I decided ___ a new job.', options: ['finding', 'to find'], answer: 'to find', explainRo: 'decide + to.' },
      { kind: 'choice', text: "Do you mind ___ the window?", options: ['opening', 'to open'], answer: 'opening', explainRo: 'mind + -ing.' },
      { kind: 'choice', text: "I'm interested in ___ more about it.", options: ['learning', 'to learn'], answer: 'learning', explainRo: 'După prepoziție („in") merge -ing.' },
      { kind: 'choice', text: 'She avoided ___ him.', options: ['meeting', 'to meet'], answer: 'meeting', explainRo: 'avoid + -ing.' },
      { kind: 'fix', text: 'I enjoy to travel.', answer: 'I enjoy travelling.', accept: ['I enjoy traveling.'], explainRo: 'enjoy cere -ing.' },
      { kind: 'fix', text: 'He made me to wait an hour.', answer: 'He made me wait an hour.', explainRo: 'make / let / help nu iau „to".' },
      { kind: 'fix', text: 'I look forward to meet you.', answer: 'I look forward to meeting you.', explainRo: '„to" de aici e prepoziție → -ing.' },
      { kind: 'translate', text: 'Am nevoie să vorbesc cu tine.', answer: 'I need to talk to you.', accept: ['I need to speak to you.', 'I need to talk with you.'], explainRo: 'need + to + verb.' },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'conditionals',
    moduleId: 'traps',
    level: 'B1',
    titleRo: 'Condiționalul (if)',
    goalRo: 'Construiești corect „dacă…, atunci…" la toate cele trei tipuri.',
    shortRo: 'Niciodată will/would imediat după „if". Tip 1: if + prezent, will. Tip 2: if + trecut, would. Tip 3: if + had done, would have done.',
    mnemonicRo: 'Un singur „would" per propoziție — și e mereu în partea FĂRĂ „if".',
    requires: ['past-simple', 'future'],
    category: 'conditional',
    bodyRo: `# Regula care rezolvă 90% din greșeli
**Niciodată „will" sau „would" imediat după „if".**
- ~~If I will have time~~ → **If I have time**, I'll call you.
- ~~If I would be you~~ → **If I were you**, I'd wait.

# Tipul 0 — adevăruri generale
if + prezent, prezent
- If you **heat** water to 100°C, it **boils**.

# Tipul 1 — situație reală, posibilă
if + prezent, **will** + verb
- If it **rains**, we **will stay** home.
- If you **study**, you **will pass**.

# Tipul 2 — ipotetic, improbabil sau imaginar
if + past simple, **would** + verb
- If I **had** more money, I **would travel** more.
- If I **were** you, I **would accept** the offer. (la tipul 2 se folosește „were" pentru toate persoanele)

# Tipul 3 — regret despre trecut
if + past perfect, **would have** + participiu
- If I **had known**, I **would have helped** you.
- If she **had studied**, she **would have passed**.

# Ordinea se poate inversa
- I'll call you **if I have time**. (fără virgulă când „if" e la mijloc)

# unless = dacă nu
- I won't go **unless** you come with me. (= if you don't come)
Nu adaugi și „not": ~~unless you don't come~~.`,
    examples: [
      { en: "If I have time, I'll help you.", ro: 'Dacă am timp, te ajut.', bad: "If I will have time, I'll help you." },
      { en: 'If I were you, I would wait.', ro: 'Dacă aș fi în locul tău, aș aștepta.', bad: 'If I would be you, I would wait.' },
      { en: 'If I had known, I would have come.', ro: 'Dacă aș fi știut, aș fi venit.', bad: 'If I would have known, I would have come.' },
      { en: "I won't go unless you come too.", ro: 'Nu mă duc decât dacă vii și tu.', bad: "I won't go unless you don't come." },
      { en: 'If you heat ice, it melts.', ro: 'Dacă încălzești gheața, se topește.' },
    ],
    exercises: [
      { kind: 'choice', text: "If it ___ tomorrow, we'll cancel.", options: ['will rain', 'rains'], answer: 'rains', explainRo: 'Tip 1: if + prezent, will în partea a doua.' },
      { kind: 'choice', text: 'If I ___ rich, I would buy a house by the sea.', options: ['was', 'were', 'will be'], answer: 'were', explainRo: 'Tip 2 folosește „were" pentru toate persoanele.' },
      { kind: 'choice', text: 'If she had left earlier, she ___ the train.', options: ['would catch', 'would have caught'], answer: 'would have caught', explainRo: 'Tip 3: would have + participiu.' },
      { kind: 'fill', text: "If you ___ (not / hurry), you'll be late.", answer: "don't hurry", accept: ['do not hurry'], explainRo: 'După „if" se folosește prezentul, chiar dacă sensul e viitor.' },
      { kind: 'fix', text: 'If I will see him, I will tell him.', answer: 'If I see him, I will tell him.', accept: ["If I see him, I'll tell him."], explainRo: 'Fără „will" după „if".' },
      { kind: 'fix', text: 'If I would have money, I would travel.', answer: 'If I had money, I would travel.', explainRo: 'Tip 2: if + past simple.' },
      { kind: 'translate', text: 'Dacă aș avea mai mult timp, aș învăța două limbi.', answer: 'If I had more time, I would learn two languages.', accept: ["If I had more time, I'd learn two languages."], explainRo: 'Situație ipotetică → tip 2.' },
      { kind: 'translate', text: 'Dacă termini la timp, mergem la film.', answer: "If you finish on time, we will go to the cinema.", accept: ["If you finish on time, we'll go to the cinema.", "If you finish in time, we'll go to the cinema.", "If you finish on time, we'll go to the movies."], explainRo: 'Situație reală → tip 1.' },
      { kind: 'order', text: 'Dacă aș ști răspunsul, ți l-aș spune.', answer: 'If I knew the answer, I would tell you.', accept: ["If I knew the answer, I'd tell you."], explainRo: 'Tip 2: trecutul după „if", „would" în cealaltă parte — niciodată amândouă cu would.' },
    ],
  },
];
