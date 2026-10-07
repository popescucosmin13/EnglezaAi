// Modulul 3 — Detaliile care te dau de gol: prepoziții, întrebări, cantități,
// comparative, modale, posesiv și adverbele de frecvență.

import type { GrammarLesson } from './types';

export const DETAILS_LESSONS: GrammarLesson[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'prepositions-time',
    moduleId: 'details',
    level: 'A1',
    titleRo: 'Prepoziții de timp: in / on / at',
    goalRo: 'Nu mai eziți între „at Monday", „in Monday" și „on Monday".',
    shortRo: 'at = oră exactă · on = zi și dată · in = lună, an, anotimp. today, tomorrow, next week nu iau nicio prepoziție.',
    mnemonicRo: 'De la mic la mare: at 7 → on Monday → in August.',
    category: 'preposition',
    bodyRo: `# Regula pâlniei: de la mare la mic
- **in** = perioade mari: luni, ani, anotimpuri, secole, părți ale zilei
  in August, in 2024, in summer, in the 90s, **in the morning / afternoon / evening**
- **on** = zile și date: **on** Monday, **on** July 5th, **on** my birthday, **on** Christmas Day, **on** Monday morning
- **at** = momente exacte: **at** 5 o'clock, **at** noon, **at** midnight, **at** **night**, **at** the weekend (UK), **at** Christmas (perioada)

Ține minte perechea ciudată: **in** the morning, dar **at** night.

# Fără nicio prepoziție
Înaintea acestor cuvinte nu pui nimic: **today, tomorrow, yesterday, tonight, next week, last year, every day, this month**.
- ~~in next week~~ → **next week**
- ~~on yesterday~~ → **yesterday**

# Alte prepoziții de timp utile
- **for** + durată: for two hours
- **since** + moment de start: since Monday
- **during** + eveniment/perioadă: during the meeting
- **until / till** = până la: until 6 p.m.
- **by** = cel târziu până la: Finish it **by** Friday.
- **from … to / until**: from 9 to 5
- **ago** (după durată, cu trecutul): two years **ago**
- **in** + durată = peste: I'll be back **in** ten minutes.`,
    examples: [
      { en: 'The meeting is on Monday at 10.', ro: 'Ședința e luni la 10.', bad: 'The meeting is in Monday at 10.' },
      { en: 'I was born in 1990.', ro: 'M-am născut în 1990.', bad: 'I was born on 1990.' },
      { en: 'See you next week.', ro: 'Ne vedem săptămâna viitoare.', bad: 'See you in next week.' },
      { en: 'I work better at night.', ro: 'Lucrez mai bine noaptea.', bad: 'I work better in the night.' },
      { en: "I'll be there in ten minutes.", ro: 'Ajung în zece minute.', bad: "I'll be there after ten minutes." },
    ],
    exercises: [
      { kind: 'fill', text: 'The party is ___ Saturday.', answer: 'on', explainRo: 'Zilele săptămânii → on.' },
      { kind: 'fill', text: 'I usually get up ___ 7 a.m.', answer: 'at', explainRo: 'Oră exactă → at.' },
      { kind: 'fill', text: 'It gets cold ___ winter.', answer: 'in', explainRo: 'Anotimpuri → in.' },
      { kind: 'fill', text: 'I read a lot ___ the evening.', answer: 'in', explainRo: 'Părți ale zilei → in (dar „at night").' },
      { kind: 'choice', text: 'I saw her ___ .', options: ['in yesterday', 'on yesterday', 'yesterday'], answer: 'yesterday', explainRo: '„yesterday" nu ia prepoziție.' },
      { kind: 'choice', text: 'Please send it ___ Friday at the latest.', options: ['by', 'until', 'in'], answer: 'by', explainRo: '„by" = cel târziu până la; „until" = tot timpul până atunci.' },
      { kind: 'fix', text: 'I will call you in tomorrow.', answer: 'I will call you tomorrow.', accept: ["I'll call you tomorrow."], explainRo: '„tomorrow" merge fără prepoziție.' },
      { kind: 'fix', text: 'My birthday is in the 12th of May.', answer: 'My birthday is on the 12th of May.', explainRo: 'Datele primesc „on".' },
      { kind: 'translate', text: 'Ne vedem luni dimineață la nouă.', answer: 'See you on Monday morning at nine.', accept: ['See you at nine on Monday morning.'], explainRo: 'on + zi, at + oră.' },
      { kind: 'order', text: 'Ședința e vineri la ora zece.', answer: 'The meeting is on Friday at ten.', explainRo: 'on pentru zi, at pentru oră — în ordinea asta.' },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'prepositions-place',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Prepoziții de loc și mișcare',
    goalRo: 'Spui corect unde ești și unde te duci (in/on/at, to, into).',
    shortRo: 'in = înăuntru · on = pe o suprafață · at = un punct. Mișcarea cere „to" — dar „go home" e fără to.',
    mnemonicRo: 'at home, at work, at school — fără „the". Și „arrive at / in", niciodată „arrive to".',
    requires: ['prepositions-time'],
    category: 'preposition',
    bodyRo: `# Aceeași pâlnie, pentru spațiu
- **in** = înăuntru, într-un spațiu închis sau o zonă: in the room, in the car, in Romania, in the newspaper
- **on** = pe o suprafață sau o linie: on the table, on the wall, on the bus, on the second floor, on the left
- **at** = un punct, o adresă, un loc cu funcție: at the door, at the bus stop, at work, at school, at home, at the party, at 25 Main Street

# Perechi care se confundă
- **in the car / on the bus** (mașină mică = in; transport mare în care mergi/stai = on: bus, train, plane, ship)
- **at school** (ca activitate: sunt elev/la ore) vs **in the school** (fizic, în clădire)
- **at home** (fără „the"!) — ~~at the home~~

# Mișcare: **to**
- I go **to** work / **to** school / **to** the gym.
- Excepție: go **home** (fără „to"), go **abroad**, go **inside**.
- **into** = intrare într-un spațiu: He walked **into** the room.
- **arrive at** un loc, **arrive in** un oraș/țară (niciodată „arrive to").

# Alte prepoziții utile
under, over, above, below, between (între doi), among (printre mai mulți), next to, in front of, behind, opposite, near, across from.

# Capcane de traducere
- ~~I go at the doctor~~ → I go **to** the doctor.
- ~~on the picture~~ → **in** the picture
- ~~in the bus~~ → **on** the bus
- ~~I depend of you~~ → I depend **on** you.`,
    examples: [
      { en: 'I am at home.', ro: 'Sunt acasă.', bad: 'I am at the home.' },
      { en: "We're on the train.", ro: 'Suntem în tren.', bad: "We're in the train." },
      { en: 'She is in the picture.', ro: 'Ea e în poză.', bad: 'She is on the picture.' },
      { en: 'I went to the doctor.', ro: 'M-am dus la doctor.', bad: 'I went at the doctor.' },
      { en: 'We arrived in Madrid at 6.', ro: 'Am ajuns în Madrid la 6.', bad: 'We arrived to Madrid at 6.' },
    ],
    exercises: [
      { kind: 'fill', text: 'The keys are ___ the table.', answer: 'on', explainRo: 'Suprafață → on.' },
      { kind: 'fill', text: 'She lives ___ Romania.', answer: 'in', explainRo: 'Țări și orașe → in.' },
      { kind: 'fill', text: "I'm waiting ___ the bus stop.", answer: 'at', explainRo: 'Punct precis → at.' },
      { kind: 'choice', text: 'I go ___ every day.', options: ['to home', 'home', 'at home'], answer: 'home', explainRo: '„go home" nu ia prepoziție.' },
      { kind: 'choice', text: 'It depends ___ the weather.', options: ['of', 'on', 'by'], answer: 'on', explainRo: '„depend" cere mereu „on".' },
      { kind: 'fix', text: 'We arrived to the airport late.', answer: 'We arrived at the airport late.', explainRo: 'arrive at (loc) / arrive in (oraș) — niciodată „arrive to".' },
      { kind: 'fix', text: 'He is in the bus now.', answer: 'He is on the bus now.', explainRo: 'Transport public mare → on.' },
      { kind: 'translate', text: 'Sunt la muncă până la ora șase.', answer: 'I am at work until six.', accept: ["I'm at work until 6.", 'I am at work till six.'], explainRo: 'at work (fără „the"), until + oră.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'questions',
    moduleId: 'details',
    level: 'A1',
    titleRo: 'Întrebările (toate tipurile)',
    goalRo: 'Formulezi orice întrebare cu ordinea corectă, nu doar cu intonație.',
    shortRo: '(Cuvânt de întrebare) + auxiliar + subiect + verb. În engleză intonația singură NU face o întrebare.',
    mnemonicRo: 'Where DO you live? — auxiliarul e obligatoriu, chiar dacă în română nu există.',
    requires: ['present-simple'],
    category: 'question_form',
    bodyRo: `# Ordinea universală
**(Cuvânt de întrebare) + auxiliar + subiect + verb**
- **Where do you live?**
- **What is she doing?**
- **Why did he leave?**
- **Have you finished?**

În română întrebarea se face din intonație („Tu lucrezi aici?"). În engleză **trebuie** inversiune sau auxiliar — altfel sună ca engleza de începător.

# Ce auxiliar folosesc?
- to be → se inversează singur: **Are** you ready?
- present simple → **do / does**: **Does** he work here?
- past simple → **did**: **Did** you see it?
- present perfect → **have / has**: **Have** you eaten?
- modale (can, will, should) → se inversează singure: **Can** you help me?

# Cuvintele de întrebare
what (ce), who (cine), where (unde), when (când), why (de ce), how (cum), which (care), whose (al cui), how much / how many (cât / câți), how long (cât timp), how often (cât de des)

# Excepția: întrebare despre subiect
Când întrebi **cine/ce face** acțiunea, nu mai pui „do":
- **Who called** you? (nu „Who did call you?")
- **What happened?** (nu „What did happen?")

# Întrebări indirecte — ordinea revine la normal
- Can you tell me **where the station is**? (nu „where is the station")
- I don't know **what he wants**. (nu „what does he want")

# Question tags
- You're Romanian, **aren't you**?
- He doesn't smoke, **does he**?
Regula: propoziție afirmativă → tag negativ, și invers.`,
    examples: [
      { en: 'Where do you work?', ro: 'Unde lucrezi?', bad: 'Where you work?' },
      { en: 'What time does the film start?', ro: 'La ce oră începe filmul?', bad: 'What time starts the film?' },
      { en: 'Who called you?', ro: 'Cine te-a sunat?', bad: 'Who did call you?' },
      { en: 'Can you tell me where the station is?', ro: 'Îmi poți spune unde e gara?', bad: 'Can you tell me where is the station?' },
      { en: 'How long have you been here?', ro: 'De cât timp ești aici?', bad: 'How much time you are here?' },
    ],
    exercises: [
      { kind: 'fix', text: 'Where you are going?', answer: 'Where are you going?', explainRo: 'Auxiliarul (are) trece înaintea subiectului.' },
      { kind: 'fix', text: 'What means this word?', answer: 'What does this word mean?', explainRo: 'Present simple → do/does + verb la bază.' },
      { kind: 'fix', text: 'Do you know where is the bathroom?', answer: 'Do you know where the bathroom is?', explainRo: 'Întrebare indirectă → ordine normală (subiect + verb).' },
      { kind: 'choice', text: '___ he live here?', options: ['Do', 'Does', 'Is'], answer: 'Does', explainRo: 'he → does.' },
      { kind: 'choice', text: '___ broke the window?', options: ['Who', 'Who did'], answer: 'Who', explainRo: 'Întrebare despre subiect → fără auxiliar.' },
      { kind: 'choice', text: 'You are coming, ___ ?', options: ["aren't you", 'are you', "don't you"], answer: "aren't you", explainRo: 'Afirmativ → tag negativ, cu același auxiliar.' },
      { kind: 'translate', text: 'De ce ai plecat devreme?', answer: 'Why did you leave early?', explainRo: 'Trecut → did + verb la bază.' },
      { kind: 'translate', text: 'Cât costă?', answer: 'How much is it?', accept: ['How much does it cost?'], explainRo: 'Preț → how much + is / does it cost.' },
      { kind: 'order', text: 'Unde locuiește fratele tău?', answer: 'Where does your brother live?', explainRo: 'Cuvânt de întrebare + does + subiect + verb la forma de bază.' },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'quantifiers',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Cantități: some / any / much / many',
    goalRo: 'Deosebești numărabil de nenumărabil și alegi cuvântul de cantitate potrivit.',
    shortRo: 'many / a few + numărabile · much / a little + nenumărabile · a lot of merge la amândouă. some în afirmativ, any în negativ și întrebare.',
    mnemonicRo: 'Dacă nu poți spune „two ___", e nenumărabil: much money, much time, much information.',
    requires: ['plural'],
    category: 'plural',
    bodyRo: `# Numărabil vs nenumărabil
- **Numărabile**: le poți număra → a book, two books, many books
- **Nenumărabile**: nu le numeri direct → water, money, time, information, advice, bread, music, work

Nenumărabilele nu au plural și cer verb la singular:
- Money **is** important. · The news **is** good.
Le numeri cu un „recipient": **a glass of** water, **a piece of** advice, **a slice of** bread.

# some / any
- **some** = niște, în propoziții afirmative: I have **some** questions.
- **any** = în negative și întrebări: I don't have **any** money. · Do you have **any** questions?
- Excepție: **some** în oferte și cereri: Would you like **some** coffee?

# much / many / a lot of
- **many** + numărabile: many people, many cars
- **much** + nenumărabile: much time, much money
- **a lot of / lots of** + amândouă, potrivit oricând (mai ales în afirmativ): a lot of people, a lot of time
- „much" și „many" sună mai natural în negative și întrebări: I don't have **much** time. · **How many** people came?

# a few / a little
- **a few** + numărabile: a few friends
- **a little** + nenumărabile: a little sugar
- Fără „a", sensul devine negativ: **few** friends = prea puțini prieteni.

# too / enough
- **too much / too many** = prea mult(e): too much noise, too many emails
- **enough** stă după adjectiv, dar înainte de substantiv: old **enough**, **enough** money`,
    examples: [
      { en: 'I have a lot of work today.', ro: 'Am mult de lucru azi.', bad: 'I have many works today.' },
      { en: "There isn't much time left.", ro: 'Nu a mai rămas mult timp.', bad: "There aren't many times left." },
      { en: 'Would you like some water?', ro: 'Vrei niște apă?', bad: 'Would you like any water?' },
      { en: "I don't have any questions.", ro: 'Nu am nicio întrebare.', bad: "I don't have no questions." },
      { en: 'How many people were there?', ro: 'Câți oameni erau?', bad: 'How much people were there?' },
    ],
    exercises: [
      { kind: 'choice', text: 'How ___ money do you need?', options: ['much', 'many'], answer: 'much', explainRo: '„money" e nenumărabil → much.' },
      { kind: 'choice', text: 'There are too ___ cars in the city.', options: ['much', 'many'], answer: 'many', explainRo: '„cars" e numărabil → many.' },
      { kind: 'choice', text: "I don't have ___ free time.", options: ['some', 'any', 'many'], answer: 'any', explainRo: 'Negativ → any.' },
      { kind: 'choice', text: 'Can I have ___ sugar, please?', options: ['a few', 'a little'], answer: 'a little', explainRo: '„sugar" e nenumărabil → a little.' },
      { kind: 'fill', text: 'I invited ___ friends over. (câțiva)', answer: 'a few', explainRo: '„friends" e numărabil → a few.' },
      { kind: 'fix', text: 'She gave me many informations.', answer: 'She gave me a lot of information.', accept: ['She gave me much information.'], explainRo: '„information" e nenumărabil: fără plural, cu „a lot of / much".' },
      { kind: 'fix', text: 'He is enough old to drive.', answer: 'He is old enough to drive.', explainRo: '„enough" stă DUPĂ adjectiv (dar înaintea substantivului).' },
      { kind: 'translate', text: 'Nu am destui bani.', answer: "I don't have enough money.", accept: ['I do not have enough money.'], explainRo: '„enough" stă înaintea substantivului; „money" e la singular.' },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'comparatives',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Comparativ și superlativ',
    goalRo: 'Compari corect: -er / more, the -est / the most, as … as.',
    shortRo: 'Adjectiv scurt: -er … than / the -est. Adjectiv lung: more … than / the most. Neregulate: good–better–best, bad–worse–worst.',
    mnemonicRo: 'Niciodată „more better": ori -er, ori more, nu amândouă. Și mereu „than", nu „that".',
    requires: ['adjectives'],
    category: 'other',
    bodyRo: `# Adjective scurte (1 silabă, sau 2 terminate în -y)
- + **-er … than**: tall → tall**er than**, big → big**ger than**, easy → eas**ier than**
- superlativ: **the** tall**est**, **the** bigg**est**, **the** eas**iest**

# Adjective lungi (2+ silabe)
- **more … than**: more expensive **than**, more interesting **than**
- superlativ: **the most** expensive, **the most** interesting

Nu le combini niciodată: ~~more bigger~~, ~~the most easiest~~.

# Neregulate
good → **better** → the **best**
bad → **worse** → the **worst**
far → **further / farther** → the **furthest / farthest**
much/many → **more** → the **most**
little → **less** → the **least**

# than, nu „that / as"
- She is taller **than** me. (~~taller that me~~, ~~taller as me~~)

# Egalitate: as … as
- He is **as tall as** his brother. (la fel de înalt ca)
- Negativ: It's **not as expensive as** I thought.

# Superlativul cere „the"
- This is **the best** film I've ever seen.
- He is **the most** talented person in the team.

# „cu cât … cu atât"
- **The more** you practise, **the better** you get.`,
    examples: [
      { en: 'This car is more expensive than mine.', ro: 'Mașina asta e mai scumpă decât a mea.', bad: 'This car is more expensive that mine.' },
      { en: 'She is the best student in the class.', ro: 'Ea e cea mai bună elevă din clasă.', bad: 'She is the most good student in the class.' },
      { en: 'Today is hotter than yesterday.', ro: 'Azi e mai cald decât ieri.', bad: 'Today is more hot than yesterday.' },
      { en: 'He is as tall as his father.', ro: 'E la fel de înalt ca tatăl lui.', bad: 'He is so tall as his father.' },
      { en: 'My English is getting better.', ro: 'Engleza mea se îmbunătățește.', bad: 'My English is getting more good.' },
    ],
    exercises: [
      { kind: 'fill', text: 'Comparativul lui „good" este ___ .', answer: 'better', explainRo: 'good → better → the best.' },
      { kind: 'fill', text: 'Superlativul lui „bad" este ___ .', answer: 'the worst', accept: ['worst'], explainRo: 'bad → worse → the worst.' },
      { kind: 'fill', text: 'This exercise is ___ (easy) than the last one.', answer: 'easier', explainRo: 'Adjectiv scurt în -y → -ier.' },
      { kind: 'choice', text: 'My phone is ___ than yours.', options: ['more new', 'newer'], answer: 'newer', explainRo: 'Adjectiv scurt → -er.' },
      { kind: 'choice', text: "It's the ___ interesting book I've read.", options: ['more', 'most'], answer: 'most', explainRo: 'Superlativ la adjectiv lung → the most.' },
      { kind: 'fix', text: 'She is more taller than me.', answer: 'She is taller than me.', explainRo: 'Nu se combină „more" cu „-er".' },
      { kind: 'fix', text: 'This is the most best solution.', answer: 'This is the best solution.', explainRo: '„best" e deja superlativ.' },
      { kind: 'translate', text: 'Cu cât exersezi mai mult, cu atât devii mai bun.', answer: 'The more you practise, the better you get.', accept: ['The more you practice, the better you get.', 'The more you practise, the better you become.'], explainRo: 'Structura fixă: the + comparativ, the + comparativ.' },
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'modals',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Verbe modale: can, must, should…',
    goalRo: 'Exprimi capacitate, obligație, permisiune și sfat fără să adaugi „to".',
    shortRo: 'can / must / should + verb gol: fără „to", fără -s, iar negația și întrebarea se fac fără „do".',
    mnemonicRo: 'mustn\'t = e interzis. don\'t have to = nu ești obligat. Sunt lucruri complet diferite.',
    requires: ['present-simple'],
    category: 'auxiliary',
    bodyRo: `# Trei reguli care le acoperă pe toate
1. Modalul e urmat de **verb la forma de bază**, fără „to": I can **swim**. (~~can to swim~~)
2. Modalul **nu ia -s** la persoana a III-a: She **can**. (~~she cans~~)
3. Negativul și întrebarea se fac **fără do**: I **can't** swim. · **Can** you swim?

Excepție: **have to** și **ought to** păstrează „to".

# Ce exprimă fiecare
- **can** = pot, știu să / se poate: I **can** drive. · **Can** I sit here?
- **could** = puteam / aș putea (mai politicos): **Could** you help me?
- **may / might** = posibil: It **may** rain. · I **might** be late.
- **must** = obligație puternică, venită din interior: I **must** stop smoking.
- **have to** = obligație din exterior (reguli, șef): I **have to** wear a uniform.
- **should** = sfat: You **should** see a doctor.
- **would** = politețe / ipotetic: I **would** like a coffee.

# Capcana negativelor
- **mustn't** = interdicție: You **mustn't** smoke here. (e interzis)
- **don't have to** = lipsă de obligație: You **don't have to** come. (nu ești obligat, dar poți)

Sunt lucruri complet diferite — confuzia asta duce la neînțelegeri reale.

# La trecut
Modalele nu au trecut propriu; se înlocuiesc:
- can → **could** / **was able to**
- must → **had to**
- I **had to** work yesterday. (~~I must work yesterday~~)

# Politețea
„I want" sună brutal în engleză. Folosește: **I'd like** …, **Could I** have …?, **Would you mind** …?`,
    examples: [
      { en: 'I can help you tomorrow.', ro: 'Te pot ajuta mâine.', bad: 'I can to help you tomorrow.' },
      { en: 'She can speak three languages.', ro: 'Ea vorbește trei limbi.', bad: 'She cans speak three languages.' },
      { en: 'You should rest.', ro: 'Ar trebui să te odihnești.', bad: 'You should to rest.' },
      { en: 'I had to work late.', ro: 'A trebuit să lucrez până târziu.', bad: 'I must work late yesterday.' },
      { en: "I'd like a table for two, please.", ro: 'Aș dori o masă pentru două persoane.', bad: 'I want a table for two.' },
    ],
    exercises: [
      { kind: 'fix', text: 'He can to come with us.', answer: 'He can come with us.', explainRo: 'După modal, verbul e la forma de bază, fără „to".' },
      { kind: 'fix', text: 'She musts finish it today.', answer: 'She must finish it today.', explainRo: 'Modalele nu primesc -s.' },
      { kind: 'fix', text: 'Do you can help me?', answer: 'Can you help me?', explainRo: 'Modalele fac întrebarea singure, fără „do".' },
      { kind: 'choice', text: 'You ___ smoke here — it\'s forbidden.', options: ["mustn't", "don't have to"], answer: "mustn't", explainRo: 'Interdicție → mustn\'t.' },
      { kind: 'choice', text: "It's Sunday, so I ___ get up early.", options: ["mustn't", "don't have to"], answer: "don't have to", explainRo: 'Lipsă de obligație → don\'t have to.' },
      { kind: 'choice', text: '___ you pass me the salt, please?', options: ['Could', 'Should', 'Must'], answer: 'Could', explainRo: 'Cerere politicoasă → could.' },
      { kind: 'translate', text: 'Ar trebui să vorbești cu el.', answer: 'You should talk to him.', accept: ['You should speak to him.', 'You should talk with him.'], explainRo: 'Sfat → should + verb la bază.' },
      { kind: 'translate', text: 'A trebuit să plec mai devreme.', answer: 'I had to leave earlier.', accept: ['I had to leave early.'], explainRo: '„must" nu are trecut → had to.' },
      { kind: 'order', text: 'Poți să mă ajuți mâine?', answer: 'Can you help me tomorrow?', explainRo: 'Modalul trece în față la întrebare, iar verbul rămâne gol (help, nu „to help").' },
    ],
  },

  // ---------------------------------------------------------------- 7
  {
    id: 'possessives',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Posesia: \'s, of, my / mine',
    goalRo: 'Spui „mașina lui Andrei" fără să traduci greșit cu „of".',
    shortRo: 'Persoana + \'s stă ÎNAINTEA obiectului: Andrei\'s car. Lucrurile iau „of". mine/yours/hers stau singure, fără substantiv.',
    mnemonicRo: 'its = al său (fără apostrof) · it\'s = it is. Mereu.',
    category: 'pronoun',
    bodyRo: `# Genitivul cu 's — pentru oameni și ființe
Româna spune „mașina lui Andrei" (posesorul la final), engleza îl pune **la început**:
- **Andrei's** car · my **brother's** house · the **dog's** name

- Plural terminat în -s → doar apostrof: my **parents'** house
- Plural neregulat → 's: the **children's** toys
- Doi posesori împreună: **Ana and Mihai's** flat

# of — pentru lucruri și abstracte
- the end **of** the film · the roof **of** the house · the name **of** the company

Cu lucruri, tot mai des se folosește pur și simplu substantiv + substantiv: the film's ending / the **kitchen table** / a **car key**.

# Adjectiv posesiv vs pronume posesiv
- **my, your, his, her, its, our, their** + substantiv: This is **my** book.
- **mine, yours, his, hers, its, ours, theirs** stau singure: This book is **mine**.

Atenție la două capcane:
- **its** = al său (fără apostrof!) vs **it's** = it is
- **his / her** se aleg după **posesor**, nu după obiect: Maria and **her** brother · Ion and **his** sister.
  (În română spui „fratele ei" — la fel, doar că e ușor de greșit când vorbești repede.)

# own
Pentru accent: I have my **own** office. (biroul meu propriu)`,
    examples: [
      { en: "This is Andrei's car.", ro: 'Asta e mașina lui Andrei.', bad: 'This is the car of Andrei.' },
      { en: 'The book is mine.', ro: 'Cartea e a mea.', bad: 'The book is my.' },
      { en: 'Maria came with her husband.', ro: 'Maria a venit cu soțul ei.', bad: 'Maria came with his husband.' },
      { en: "The company changed its name.", ro: 'Compania și-a schimbat numele.', bad: "The company changed it's name." },
      { en: "My parents' house is old.", ro: 'Casa părinților mei e veche.', bad: "My parents's house is old." },
    ],
    exercises: [
      { kind: 'fix', text: 'This is the phone of my sister.', answer: "This is my sister's phone.", explainRo: 'Posesor persoană → \'s, pus înaintea obiectului.' },
      { kind: 'fix', text: 'Is this book yours or my?', answer: 'Is this book yours or mine?', explainRo: 'Pronumele posesiv care stă singur e „mine".' },
      { kind: 'choice', text: 'The dog wagged ___ tail.', options: ["it's", 'its'], answer: 'its', explainRo: '„its" = posesiv; „it\'s" = it is.' },
      { kind: 'choice', text: 'Ana forgot ___ keys.', options: ['his', 'her'], answer: 'her', explainRo: 'Posesorul e Ana → her.' },
      { kind: 'fill', text: 'The ___ toys are everywhere. (children)', answer: "children's", explainRo: 'Plural neregulat → \'s.' },
      { kind: 'translate', text: 'Prietenul fratelui meu lucrează aici.', answer: "My brother's friend works here.", explainRo: 'Lanț de posesie: my brother\'s friend.' },
      { kind: 'translate', text: 'Casa asta e a lor.', answer: 'This house is theirs.', accept: ['This is their house.'], explainRo: 'Pronume posesiv de sine stătător → theirs.' },
      { kind: 'order', text: 'Mașina prietenei mele e nouă.', answer: "My friend's car is new.", explainRo: 'Posesorul cu \'s stă înaintea obiectului posedat.' },
    ],
  },

  // ---------------------------------------------------------------- 8
  {
    id: 'adverbs-frequency',
    moduleId: 'details',
    level: 'A2',
    titleRo: 'Adverbe: forma și locul lor',
    goalRo: 'Pui always, never, usually exact unde trebuie și formezi adverbele în -ly.',
    shortRo: 'always/never/usually stau înaintea verbului, dar DUPĂ „to be". Adverbul se face cu -ly (good → well).',
    mnemonicRo: 'O singură negație: „I never go", nu „I don\'t never go".',
    requires: ['adjectives'],
    category: 'word_order',
    bodyRo: `# Cum se formează
adjectiv + **-ly**: quick → quick**ly**, careful → careful**ly**, easy → eas**ily**
Neregulate: good → **well**, fast → **fast**, hard → **hard**, late → **late**
(„hardly" NU înseamnă „din greu", ci „aproape deloc": I **hardly** slept.)

# Adverbele de frecvență și locul lor
always (100%) → usually → often → sometimes → rarely / seldom → never (0%)

Regula poziției:
- **înaintea** verbului principal: I **always** drink coffee in the morning.
- **după** verbul to be: She **is** **always** late.
- **între** auxiliar și verb: I have **never** been to Spain. · You should **always** check.

„sometimes" și „usually" pot sta și la începutul propoziției: **Sometimes** I work from home.

# never = deja negativ
Nu-l combina cu o altă negație:
- ~~I don't never go~~ → I **never** go.
Engleza nu acceptă dubla negație (spre deosebire de română, unde e obligatorie: „nu merg niciodată").

# Alte adverbe
- **still** = încă: He **is still** working.
- **already** = deja: I have **already** eaten.
- **yet** = încă (în negative/întrebări, la final): I haven't finished **yet**.
- **too** (la final) / **also** (mijloc) / **as well** (final) = și, de asemenea:
  I want one **too**. · I **also** want one.

# Poziție greșită tipică
Adverbul nu se bagă între verb și obiect:
- ~~I speak well English~~ → I speak English **well**.`,
    examples: [
      { en: 'I always go to bed late.', ro: 'Mereu mă culc târziu.', bad: 'I go always to bed late.' },
      { en: 'She is never on time.', ro: 'Ea nu e niciodată la timp.', bad: 'She never is on time.' },
      { en: "I don't smoke.", ro: 'Nu fumez.', bad: "I don't never smoke." },
      { en: 'He speaks English fluently.', ro: 'El vorbește engleza fluent.', bad: 'He speaks fluently English.' },
      { en: "I haven't finished yet.", ro: 'Încă nu am terminat.', bad: "I haven't yet finished it." },
    ],
    exercises: [
      { kind: 'choice', text: 'She ___ late for work.', options: ['is never', 'never is'], answer: 'is never', explainRo: 'După to be, adverbul de frecvență vine imediat.' },
      { kind: 'choice', text: 'I ___ to the gym on Mondays.', options: ['go usually', 'usually go'], answer: 'usually go', explainRo: 'Înaintea verbului principal.' },
      { kind: 'choice', text: 'They have ___ finished the project.', options: ['already', 'yet'], answer: 'already', explainRo: '„already" în afirmativ, „yet" în negativ/întrebare.' },
      { kind: 'fill', text: 'Adverbul de la „careful" este ___ .', answer: 'carefully', explainRo: 'adjectiv + -ly.' },
      { kind: 'fill', text: 'Adverbul de la „good" este ___ .', answer: 'well', explainRo: 'Neregulat: good → well.' },
      { kind: 'fix', text: "I don't never eat meat.", answer: 'I never eat meat.', accept: ["I don't eat meat."], explainRo: 'O singură negație în engleză.' },
      { kind: 'fix', text: 'He drives very good.', answer: 'He drives very well.', explainRo: 'Verbul cere adverb: well.' },
      { kind: 'translate', text: 'Nu am fost niciodată în Grecia.', answer: 'I have never been to Greece.', accept: ["I've never been to Greece."], explainRo: 'never se pune între auxiliar și participiu.' },
    ],
  },
];
