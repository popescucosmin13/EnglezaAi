// Modulul 2 — Timpurile verbale: prezent simplu/continuu, trecut, verbe neregulate,
// viitor și present perfect (cu diferența față de past simple).

import type { GrammarLesson } from './types';

export const TENSES_LESSONS: GrammarLesson[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'present-simple',
    moduleId: 'tenses',
    level: 'A1',
    titleRo: 'Present Simple',
    goalRo: 'Vorbești despre rutine și adevăruri generale, cu -s la persoana a III-a.',
    shortRo: 'Rutine și adevăruri. La he/she/it verbul primește -s. Negativ și întrebare cu do/does — și atunci -s dispare.',
    mnemonicRo: 'He works → He doesn\'t work. „S"-ul apare o singură dată: ori la verb, ori în „does".',
    requires: ['to-be'],
    category: 'present_simple',
    bodyRo: `# Când îl folosești
- **Rutine și obiceiuri**: I go to work at 8.
- **Adevăruri generale**: Water boils at 100 degrees.
- **Programe fixe**: The train leaves at 7:15.

Cuvinte care îl însoțesc: always, usually, often, sometimes, never, every day, on Mondays.

# Regula de aur: -s la he / she / it
- I / you / we / they **work**
- he / she / it **works**

Ortografie:
- după s, ss, sh, ch, x, o → **-es**: watch**es**, go**es**, do**es**, miss**es**
- consoană + y → **-ies**: stud**ies**, fl**ies** (dar: pla**ys**, sa**ys**)

Uitarea acestui **-s** e cea mai frecventă greșeală a vorbitorilor de română. Nu se aude „important", dar se aude imediat că lipsește.

# Negativ și interogativ: do / does
- I **don't** work on Sundays.
- He **doesn't** work on Sundays. ← atenție: **doesn't work**, nu „doesn't works". „-s"-ul e deja în „does".
- **Do** you speak English? · **Does** she live here?
- Răspuns scurt: Yes, I **do**. / No, she **doesn't**.

# Fără „do" la to be
- Are you tired? (nu „Do you be tired?")`,
    examples: [
      { en: 'He works in IT.', ro: 'El lucrează în IT.', bad: 'He work in IT.' },
      { en: "She doesn't like coffee.", ro: 'Ei nu-i place cafeaua.', bad: "She doesn't likes coffee." },
      { en: 'Do you live in Bucharest?', ro: 'Locuiești în București?', bad: 'You live in Bucharest?' },
      { en: 'The shop opens at nine.', ro: 'Magazinul se deschide la nouă.', bad: 'The shop open at nine.' },
      { en: 'I never eat breakfast.', ro: 'Nu mănânc niciodată micul dejun.', bad: 'I don\'t never eat breakfast.', noteRo: 'Cu „never" nu mai pui și „don\'t" — o singură negație.' },
    ],
    exercises: [
      { kind: 'fill', text: 'My sister ___ (study) medicine.', answer: 'studies', explainRo: 'Consoană + y → -ies la persoana a III-a.' },
      { kind: 'fill', text: 'He ___ (go) to the gym every day.', answer: 'goes', explainRo: 'Verbele în -o primesc -es.' },
      { kind: 'choice', text: 'She ___ speak French.', options: ["don't", "doesn't", 'not'], answer: "doesn't", explainRo: 'he/she/it → does + not.' },
      { kind: 'choice', text: '___ they work on Saturdays?', options: ['Do', 'Does', 'Are'], answer: 'Do', explainRo: '„they" → do.' },
      { kind: 'fix', text: 'He doesn\'t works here.', answer: "He doesn't work here.", accept: ['He does not work here.'], explainRo: 'După „does" verbul revine la forma de bază.' },
      { kind: 'fix', text: 'My brother live in Spain.', answer: 'My brother lives in Spain.', explainRo: '„My brother" = he → lives.' },
      { kind: 'fix', text: 'Do she like pizza?', answer: 'Does she like pizza?', explainRo: 'she → does.' },
      { kind: 'translate', text: 'El se trezește la șase în fiecare dimineață.', answer: 'He gets up at six every morning.', accept: ['He wakes up at six every morning.'], explainRo: 'Rutină → present simple + -s la persoana a III-a.' },
      { kind: 'translate', text: 'Nu înțeleg întrebarea.', answer: "I don't understand the question.", accept: ['I do not understand the question.'], explainRo: 'Negativ cu don\'t pentru „I".' },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'present-continuous',
    moduleId: 'tenses',
    level: 'A2',
    titleRo: 'Present Continuous (și cum îl deosebești de Simple)',
    goalRo: 'Spui ce se întâmplă chiar acum și știi ce verbe nu merg cu -ing.',
    shortRo: 'am/is/are + verb-ing = chiar acum sau temporar. Verbele de stare (know, want, like, understand) nu merg cu -ing.',
    mnemonicRo: 'I work = meseria mea. I\'m working = fix în clipa asta.',
    requires: ['present-simple'],
    category: 'present_simple',
    bodyRo: `# Formula
**to be (am / is / are) + verb-ing**
- I **am reading** right now.
- They **are working**.
- She **isn't listening**. · **Are** you **coming**?

Ortografia lui -ing:
- verb terminat în -e mut: mak**e** → mak**ing**, com**e** → com**ing**
- o vocală + o consoană accentuată: si**t** → si**tt**ing, ru**n** → ru**nn**ing, ge**t** → ge**tt**ing
- lie → **lying**

# Când îl folosești
- Acțiune **acum**: I'm cooking dinner.
- Perioadă temporară: I'm working from home **this week**.
- Aranjamente viitoare fixate: I'm meeting Ana **tomorrow at 5**.
- Ceva enervant, cu „always": He's **always** losing his keys.

# Simple vs Continuous
- I **work** in a bank. (în general, meseria mea)
- I **am working** right now. (chiar acum)
- She **speaks** Spanish. (știe spaniolă)
- She **is speaking** Spanish. (chiar acum vorbește)

# Verbe care NU se pun la -ing (verbe de stare)
know, understand, want, need, like, love, hate, believe, remember, mean, prefer, belong, cost, seem
- ~~I am knowing~~ → **I know.**
- ~~I am wanting~~ → **I want.**

Excepție cunoscută: „I'**m loving** it" (slogan publicitar), și „I'm thinking about…" când e vorba de proces de gândire, nu de opinie.`,
    examples: [
      { en: "I'm cooking dinner right now.", ro: 'Gătesc cina chiar acum.', bad: 'I cook dinner right now.' },
      { en: 'I know the answer.', ro: 'Știu răspunsul.', bad: 'I am knowing the answer.' },
      { en: 'She is running late.', ro: 'Ea întârzie.', bad: 'She is runing late.', noteRo: 'run → running (consoana se dublează).' },
      { en: 'What are you doing?', ro: 'Ce faci?', bad: 'What you are doing?' },
      { en: 'I work in marketing, but this month I am working on a new project.', ro: 'Lucrez în marketing, dar luna asta lucrez la un proiect nou.', noteRo: 'Prima = general, a doua = temporar.' },
    ],
    exercises: [
      { kind: 'fill', text: 'Look! It ___ (rain).', answer: 'is raining', accept: ["'s raining"], explainRo: 'Acțiune care se întâmplă acum → to be + -ing.' },
      { kind: 'fill', text: 'They ___ (sit) in the garden at the moment.', answer: 'are sitting', explainRo: 'sit → sitting (dublăm consoana finală).' },
      { kind: 'choice', text: 'I ___ what you mean.', options: ['am understanding', 'understand'], answer: 'understand', explainRo: '„understand" e verb de stare — nu are formă continuă.' },
      { kind: 'choice', text: 'He usually ___ the bus to work.', options: ['takes', 'is taking'], answer: 'takes', explainRo: '„usually" = rutină → present simple.' },
      { kind: 'choice', text: 'Be quiet, the baby ___ .', options: ['sleeps', 'is sleeping'], answer: 'is sleeping', explainRo: 'Chiar acum → continuous.' },
      { kind: 'fix', text: 'I am wanting a coffee.', answer: 'I want a coffee.', explainRo: '„want" nu se folosește la continuous.' },
      { kind: 'fix', text: 'What you are doing tonight?', answer: 'What are you doing tonight?', explainRo: 'În întrebare, „are" trece înaintea subiectului.' },
      { kind: 'translate', text: 'Acum vorbesc cu șeful meu.', answer: 'I am talking to my boss now.', accept: ["I'm talking to my boss now.", "I'm speaking to my boss now.", 'I am speaking with my boss now.'], explainRo: 'Acțiune în desfășurare → am + -ing.' },
      { kind: 'translate', text: 'Ea nu se uită la televizor în seara asta.', answer: "She isn't watching TV tonight.", accept: ['She is not watching TV tonight.', "She's not watching TV tonight."], explainRo: 'Negativ: is + not + -ing.' },
      { kind: 'order', text: 'Copiii se joacă în parc acum.', answer: 'The children are playing in the park now.', explainRo: 'Plural → are + -ing; locul înaintea timpului.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'past-simple',
    moduleId: 'tenses',
    level: 'A1',
    titleRo: 'Past Simple',
    goalRo: 'Povestești ce s-a întâmplat, cu -ed sau forma neregulată, și folosești „did" corect.',
    shortRo: 'Acțiune terminată: verb + -ed sau forma neregulată, aceeași la toate persoanele. Cu did/didn\'t verbul revine la forma de bază.',
    mnemonicRo: 'Did you go? — nu „Did you went?". „did" ia toată vina trecutului.',
    requires: ['present-simple'],
    category: 'past_simple',
    bodyRo: `# Când îl folosești
Acțiuni **terminate**, într-un moment **încheiat** din trecut: yesterday, last week, in 2019, two days ago, when I was a child.

# Verbe regulate: + **-ed**
work → work**ed**, play → play**ed**
- verb în -e: lik**e** → lik**ed**
- consoană + y: stud**y** → stud**ied**
- vocală + consoană accentuată: sto**p** → sto**pp**ed

Forma e **aceeași pentru toate persoanele**: I worked, he worked, they worked.

# Verbe neregulate
Se învață pe de rost: go → **went**, see → **saw**, eat → **ate**, have → **had**, make → **made**, take → **took**.
(Ai o lecție separată doar cu lista esențială.)

# Negativ și întrebare: **did**
Cu „did", verbul principal revine la **forma de bază** — fără -ed, fără formă neregulată:
- I **didn't work** yesterday. (nu „didn't worked")
- **Did** you **go** to Paris? (nu „Did you went")
- Răspuns scurt: Yes, I **did**. / No, I **didn't**.

# to be face excepție
was / were — fără „did":
- I / he / she / it **was** · you / we / they **were**
- I **wasn't** at home. · **Were** you tired?

# Capcana românească
Româna are un singur perfect compus („am mers"), engleza alege între **went** (moment încheiat) și **have gone** (legătură cu prezentul). Dacă ai în propoziție un moment trecut precis (yesterday, last year, at 5), folosește **past simple**.`,
    examples: [
      { en: 'I went to Paris last year.', ro: 'Am fost la Paris anul trecut.', bad: 'I have gone to Paris last year.' },
      { en: "I didn't see him.", ro: 'Nu l-am văzut.', bad: "I didn't saw him." },
      { en: 'Did you finish the report?', ro: 'Ai terminat raportul?', bad: 'Did you finished the report?' },
      { en: 'We were at the cinema.', ro: 'Am fost la cinema.', bad: 'We did be at the cinema.' },
      { en: 'She studied all night.', ro: 'A învățat toată noaptea.', bad: 'She studyed all night.' },
    ],
    exercises: [
      { kind: 'fill', text: 'They ___ (arrive) an hour ago.', answer: 'arrived', explainRo: 'Verb regulat + -ed.' },
      { kind: 'fill', text: 'I ___ (go) to school by bus when I was little.', answer: 'went', explainRo: 'go → went (neregulat).' },
      { kind: 'fill', text: 'She ___ (not / come) to the meeting.', answer: "didn't come", accept: ['did not come'], explainRo: 'Negativ: didn\'t + forma de bază.' },
      { kind: 'choice', text: '___ you speak to her yesterday?', options: ['Did', 'Do', 'Were'], answer: 'Did', explainRo: 'Întrebare la trecut → did.' },
      { kind: 'choice', text: 'He ___ at home last night.', options: ['was', 'were', 'did be'], answer: 'was', explainRo: 'to be la trecut: he → was.' },
      { kind: 'fix', text: 'I didn\'t went to the party.', answer: "I didn't go to the party.", accept: ['I did not go to the party.'], explainRo: 'După „did" verbul e la forma de bază.' },
      { kind: 'fix', text: 'Did she bought a new car?', answer: 'Did she buy a new car?', explainRo: 'Același lucru la întrebare: did + buy.' },
      { kind: 'fix', text: 'We was very tired.', answer: 'We were very tired.', explainRo: 'we → were.' },
      { kind: 'translate', text: 'Am văzut filmul săptămâna trecută.', answer: 'I saw the film last week.', accept: ['I watched the film last week.', 'I saw the movie last week.', 'I watched the movie last week.'], explainRo: 'Moment încheiat („last week") → past simple.' },
      { kind: 'translate', text: 'Nu am înțeles ce a spus.', answer: "I didn't understand what he said.", accept: ['I did not understand what he said.', "I didn't understand what she said."], explainRo: 'didn\'t + understand; „said" e trecutul lui say.' },
      { kind: 'order', text: 'Nu am mers la petrecere aseară.', answer: 'I did not go to the party last night.', accept: ["I didn't go to the party last night."], explainRo: 'didn\'t + verbul la forma de bază, apoi locul și timpul.' },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'irregular-verbs',
    moduleId: 'tenses',
    level: 'A2',
    titleRo: 'Verbele neregulate esențiale',
    goalRo: 'Știi cele ~40 de verbe neregulate care apar în 90% din conversații.',
    shortRo: 'Trei forme: go – went – gone. A doua = trecutul, a treia = după have/has/had și la pasiv.',
    mnemonicRo: 'Învață-le pe grupe de sunet (bought, brought, thought), nu alfabetic.',
    requires: ['past-simple'],
    category: 'irregular_verb',
    bodyRo: `# Cum se învață
Fiecare verb neregulat are **trei forme**: bază → trecut (past simple) → participiu (past participle, folosit la present perfect și la pasiv).
- go → went → gone
- eat → ate → eaten

Învață-le **pe grupe de sunet**, nu alfabetic — se rețin de câteva ori mai repede.

# Grupa 1: toate trei la fel
cut → cut → cut · put → put → put · let → let → let · hit → hit → hit · cost → cost → cost · read → read → read (dar se pronunță „red" la trecut)

# Grupa 2: trecut = participiu
have → had → had · say → said → said · make → made → made · find → found → found · buy → bought → bought · bring → brought → brought · think → thought → thought · teach → taught → taught · catch → caught → caught · tell → told → told · sell → sold → sold · leave → left → left · feel → felt → felt · keep → kept → kept · sleep → slept → slept · meet → met → met · sit → sat → sat · win → won → won · pay → paid → paid · stand → stood → stood · understand → understood → understood

# Grupa 3: toate trei diferite
be → was/were → been · go → went → gone · do → did → done · see → saw → seen · eat → ate → eaten · give → gave → given · take → took → taken · write → wrote → written · speak → spoke → spoken · break → broke → broken · choose → chose → chosen · drive → drove → driven · know → knew → known · grow → grew → grown · begin → began → begun · drink → drank → drunk · swim → swam → swum · wear → wore → worn · fall → fell → fallen · forget → forgot → forgotten

# Atenție
Toate astea dispar după **did**: „Did you *go*?", nu „Did you went?".`,
    examples: [
      { en: 'I have never eaten sushi.', ro: 'Nu am mâncat niciodată sushi.', bad: 'I have never ate sushi.', noteRo: 'După „have" merge participiul: eaten.' },
      { en: 'He took the bus.', ro: 'A luat autobuzul.', bad: 'He taked the bus.' },
      { en: 'She has written three books.', ro: 'A scris trei cărți.', bad: 'She has wrote three books.' },
      { en: 'They brought a cake.', ro: 'Au adus un tort.', bad: 'They bringed a cake.' },
      { en: 'I paid for dinner.', ro: 'Am plătit cina.', bad: 'I payed for dinner.' },
    ],
    exercises: [
      { kind: 'fill', text: 'Trecutul lui „buy" este ___ .', answer: 'bought', explainRo: 'buy → bought → bought.' },
      { kind: 'fill', text: 'Trecutul lui „take" este ___ .', answer: 'took', explainRo: 'take → took → taken.' },
      { kind: 'fill', text: 'Participiul (a treia formă) lui „write" este ___ .', answer: 'written', explainRo: 'write → wrote → written.' },
      { kind: 'fill', text: 'Participiul lui „see" este ___ .', answer: 'seen', explainRo: 'see → saw → seen.' },
      { kind: 'fill', text: 'Trecutul lui „teach" este ___ .', answer: 'taught', explainRo: 'teach → taught → taught.' },
      { kind: 'choice', text: 'I have ___ my keys.', options: ['lost', 'lose', 'losed'], answer: 'lost', explainRo: 'lose → lost → lost.' },
      { kind: 'fix', text: 'She has broke the glass.', answer: 'She has broken the glass.', explainRo: 'După „has" merge participiul: broken.' },
      { kind: 'fix', text: 'We goed to the beach.', answer: 'We went to the beach.', explainRo: 'go e neregulat: went.' },
      { kind: 'translate', text: 'Am uitat parola.', answer: 'I forgot my password.', accept: ["I've forgotten my password.", 'I have forgotten my password.'], explainRo: 'forget → forgot → forgotten.' },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'future',
    moduleId: 'tenses',
    level: 'A2',
    titleRo: 'Viitorul: will / going to',
    goalRo: 'Alegi între will și going to în funcție de cât de plănuit e lucrul.',
    shortRo: 'will = decizie pe loc, promisiune, predicție · going to = plan deja făcut. După if/when se pune prezentul, nu viitorul.',
    mnemonicRo: 'will + verb gol: fără „to", fără „-s". He will help.',
    requires: ['present-simple'],
    category: 'auxiliary',
    bodyRo: `# will + verb la forma de bază
- I **will help** you. · It **will rain** tomorrow.
- Scurt: I'**ll**, you'**ll**, he'**ll**, we'**ll**, they'**ll**
- Negativ: **won't** (= will not) — I **won't** be late.
- Întrebare: **Will** you come?

**will** nu ia niciodată „to": ~~I will to help~~ → I will help.
Și nu primește -s la persoana a III-a: ~~He wills~~ → He **will**.

# Când folosești will
- Decizie luată **pe loc**: The phone is ringing — I'**ll** get it!
- Predicție / părere: I think it **will** be fine.
- Promisiune, ofertă, refuz: I'**ll** call you tomorrow.

# be going to + verb
- Plan deja făcut: I'**m going to** start a new course next month.
- Predicție cu dovadă vizibilă: Look at those clouds — it'**s going to** rain.

# Present continuous pentru viitor
Aranjamente fixate, cu oră și loc: I'**m meeting** the client at 4 tomorrow.

# Nu folosi viitorul după when / if / as soon as
După aceste cuvinte engleza pune **prezentul**, deși în română spui viitorul:
- When I **get** home, I'll call you. (Când voi ajunge acasă…)
- If it **rains**, we'll stay in. (Dacă va ploua…)
- I'll tell you as soon as I **know**.`,
    examples: [
      { en: "I'll call you tonight.", ro: 'Te sun diseară.', bad: 'I will to call you tonight.' },
      { en: "I'm going to buy a new laptop.", ro: 'O să-mi cumpăr un laptop nou.', noteRo: 'Plan deja luat, nu decizie de moment → going to.' },
      { en: "When I finish work, I'll come over.", ro: 'Când termin treaba, vin la tine.', bad: 'When I will finish work, I will come over.' },
      { en: "He won't be here tomorrow.", ro: 'El nu va fi aici mâine.', bad: "He willn't be here tomorrow." },
      { en: 'Look out, you are going to fall!', ro: 'Ai grijă, o să cazi!', noteRo: 'Dovadă vizibilă → going to.' },
    ],
    exercises: [
      { kind: 'choice', text: 'The phone is ringing. — I ___ answer it.', options: ["'ll", "'m going to"], answer: "'ll", explainRo: 'Decizie luată pe loc → will.' },
      { kind: 'choice', text: "We've already decided: we ___ move to Spain.", options: ['will', 'are going to'], answer: 'are going to', explainRo: 'Plan deja făcut → going to.' },
      { kind: 'choice', text: "If it ___ tomorrow, we'll cancel the trip.", options: ['will rain', 'rains'], answer: 'rains', explainRo: 'După „if" nu se pune „will".' },
      { kind: 'fill', text: 'I ___ (not / be) late, I promise.', answer: "won't be", accept: ['will not be'], explainRo: 'will + not = won\'t, apoi verbul la bază.' },
      { kind: 'fix', text: 'He will to help us.', answer: 'He will help us.', explainRo: 'După „will" verbul nu ia „to".' },
      { kind: 'fix', text: 'When I will arrive, I will send you a message.', answer: "When I arrive, I will send you a message.", accept: ["When I arrive, I'll send you a message."], explainRo: 'După „when" cu sens de viitor se folosește prezentul.' },
      { kind: 'translate', text: 'Mâine o să plouă.', answer: 'It will rain tomorrow.', accept: ["It's going to rain tomorrow.", 'It is going to rain tomorrow.', "It'll rain tomorrow."], explainRo: 'Predicție → will sau going to.' },
      { kind: 'translate', text: 'Te ajut eu.', answer: 'I will help you.', accept: ["I'll help you."], explainRo: 'Ofertă spontană → will.' },
      { kind: 'order', text: 'Te sun când ajung acasă.', answer: 'I will call you when I get home.', accept: ["I'll call you when I get home."], explainRo: 'will în prima parte, prezent după „when" — deși în română ai zice tot viitor.' },
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'present-perfect',
    moduleId: 'tenses',
    level: 'B1',
    titleRo: 'Present Perfect vs Past Simple',
    goalRo: 'Alegi corect între „I did" și „I have done" — cea mai grea alegere pentru români.',
    shortRo: 'have/has + participiu, când momentul nu contează sau efectul se vede acum. Cu „yesterday / last week" se folosește past simple.',
    mnemonicRo: 'Dacă spui CÂND s-a întâmplat, folosești past simple. Fără moment precis → present perfect.',
    requires: ['past-simple', 'irregular-verbs'],
    category: 'present_perfect',
    bodyRo: `# Formula
**have / has + participiu (a treia formă)**
- I **have finished**. · She **has gone**. · We **haven't decided**. · **Have** you **seen** it?

# Diferența în două cuvinte
- **Past simple** = momentul contează și e **încheiat** → yesterday, last week, in 2020, ten minutes ago
- **Present perfect** = momentul **nu contează** sau efectul se vede **acum** → ever, never, already, yet, just, so far, this week, today

Româna are un singur „am făcut" pentru amândouă, de aici confuzia.

- I **lost** my keys yesterday. (moment precis)
- I **have lost** my keys. (și acum sunt fără ele — asta e problema)

# Regula practică
**Dacă în propoziție apare un moment trecut precis, NU poți folosi present perfect.**
- ~~I have seen him yesterday~~ → I **saw** him yesterday.

# for și since
- **for** + durată: for two years, for a long time
- **since** + moment de start: since 2019, since Monday, since I was a child
- I **have lived** here **for** five years. (și încă locuiesc)
  Româna spune „locuiesc aici de cinci ani" — la prezent! Engleza cere present perfect.

# been vs gone
- He **has gone** to London. (e plecat, încă e acolo)
- He **has been** to London. (a fost cândva, s-a întors)`,
    examples: [
      { en: 'I have lived here for five years.', ro: 'Locuiesc aici de cinci ani.', bad: 'I live here from five years.' },
      { en: 'I saw him yesterday.', ro: 'L-am văzut ieri.', bad: 'I have seen him yesterday.' },
      { en: 'Have you ever been to London?', ro: 'Ai fost vreodată la Londra?', bad: 'Did you ever be to London?' },
      { en: "I've just finished.", ro: 'Tocmai am terminat.', bad: 'I have just finish.' },
      { en: "She hasn't called me yet.", ro: 'Încă nu m-a sunat.', bad: "She doesn't called me yet." },
    ],
    exercises: [
      { kind: 'choice', text: 'I ___ my homework already.', options: ['did', 'have done'], answer: 'have done', explainRo: '„already" → present perfect.' },
      { kind: 'choice', text: 'She ___ to Italy in 2018.', options: ['went', 'has gone'], answer: 'went', explainRo: 'Moment precis (2018) → past simple.' },
      { kind: 'choice', text: 'We ___ each other since high school.', options: ['know', 'have known'], answer: 'have known', explainRo: '„since" + situație care continuă → present perfect.' },
      { kind: 'fill', text: 'I have worked here ___ three years.', answer: 'for', explainRo: '„for" + durată; „since" + moment de start.' },
      { kind: 'fill', text: "They haven't arrived ___ .", answer: 'yet', explainRo: '„yet" la final, în propoziții negative și întrebări.' },
      { kind: 'fix', text: 'I have seen this film last night.', answer: 'I saw this film last night.', explainRo: '„last night" e moment precis → past simple.' },
      { kind: 'fix', text: 'She has went home.', answer: 'She has gone home.', explainRo: 'După „has" merge participiul (gone), nu trecutul (went).' },
      { kind: 'fix', text: 'I am working here since 2020.', answer: 'I have worked here since 2020.', accept: ['I have been working here since 2020.'], explainRo: '„since" cere present perfect, nu prezent.' },
      { kind: 'translate', text: 'Nu am fost niciodată în Anglia.', answer: 'I have never been to England.', accept: ["I've never been to England."], explainRo: '„never" fără moment precis → present perfect + been.' },
      { kind: 'translate', text: 'Aștept de o oră.', answer: 'I have been waiting for an hour.', accept: ['I have waited for an hour.', "I've been waiting for an hour."], explainRo: 'Acțiune începută în trecut și continuată până acum.' },
      { kind: 'order', text: 'Lucrez la firma asta de trei ani.', answer: 'I have worked for this company for three years.', accept: ["I've worked for this company for three years."], explainRo: 'Situație începută în trecut care ține și acum → present perfect + for.' },
    ],
  },
];
