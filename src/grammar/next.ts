// Modulul 5 — Pasul următor (B1–B2): structurile care fac diferența între „mă descurc"
// și „vorbesc bine": pasiv, vorbire indirectă, propoziții relative, povestirea la trecut,
// verbe frazale și conectori.

import type { GrammarLesson } from './types';

export const NEXT_LESSONS: GrammarLesson[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'passive',
    moduleId: 'next',
    level: 'B1',
    titleRo: 'Diateza pasivă (be + participiu)',
    goalRo: 'Spui ce s-a făcut, fără să spui cine — exact ca „se face" din română.',
    shortRo: 'to be (la timpul potrivit) + participiu: The car was repaired. Cine a făcut acțiunea se adaugă doar cu „by", și doar dacă merită.',
    mnemonicRo: 'Româna spune „se vinde", „s-a construit" — engleza spune „is sold", „was built".',
    requires: ['irregular-verbs', 'present-perfect'],
    category: 'other',
    bodyRo: `# Formula
**to be** (la timpul dorit) + **participiu** (forma a treia)

- Prezent: The office **is cleaned** every day.
- Trecut: The house **was built** in 1990.
- Present perfect: The report **has been sent**.
- Viitor: The results **will be announced** tomorrow.
- Cu modal: It **can be done** today.

# La ce folosește
Când **nu contează cine** a făcut acțiunea, nu se știe, sau e evident:
- My phone **was stolen**. (nu știu de cine)
- English **is spoken** here.

Exact rolul lui „se" din română: *se vorbește, se vinde, s-a construit*.

# Cine a făcut acțiunea: **by**
- The book **was written by** Orwell.
Dacă nu adaugi nimic, propoziția rămâne perfect corectă — asta e ideea pasivului.

# Din activ în pasiv
Obiectul devine subiect:
- **They repaired** my car. → My car **was repaired**.
- **Someone** stole my bike. → My bike **was stolen**.

# Greșeli tipice
- ~~The car was repair~~ → was **repaired** (participiu, nu formă de bază)
- ~~It was happened~~ → **It happened.** (verbele fără obiect nu au pasiv: happen, arrive, come, die)
- ~~I was born in 1990~~ e corect — „born" e mereu pasiv, atenție să nu spui „I am born".

# Structura utilă la serviciu
- It **is said that**… / It **is known that**… (se spune că / se știe că)
- The problem **is being fixed**. (chiar acum se rezolvă)`,
    examples: [
      { en: 'The house was built in 1990.', ro: 'Casa a fost construită în 1990.', bad: 'The house was build in 1990.' },
      { en: 'English is spoken all over the world.', ro: 'Engleza se vorbește în toată lumea.', bad: 'English speaks all over the world.' },
      { en: 'My laptop has been repaired.', ro: 'Laptopul meu a fost reparat.', bad: 'My laptop has repaired.' },
      { en: 'I was born in Cluj.', ro: 'M-am născut în Cluj.', bad: 'I am born in Cluj.' },
      { en: 'The problem is being fixed right now.', ro: 'Problema se rezolvă chiar acum.' },
    ],
    exercises: [
      { kind: 'fill', text: 'The letter ___ (send) yesterday.', answer: 'was sent', explainRo: 'Trecut pasiv: was + participiul lui send.' },
      { kind: 'fill', text: 'These cars ___ (make) in Germany.', answer: 'are made', explainRo: 'Plural, prezent pasiv → are + made.' },
      { kind: 'choice', text: 'The email ___ this morning.', options: ['has sent', 'has been sent'], answer: 'has been sent', explainRo: 'Present perfect pasiv: has been + participiu.' },
      { kind: 'choice', text: 'The accident ___ last night.', options: ['happened', 'was happened'], answer: 'happened', explainRo: '„happen" nu are pasiv — nu are obiect.' },
      { kind: 'fix', text: 'My wallet was steal at the station.', answer: 'My wallet was stolen at the station.', explainRo: 'steal → stole → stolen; pasivul cere participiul.' },
      { kind: 'fix', text: 'I am born in 1995.', answer: 'I was born in 1995.', explainRo: '„a se naște" e mereu la trecut pasiv: was/were born.' },
      { kind: 'translate', text: 'Casa asta se vinde.', answer: 'This house is being sold.', accept: ['This house is for sale.', 'This house is sold.'], explainRo: 'Româna cu „se" devine pasiv în engleză.' },
      { kind: 'order', text: 'Raportul va fi trimis mâine.', answer: 'The report will be sent tomorrow.', explainRo: 'Viitor pasiv: will + be + participiu.' },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'reported-speech',
    moduleId: 'next',
    level: 'B1',
    titleRo: 'Vorbirea indirectă (a spus că…)',
    goalRo: 'Povestești ce a zis altcineva, cu timpul dat un pas înapoi.',
    shortRo: 'Când raportezi ce s-a spus, verbul face un pas în trecut: „I am tired" → He said he was tired.',
    mnemonicRo: 'say + ce · tell + cuiva. „He told me that…", nu „He said me…".',
    requires: ['past-simple', 'present-perfect'],
    category: 'other',
    bodyRo: `# Regula pasului înapoi
Ce s-a spus la un timp, se raportează cu timpul mutat **un pas în trecut**:
- present simple → past simple: "I **am** tired." → He said he **was** tired.
- present continuous → past continuous: "I **am working**." → She said she **was working**.
- past simple → past perfect: "I **saw** it." → He said he **had seen** it.
- present perfect → past perfect: "I **have finished**." → He said he **had finished**.
- will → would · can → could · must → had to

# Ce se mai schimbă
- pronumele: "**I** like **your** car." → He said **he** liked **my** car.
- timpul și locul: now → then, today → that day, tomorrow → the next day, here → there, this → that

# say vs tell
- **say** (+ that) fără persoană: He **said** that he was late.
- **tell** + persoană: He **told me** that he was late.
- ~~He said me~~ · ~~He told that~~ — ambele greșite.

# Întrebări raportate: ordinea revine la normal
- "Where **do you live**?" → He asked me where I **lived**. (fără „do", fără inversiune)
- Întrebare da/nu → **if / whether**: "Are you ready?" → She asked **if** I **was** ready.

# Cereri și ordine: ask/tell + to
- "Please wait." → He asked me **to wait**.
- "Don't touch it." → She told me **not to touch** it.

# Când NU muți timpul
Dacă lucrul spus e încă adevărat, poți lăsa prezentul:
- He said he **works** in Cluj. (încă lucrează acolo)`,
    examples: [
      { en: 'He said he was tired.', ro: 'A zis că e obosit.', bad: 'He said he is tired.' },
      { en: 'She told me that she would come.', ro: 'Mi-a spus că va veni.', bad: 'She said me that she will come.' },
      { en: 'He asked me where I lived.', ro: 'M-a întrebat unde locuiesc.', bad: 'He asked me where did I live.' },
      { en: 'She asked if I was ready.', ro: 'M-a întrebat dacă sunt gata.', bad: 'She asked me am I ready.' },
      { en: 'They told us not to be late.', ro: 'Ne-au zis să nu întârziem.', bad: 'They told us to not be late.' },
    ],
    exercises: [
      { kind: 'choice', text: '"I am busy." → He said he ___ busy.', options: ['is', 'was'], answer: 'was', explainRo: 'Present simple → past simple.' },
      { kind: 'choice', text: '"I will call you." → She said she ___ call me.', options: ['will', 'would'], answer: 'would', explainRo: 'will → would.' },
      { kind: 'choice', text: 'He ___ me that he was sorry.', options: ['said', 'told'], answer: 'told', explainRo: 'Cu persoană se folosește „tell".' },
      { kind: 'fill', text: '"I have finished." → He said he ___ finished.', answer: 'had', explainRo: 'Present perfect → past perfect (had + participiu).' },
      { kind: 'fix', text: 'He said me that he was tired.', answer: 'He told me that he was tired.', accept: ['He said that he was tired.'], explainRo: '„say" nu ia persoană; „tell" da.' },
      { kind: 'fix', text: 'She asked me where do I work.', answer: 'She asked me where I worked.', explainRo: 'Întrebarea raportată are ordine normală, fără „do".' },
      { kind: 'translate', text: 'Mi-a zis că nu poate veni.', answer: 'He told me that he could not come.', accept: ["He told me he couldn't come.", "She told me she couldn't come.", 'He said he could not come.'], explainRo: 'can → could, iar „tell" cere persoana.' },
      { kind: 'order', text: 'M-a rugat să aștept afară.', answer: 'He asked me to wait outside.', explainRo: 'Cererile raportate: ask + persoană + to + verb.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'relative-clauses',
    moduleId: 'next',
    level: 'B1',
    titleRo: 'Propoziții relative: who / which / that',
    goalRo: 'Legi două idei într-o singură propoziție, ca un vorbitor fluent.',
    shortRo: 'who = pentru oameni · which = pentru lucruri · that = pentru amândouă. Nu repeta subiectul după ele.',
    mnemonicRo: '„Omul care l-am văzut" → The man I saw — în engleză „care" poate lipsi complet când urmează un subiect nou.',
    requires: ['word-order'],
    category: 'word_order',
    bodyRo: `# Cuvintele
- **who** = care (persoane): the man **who** called me
- **which** = care (lucruri): the book **which** I bought
- **that** = care (și persoane, și lucruri; cel mai folosit în vorbire): the film **that** we saw
- **whose** = al cărui / a cărei: the woman **whose** car was stolen
- **where** = unde: the town **where** I grew up
- **when** = când: the day **when** we met

# Greșeala nr. 1: subiectul dublu
După „who/which/that" **nu** se mai repetă subiectul:
- ~~The man who he called me~~ → The man **who called me**
- ~~The book which I bought it~~ → The book **which I bought**

# Când poți sări peste „that"
Dacă după el urmează un **subiect nou**, relativul poate lipsi:
- The film (that) **we** saw was great.
- The man (who) **I** met yesterday…

Dar dacă relativul e chiar subiectul, rămâne obligatoriu:
- The man **who** called me… (nu poți sări)

# Cu virgulă = informație în plus
- My brother, **who lives in Spain**, is a doctor. (am un singur frate; informația e bonus)
- The man **who lives next door** is a doctor. (fără virgulă: exact ăla, nu altul)
Cu virgulă nu se folosește „that".

# Prepoziția
- The person **I spoke to** (vorbit, natural) / **to whom I spoke** (formal)`,
    examples: [
      { en: 'The man who called me is my boss.', ro: 'Omul care m-a sunat e șeful meu.', bad: 'The man who he called me is my boss.' },
      { en: 'This is the book that I told you about.', ro: 'Asta e cartea despre care ți-am spus.', bad: 'This is the book that I told you about it.' },
      { en: 'The town where I grew up is small.', ro: 'Orașul în care am crescut e mic.', bad: 'The town which I grew up is small.' },
      { en: 'She is the woman whose son works with me.', ro: 'Ea e femeia al cărei fiu lucrează cu mine.', bad: 'She is the woman which son works with me.' },
      { en: 'My sister, who lives in Berlin, is visiting.', ro: 'Sora mea, care locuiește în Berlin, vine în vizită.' },
    ],
    exercises: [
      { kind: 'choice', text: 'The girl ___ won the prize is my cousin.', options: ['who', 'which'], answer: 'who', explainRo: 'Persoane → who.' },
      { kind: 'choice', text: 'This is the car ___ I bought last year.', options: ['who', 'which'], answer: 'which', explainRo: 'Lucruri → which (sau that).' },
      { kind: 'fill', text: 'That\'s the man ___ dog barks all night.', answer: 'whose', explainRo: 'Posesie într-o relativă → whose.' },
      { kind: 'fill', text: 'This is the restaurant ___ we had dinner.', answer: 'where', explainRo: 'Loc → where.' },
      { kind: 'fix', text: 'The woman who she works here is nice.', answer: 'The woman who works here is nice.', explainRo: '„who" e deja subiectul — nu se mai pune „she".' },
      { kind: 'fix', text: 'The film which we saw it was boring.', answer: 'The film which we saw was boring.', accept: ['The film that we saw was boring.', 'The film we saw was boring.'], explainRo: 'Obiectul nu se repetă după relativ.' },
      { kind: 'translate', text: 'Omul care locuiește lângă mine e medic.', answer: 'The man who lives next to me is a doctor.', accept: ['The man that lives next to me is a doctor.'], explainRo: 'who + verb, fără subiect repetat; meseria ia „a".' },
      { kind: 'order', text: 'Asta e casa pe care am cumpărat-o anul trecut.', answer: 'This is the house that I bought last year.', explainRo: 'Relativul + subiect nou + verb, fără „it" la final.' },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'past-narration',
    moduleId: 'next',
    level: 'B1',
    titleRo: 'Povestirea la trecut: was doing, had done, used to',
    goalRo: 'Spui o întâmplare cu fundal, acțiune și „înainte de asta".',
    shortRo: 'was/were + -ing = fundalul · past simple = acțiunea care taie fundalul · had + participiu = ce fusese înainte · used to = obicei din trecut, terminat.',
    mnemonicRo: 'I was walking (fundal) when the phone rang (acțiune). Fundalul e mereu la -ing.',
    requires: ['past-simple', 'irregular-verbs'],
    category: 'past_simple',
    bodyRo: `# Past Continuous — fundalul
**was / were + verb-ing**: acțiune în desfășurare la un moment din trecut.
- At 8 o'clock I **was having** dinner.
- While I **was driving**, it started to rain.

Se combină des cu past simple: acțiunea scurtă **întrerupe** fundalul lung.
- I **was walking** home **when** the phone **rang**.
Ține minte: **while** + fundal (-ing), **when** + acțiune scurtă (past simple).

# Past Perfect — „mai înainte de asta"
**had + participiu**: ceva terminat ÎNAINTE de alt lucru din trecut.
- When I arrived, the train **had already left**. (întâi a plecat, apoi am ajuns)
- I couldn't get in because I **had forgotten** my keys.

Fără past perfect, ordinea evenimentelor se pierde:
- When I arrived, the train **left**. = a plecat după ce am ajuns.

# used to — obiceiuri terminate
**used to + verb**: ceva ce era adevărat în trecut, dar nu mai e.
- I **used to** smoke. (nu mai fumez)
- We **used to** live in Brașov.
- Negativ/întrebare: I **didn't use to**… · **Did** you **use to**…? (fără -d)

Nu-l confunda cu:
- **be used to + -ing** = a fi obișnuit cu: I'm **used to working** late.
- **get used to + -ing** = a se obișnui cu

# Șablonul unei povestiri
1. fundal → It **was raining** and I **was waiting** for the bus.
2. acțiune → Suddenly, a car **stopped**.
3. ce fusese înainte → It was my neighbour, who **had seen** me from the road.`,
    examples: [
      { en: 'I was cooking when he called.', ro: 'Găteam când a sunat.', bad: 'I cooked when he was calling.' },
      { en: 'When we arrived, the film had already started.', ro: 'Când am ajuns, filmul începuse deja.', bad: 'When we arrived, the film already started.' },
      { en: 'I used to play football every weekend.', ro: 'Jucam fotbal în fiecare weekend.', bad: 'I used to played football every weekend.' },
      { en: "I'm used to working from home.", ro: 'M-am obișnuit să lucrez de acasă.', noteRo: '„I used to work from home" = lucram atunci, dar nu mai lucrez. Complet alt sens.' },
      { en: 'While I was reading, the lights went out.', ro: 'În timp ce citeam, s-a luat curentul.' },
    ],
    exercises: [
      { kind: 'fill', text: 'I ___ (watch) TV when you called.', answer: 'was watching', explainRo: 'Fundal întrerupt de o acțiune scurtă → past continuous.' },
      { kind: 'fill', text: 'She was tired because she ___ (not / sleep) well.', answer: "hadn't slept", accept: ['had not slept'], explainRo: 'Cauza s-a petrecut înaintea stării → past perfect.' },
      { kind: 'choice', text: 'When I got to the station, the train ___ .', options: ['left', 'had left'], answer: 'had left', explainRo: 'Plecase înainte de sosirea mea.' },
      { kind: 'choice', text: 'I ___ have long hair when I was a child.', options: ['used to', 'was used to'], answer: 'used to', explainRo: 'Obicei trecut, terminat → used to + verb.' },
      { kind: 'choice', text: "I'm ___ up early now.", options: ['used to get', 'used to getting'], answer: 'used to getting', explainRo: '„be used to" cere -ing.' },
      { kind: 'fix', text: 'I was going to the shop when I have seen him.', answer: 'I was going to the shop when I saw him.', explainRo: 'Acțiunea scurtă din trecut e past simple, nu present perfect.' },
      { kind: 'fix', text: 'She didn\'t used to like coffee.', answer: "She didn't use to like coffee.", explainRo: 'După „didn\'t" rămâne „use", fără -d.' },
      { kind: 'order', text: 'Ploua când am ieșit afară.', answer: 'It was raining when I went outside.', explainRo: 'Fundal la -ing, acțiunea scurtă la past simple.' },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'phrasal-verbs',
    moduleId: 'next',
    level: 'B1',
    titleRo: 'Verbe frazale esențiale',
    goalRo: 'Înțelegi și folosești verbele din două cuvinte care apar în engleza reală.',
    shortRo: 'Verb + particulă = alt sens (look = a privi, look after = a avea grijă). Se învață ca pe cuvinte noi, nu se traduc pe bucăți.',
    mnemonicRo: 'Când pronumele e obiect, intră la mijloc: „turn it off", nu „turn off it".',
    requires: ['present-simple'],
    category: 'vocabulary',
    bodyRo: `# Ce sunt
Un verb + o particulă (up, off, on, out, in, down, over…) care împreună au **alt sens** decât verbul singur.
- look = a privi · **look after** = a avea grijă de · **look for** = a căuta · **look forward to** = a abia aștepta

Nu se traduc bucată cu bucată. Se învață ca expresii întregi, ca orice cuvânt nou.

# Poziția pronumelui
Dacă obiectul e un **pronume** (it, them, him), el intră **între** verb și particulă:
- Turn **it** off. (~~Turn off it~~)
- I'll pick **you** up at 8.
Cu un substantiv, merg amândouă: Turn **off the light** / Turn **the light off**.

# Cele mai utile, pe teme

**Zi de zi**
get up (a se trezi) · wake up · turn on / off · put on (a se îmbrăca cu) · take off (a scoate; a decola) · run out of (a rămâne fără) · throw away

**Oameni**
get on with (a se înțelege cu) · look after (a avea grijă) · pick up (a lua de undeva) · drop off (a lăsa) · take care of · break up (a se despărți) · come over (a veni în vizită)

**Muncă**
find out (a afla) · figure out (a-și da seama) · deal with (a se ocupa de) · set up (a înființa, a configura) · carry on (a continua) · put off (a amâna) · give up (a renunța) · work out (a rezolva; a face sport) · come up with (a veni cu o idee) · fill in / fill out (a completa)

**Conversație**
hang on (a aștepta) · hang up (a închide telefonul) · call back · get back to (a reveni cu un răspuns) · bring up (a aduce în discuție) · point out (a semnala)

# Atenție la sensuri multiple
**pick up** = a lua de jos, a lua pe cineva cu mașina, a învăța ceva din mers, a răspunde la telefon. Contextul decide.`,
    examples: [
      { en: 'Can you turn it off, please?', ro: 'Poți să-l oprești, te rog?', bad: 'Can you turn off it, please?' },
      { en: "I'll pick you up at eight.", ro: 'Te iau la opt.', bad: "I'll pick up you at eight." },
      { en: 'I need to find out what happened.', ro: 'Trebuie să aflu ce s-a întâmplat.', bad: 'I need to find what happened out.' },
      { en: "We've run out of milk.", ro: 'Am rămas fără lapte.', noteRo: '„We finished the milk" se înțelege, dar niciun englez nu spune așa.' },
      { en: "Don't give up.", ro: 'Nu renunța.', bad: "Don't renounce." },
    ],
    exercises: [
      { kind: 'choice', text: 'Could you ___ the children this evening?', options: ['look after', 'look for'], answer: 'look after', explainRo: 'look after = a avea grijă de cineva.' },
      { kind: 'choice', text: "I'm trying to ___ how this works.", options: ['figure out', 'give up'], answer: 'figure out', explainRo: 'figure out = a-și da seama.' },
      { kind: 'choice', text: 'We ___ coffee this morning.', options: ['ran out of', 'put off'], answer: 'ran out of', explainRo: 'run out of = a rămâne fără.' },
      { kind: 'fill', text: 'The meeting was ___ off until next week. (amânată)', answer: 'put', explainRo: 'put off = a amâna.' },
      { kind: 'fix', text: 'Please turn off it before you leave.', answer: 'Please turn it off before you leave.', explainRo: 'Pronumele obiect stă între verb și particulă.' },
      { kind: 'fix', text: 'I look forward to meet you.', answer: 'I look forward to meeting you.', explainRo: '„to" din „look forward to" e prepoziție → -ing.' },
      { kind: 'translate', text: 'Trebuie să mă ocup de asta azi.', answer: 'I have to deal with this today.', accept: ['I need to deal with this today.'], explainRo: 'deal with = a se ocupa de.' },
      { kind: 'order', text: 'Te sun eu mai târziu.', answer: 'I will call you back later.', accept: ["I'll call you back later."], explainRo: 'call back cu pronume la mijloc: call you back.' },
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'connectors',
    moduleId: 'next',
    level: 'B2',
    titleRo: 'Conectarea ideilor (but, although, however…)',
    goalRo: 'Legi frazele într-un discurs care sună matur, nu tocat.',
    shortRo: 'although / because + propoziție întreagă · because of / despite + substantiv · however / therefore leagă două fraze separate.',
    mnemonicRo: 'Un singur conector per legătură: „Although it was late, I stayed" — fără „but" în plus.',
    requires: ['word-order'],
    category: 'unnatural_phrasing',
    bodyRo: `# Contrast
- **but** (în interiorul frazei): It was late, **but** I stayed.
- **although / though / even though** + propoziție cu subiect și verb: **Although** it was late, I stayed.
- **however** (frază nouă, cu virgulă): It was late. **However**, I stayed.
- **despite / in spite of** + substantiv sau -ing: **Despite** the rain, we went out. · **In spite of being** tired, he worked.

Greșeala clasică: „Although it was late, **but** I stayed." — un singur conector, nu două.

# Cauză și efect
- **because** + propoziție: I stayed **because** it was raining.
- **because of / due to** + substantiv: I stayed **because of** the rain.
- **so** (rezultat): It was raining, **so** I stayed.
- **therefore / as a result** (formal, frază nouă): It was raining. **Therefore**, we cancelled.

# Adăugare
- **and**, **also**, **too** (la final), **as well as**, **in addition**, **moreover** (formal)
- **Both** … **and** … · **not only** … **but also** …

# Ordinea în timp
first, then, after that, meanwhile, finally, in the end

# A explica și a rezuma
- **for example / for instance**
- **in other words** (cu alte cuvinte)
- **that is to say**
- **overall / in short / to sum up**

# Nuanțe utile la muncă
- **actually** = de fapt (corectezi politicos)
- **by the way** = apropo
- **anyway** = oricum, ca să revenim
- **on the other hand** = pe de altă parte`,
    examples: [
      { en: 'Although it was expensive, I bought it.', ro: 'Deși era scump, l-am cumpărat.', bad: 'Although it was expensive, but I bought it.' },
      { en: 'We stayed home because of the storm.', ro: 'Am rămas acasă din cauza furtunii.', bad: 'We stayed home because of it was storming.' },
      { en: 'It was raining. However, we went out.', ro: 'Ploua. Totuși, am ieșit.', bad: 'It was raining, however we went out.' },
      { en: 'Despite the traffic, we arrived on time.', ro: 'În ciuda traficului, am ajuns la timp.', bad: 'Despite the traffic was bad, we arrived on time.' },
      { en: 'The deadline moved, so we changed the plan.', ro: 'Termenul s-a mutat, așa că am schimbat planul.' },
    ],
    exercises: [
      { kind: 'choice', text: '___ the bad weather, the flight left on time.', options: ['Although', 'Despite'], answer: 'Despite', explainRo: 'Urmează un substantiv → despite / in spite of.' },
      { kind: 'choice', text: '___ it was raining, we went for a walk.', options: ['Despite', 'Although'], answer: 'Although', explainRo: 'Urmează o propoziție întreagă → although.' },
      { kind: 'choice', text: 'The meeting was cancelled ___ the strike.', options: ['because', 'because of'], answer: 'because of', explainRo: '„the strike" e substantiv → because of.' },
      { kind: 'fill', text: 'It was late. ___ , I finished the report. (totuși)', answer: 'However', explainRo: '„However" începe o frază nouă, urmat de virgulă.' },
      { kind: 'fix', text: 'Although he was tired, but he kept working.', answer: 'Although he was tired, he kept working.', accept: ['He was tired, but he kept working.'], explainRo: 'Ori „although", ori „but" — nu amândouă.' },
      { kind: 'fix', text: 'We cancelled the trip because of it was snowing.', answer: 'We cancelled the trip because it was snowing.', accept: ['We cancelled the trip because of the snow.'], explainRo: '„because of" cere substantiv, „because" cere propoziție.' },
      { kind: 'translate', text: 'Pe de altă parte, e mai ieftin.', answer: 'On the other hand, it is cheaper.', accept: ["On the other hand, it's cheaper."], explainRo: 'Expresie fixă: on the other hand.' },
      { kind: 'order', text: 'Deși era târziu, am terminat treaba.', answer: 'Although it was late, I finished the work.', explainRo: 'although + propoziție, virgulă, apoi partea a doua fără „but".' },
    ],
  },
];
