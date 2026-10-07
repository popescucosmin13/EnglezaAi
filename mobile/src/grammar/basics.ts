// Modulul 1 — Bazele propoziției: ordinea cuvintelor, to be, articole, plural,
// adjective, „a avea" și there is/there are.

import type { GrammarLesson } from './types';

export const BASICS_LESSONS: GrammarLesson[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'word-order',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'Ordinea cuvintelor (S-V-O)',
    goalRo: 'Construiești orice propoziție în ordinea fixă subiect → verb → complement.',
    shortRo: 'Cine + ce face + ce anume — în ordinea asta, mereu. Și niciodată fără subiect: „E frig" = It is cold.',
    mnemonicRo: 'S-V-O. Dacă muți cuvintele ca în română, schimbi sensul sau strici propoziția.',
    category: 'word_order',
    bodyRo: `# Regula de aur
În engleză ordinea cuvintelor e **fixă**: **Subiect + Verb + Obiect (complement)**.

În română poți muta cuvintele ca să schimbi accentul („Mere mănânc eu"), pentru că terminațiile arată cine ce face. În engleză cuvintele nu au terminații, deci **poziția e cea care spune cine face acțiunea**. Dacă schimbi ordinea, schimbi sensul sau propoziția devine greșită.

# Subiectul nu se omite niciodată
În română spui „Plouă." sau „Este frumos." fără subiect. În engleză **trebuie** un subiect, chiar dacă e gol de sens: **it**.
- *It* rains. / *It* is beautiful.

La fel, „Sunt obosit" are nevoie de „I": **I am tired.**

# Unde intră restul
- **Adverbele de mod și locul/timpul** vin după obiect: I read a book **at home every evening**.
- Ordinea uzuală la final: **cum → unde → când**.
  She sang *beautifully* *at the party* *last night*.
- **Nu** pui adverbul între verb și obiect: ~~I like very much this song~~ → **I like this song very much.**

# Adjectivul stă înaintea substantivului
- a **red** car (nu „a car red")`,
    examples: [
      { en: 'I eat apples.', ro: 'Eu mănânc mere.', bad: 'Apples eat I.', noteRo: 'Ordinea fixă S-V-O: cine face acțiunea stă primul.' },
      { en: 'It is cold today.', ro: 'E frig azi.', bad: 'Is cold today.', noteRo: 'Fără subiect propoziția nu există în engleză — folosește „it".' },
      { en: 'I like this song very much.', ro: 'Îmi place foarte mult melodia asta.', bad: 'I like very much this song.', noteRo: 'Nimic nu se bagă între verb și obiectul lui.' },
      { en: 'She speaks English well.', ro: 'Ea vorbește bine engleza.', bad: 'She speaks well English.' },
      { en: 'We watched a movie at home last night.', ro: 'Am văzut un film acasă aseară.', noteRo: 'Ordinea la final: cum → unde → când.' },
    ],
    exercises: [
      {
        kind: 'fix',
        text: 'Coffee drink I every morning.',
        answer: 'I drink coffee every morning.',
        explainRo: 'Subiect (I) + verb (drink) + obiect (coffee), apoi timpul.',
      },
      {
        kind: 'fix',
        text: 'Is raining outside.',
        answer: 'It is raining outside.',
        accept: ["It's raining outside."],
        explainRo: 'Engleza cere mereu un subiect; pentru vreme se folosește „it".',
      },
      {
        kind: 'fix',
        text: 'I like very much your idea.',
        answer: 'I like your idea very much.',
        explainRo: '„very much" nu se pune între verb și obiect — merge la final.',
      },
      {
        kind: 'choice',
        text: '___ a new phone yesterday.',
        options: ['Bought I', 'I bought', 'Yesterday bought I'],
        answer: 'I bought',
        explainRo: 'Subiectul stă înaintea verbului, indiferent ce altceva mai e în propoziție.',
      },
      {
        kind: 'choice',
        text: 'She ___ .',
        options: ['drives carefully always', 'always drives carefully', 'drives always carefully'],
        answer: 'always drives carefully',
        explainRo: 'Adverbele de frecvență (always, never, often) stau înaintea verbului principal.',
      },
      {
        kind: 'translate',
        text: 'Copiii se uită la televizor în fiecare seară.',
        answer: 'The children watch TV every evening.',
        accept: ['Children watch TV every evening.', 'The children watch television every evening.'],
        explainRo: 'Subiect + verb + obiect + timp. Timpul stă la final, nu la început ca uneori în română.',
      },
      {
        kind: 'translate',
        text: 'E târziu.',
        answer: 'It is late.',
        accept: ["It's late."],
        explainRo: 'Propozițiile impersonale din română primesc „it" ca subiect în engleză.',
      },
      {
        kind: 'order',
        text: 'Ea citește o carte în fiecare seară.',
        answer: 'She reads a book every evening.',
        explainRo: 'Subiect → verb → obiect, iar timpul se așază la final.',
      },
      {
        kind: 'order',
        text: 'Nu îmi place cafeaua rece.',
        answer: 'I do not like cold coffee.',
        accept: ["I don't like cold coffee."],
        explainRo: 'Negația stă între subiect și verb, iar adjectivul înaintea substantivului.',
      },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'to-be',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'Pronumele și verbul to be',
    goalRo: 'Folosești corect am/is/are la afirmativ, negativ și întrebare.',
    shortRo: 'I am · you/we/they are · he/she/it is. Negativ = „not" după verb. Întrebare = verbul trece înaintea subiectului.',
    mnemonicRo: 'Foamea, setea, frigul, vârsta și dreptatea se spun cu to be: I am hungry, I am 25.',
    requires: ['word-order'],
    category: 'present_simple',
    bodyRo: `# Pronumele personale
I, you, he, she, it, we, you, they.

- **he** = el (persoană masculină), **she** = ea (persoană feminină), **it** = pentru lucruri, animale, vreme, idei.
- **you** = și „tu", și „voi", și „dumneavoastră". Verbul e mereu **are**.
- Engleza nu are gen la obiecte: masa, scaunul, mașina — toate sunt **it**.
- „I" se scrie mereu cu literă mare, oriunde ar fi în propoziție.

# To be — cel mai important verb
- I **am** → I'm
- you / we / they **are** → you're, we're, they're
- he / she / it **is** → he's, she's, it's

# Negativ: „not" direct după verb
To be **nu are nevoie de auxiliar**: nu spui „I don't be tired".
- She is **not** happy. → She **isn't** happy.
- I am **not** ready. → I'm not ready.

# Întrebare: inversezi subiectul cu verbul
- **Is** she happy? · **Are** you Romanian? · **Am** I late?
- Cu cuvânt de întrebare: **Where are** you? · **Why is** he angry?

# Capcana românească
„Mi-e foame / frig / 25 de ani" se spune cu **to be**, nu cu „have":
- I **am** hungry. · I **am** cold. · I **am** 25 (years old).`,
    examples: [
      { en: "I'm tired.", ro: 'Sunt obosit.', bad: 'I have tired.' },
      { en: 'She is not at home.', ro: 'Ea nu e acasă.', bad: 'She not is at home.', noteRo: '„not" vine DUPĂ verbul to be, nu înainte.' },
      { en: 'Are you ready?', ro: 'Ești gata?', bad: 'You are ready?', noteRo: 'Întrebarea cere inversiune, nu doar intonație.' },
      { en: 'I am 30 years old.', ro: 'Am 30 de ani.', bad: 'I have 30 years.', noteRo: 'Vârsta se spune cu „to be", niciodată cu „have".' },
      { en: "It's cold in here.", ro: 'E frig aici.', bad: 'Is cold here.' },
    ],
    exercises: [
      { kind: 'fill', text: 'My parents ___ from Cluj.', answer: 'are', explainRo: '„parents" e plural → are.' },
      { kind: 'fill', text: 'She ___ a good teacher.', answer: 'is', accept: ["'s"], explainRo: 'he / she / it → is.' },
      { kind: 'fill', text: 'I ___ not sure about that.', answer: 'am', accept: ["'m"], explainRo: 'I → am. Negația se face adăugând „not" după el.' },
      {
        kind: 'choice',
        text: '___ they at work today?',
        options: ['Do', 'Are', 'Is'],
        answer: 'Are',
        explainRo: 'To be nu folosește „do" la întrebare — se inversează chiar el cu subiectul.',
      },
      { kind: 'fix', text: 'I have 25 years.', answer: 'I am 25 years old.', accept: ["I'm 25 years old.", 'I am 25.', "I'm 25."], explainRo: 'Vârsta: to be + număr (+ years old).' },
      { kind: 'fix', text: 'He not is my brother.', answer: 'He is not my brother.', accept: ["He isn't my brother."], explainRo: 'Ordinea corectă: subiect + is + not.' },
      { kind: 'fix', text: 'You are ready?', answer: 'Are you ready?', explainRo: 'La întrebare, verbul to be trece înaintea subiectului.' },
      { kind: 'translate', text: 'Mi-e foame.', answer: 'I am hungry.', accept: ["I'm hungry."], explainRo: 'Stările (foame, sete, frig, teamă) se exprimă cu to be + adjectiv.' },
      { kind: 'translate', text: 'Ei nu sunt acasă.', answer: 'They are not at home.', accept: ["They aren't at home.", "They're not at home.", 'They are not home.'], explainRo: 'they → are; negația = are + not.' },
      { kind: 'order', text: 'Sora mea nu e acasă azi.', answer: 'My sister is not at home today.', accept: ["My sister isn't at home today."], explainRo: 'to be + not, fără „do"; „at home" merge fără articol.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'articles',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'Articolele: a / an / the',
    goalRo: 'Alegi între a, an, the și niciun articol fără să mai ghicești.',
    shortRo: 'a/an = unul oarecare (an înaintea unui sunet de vocală) · the = ăla știut de amândoi · nimic = vorbesc în general.',
    mnemonicRo: 'Dacă în română ai zice „viața", „banii", „câinii" la modul general, în engleză mergi FĂRĂ „the".',
    category: 'article',
    bodyRo: `# a / an — un lucru oarecare
Se folosesc doar la **singular numărabil**, când vorbești despre ceva nespecificat sau menționat prima dată.
- **a** înaintea unui **sunet** de consoană: a dog, a car, **a** university (se aude „iu"), **a** European
- **an** înaintea unui **sunet** de vocală: an apple, **an** hour (h e mut), **an** MP3 (se aude „em")

Regula ține de **cum se aude**, nu de cum se scrie.

# the — lucrul acela, cunoscut de amândoi
- Când s-a mai vorbit despre el: I bought a car. **The** car is red.
- Când e unic: **the** sun, **the** internet, **the** first time
- Cu superlative: **the** best, **the** biggest

# Fără articol (capcana nr. 1 pentru români)
Româna pune articolul lipit de cuvânt („viața e frumoasă"), deci ai reflexul să pui „the" peste tot. **Nu** pui articol când vorbești **general**:
- ~~The life is beautiful~~ → **Life is beautiful.**
- ~~I like the dogs~~ → **I like dogs.** (câinii în general)
- ~~The money doesn't bring happiness~~ → **Money doesn't bring happiness.**

Tot fără articol: numele de persoane, majoritatea țărilor și orașelor (Romania, London), limbile (I speak English), mesele (before breakfast), *at home / at work / at school*.

# Test rapid
1. E numărabil la singular și nespecific? → **a / an**
2. Știe și celălalt exact la ce mă refer? → **the**
3. Vorbesc despre categorie în general? → **niciun articol**`,
    examples: [
      { en: 'Life is beautiful.', ro: 'Viața e frumoasă.', bad: 'The life is beautiful.', noteRo: 'Generalizare → fără „the".' },
      { en: 'I need an hour.', ro: 'Am nevoie de o oră.', bad: 'I need a hour.', noteRo: '„hour" începe cu sunet de vocală (h mut).' },
      { en: 'She is a university student.', ro: 'Ea e studentă.', bad: 'She is an university student.', noteRo: '„university" începe cu sunetul „iu" → a.' },
      { en: 'I go to work by car.', ro: 'Merg la muncă cu mașina.', bad: 'I go to the work with the car.' },
      { en: 'The sun is bright today.', ro: 'Soarele e puternic azi.', noteRo: 'Lucruri unice → the.' },
    ],
    exercises: [
      { kind: 'fill', text: 'I saw ___ elephant at the zoo.', answer: 'an', explainRo: '„elephant" începe cu sunet de vocală.' },
      { kind: 'fill', text: 'He works in ___ hospital near my house.', answer: 'a', explainRo: '„hospital" începe cu sunet de consoană (h se aude).' },
      { kind: 'choice', text: '___ dogs are loyal animals.', options: ['The', '(niciun articol)'], answer: '(niciun articol)', explainRo: 'Vorbim despre câini în general → fără articol.' },
      { kind: 'choice', text: 'Can you close ___ door, please?', options: ['a', 'the', '(niciun articol)'], answer: 'the', explainRo: 'Amândoi știm despre ce ușă e vorba → the.' },
      { kind: 'fill', text: 'It takes ___ hour and a half.', answer: 'an', explainRo: 'Sunetul contează: „our" → an.' },
      { kind: 'fix', text: 'The money is not everything.', answer: 'Money is not everything.', accept: ["Money isn't everything."], explainRo: 'Substantiv abstract, sens general → fără articol.' },
      { kind: 'fix', text: 'I am the doctor.', answer: 'I am a doctor.', accept: ["I'm a doctor."], explainRo: 'Meseriile primesc a/an: ești unul dintre mulți doctori.' },
      { kind: 'fix', text: 'She speaks the English very well.', answer: 'She speaks English very well.', explainRo: 'Limbile nu iau articol.' },
      { kind: 'translate', text: 'Vreau o cafea, te rog.', answer: 'I want a coffee, please.', accept: ["I'd like a coffee, please.", 'I would like a coffee, please.'], explainRo: 'Un exemplar nespecificat → a.' },
      { kind: 'translate', text: 'Muzica mă ajută să mă relaxez.', answer: 'Music helps me relax.', accept: ['Music helps me to relax.'], explainRo: 'Muzica în general → fără „the".' },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'plural',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'Pluralul substantivelor',
    goalRo: 'Formezi pluralul corect, inclusiv la neregulate și la cuvintele fără plural.',
    shortRo: 'De obicei +s · +es după s, ss, sh, ch, x, o · consoană+y → -ies. Neregulate: men, women, children, people, feet.',
    mnemonicRo: 'information, advice, money, news, furniture, homework nu au plural NICIODATĂ.',
    category: 'plural',
    bodyRo: `# Regula generală: **-s**
cat → cats, book → books, idea → ideas

# **-es** după s, ss, sh, ch, x, o
bus → bus**es**, glass → glass**es**, dish → dish**es**, watch → watch**es**, box → box**es**, potato → potato**es**
(Excepții uzuale: photo**s**, video**s**, piano**s**.)

# Consoană + y → **-ies**
city → cit**ies**, baby → bab**ies**, country → countr**ies**
Dar vocală + y păstrează y: bo**y**s, da**y**s, ke**y**s.

# -f / -fe → **-ves**
knife → kni**ves**, life → li**ves**, leaf → lea**ves**, wife → wi**ves**

# Neregulate — se învață pe de rost
man → **men**, woman → **women**, child → **children**, person → **people**, foot → **feet**, tooth → **teeth**, mouse → **mice**, goose → **geese**
Fără schimbare: sheep, fish, deer, series, aircraft.

# Cuvinte care NU au plural în engleză (deși au în română)
Sunt „necontabile" și se folosesc cu verb la singular:
- ~~informations~~ → **information**
- ~~advices~~ → **advice** (a piece of advice)
- ~~knowledges~~ → **knowledge**
- ~~furnitures~~ → **furniture**
- ~~homeworks~~ → **homework**
- ~~moneys~~ → **money** (Money **is** important.)
- ~~news are~~ → **The news is** good.

# Invers: cuvinte care sunt mereu plural
people, police, clothes, glasses (ochelari), trousers, scissors
- The police **are** here. · **People are** waiting.`,
    examples: [
      { en: 'I have two children.', ro: 'Am doi copii.', bad: 'I have two childs.' },
      { en: 'I need some information.', ro: 'Am nevoie de niște informații.', bad: 'I need some informations.', noteRo: '„information" nu are plural.' },
      { en: 'She gave me good advice.', ro: 'Mi-a dat sfaturi bune.', bad: 'She gave me good advices.' },
      { en: 'People are waiting outside.', ro: 'Oamenii așteaptă afară.', bad: 'People is waiting outside.', noteRo: '„people" e deja plural → verb la plural.' },
      { en: 'There are three boxes on the table.', ro: 'Sunt trei cutii pe masă.', bad: 'There are three boxs on the table.' },
    ],
    exercises: [
      { kind: 'fill', text: 'Pluralul de la „city" este ___ .', answer: 'cities', explainRo: 'Consoană + y → -ies.' },
      { kind: 'fill', text: 'Pluralul de la „watch" este ___ .', answer: 'watches', explainRo: 'După -ch se adaugă -es.' },
      { kind: 'fill', text: 'Pluralul de la „knife" este ___ .', answer: 'knives', explainRo: '-fe devine -ves.' },
      { kind: 'fill', text: 'Pluralul de la „woman" este ___ .', answer: 'women', explainRo: 'Neregulat: man/men, woman/women.' },
      { kind: 'choice', text: 'The news ___ very good today.', options: ['is', 'are'], answer: 'is', explainRo: '„news" se termină în -s, dar e singular.' },
      { kind: 'choice', text: 'These ___ are new.', options: ['furnitures', 'pieces of furniture'], answer: 'pieces of furniture', explainRo: '„furniture" nu are plural; se numără cu „pieces of".' },
      { kind: 'fix', text: 'He gave me two advices.', answer: 'He gave me two pieces of advice.', accept: ['He gave me some advice.'], explainRo: '„advice" e necontabil: a piece of advice / two pieces of advice.' },
      { kind: 'fix', text: 'My childs are at school.', answer: 'My children are at school.', explainRo: 'child → children (plural neregulat).' },
      { kind: 'translate', text: 'Am nevoie de mai multe informații.', answer: 'I need more information.', accept: ['I need more information, please.'], explainRo: '„information" rămâne la singular oricâtă ar fi.' },
      { kind: 'translate', text: 'Sunt cinci persoane în cameră.', answer: 'There are five people in the room.', explainRo: 'person → people; „there are" pentru plural.' },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'adjectives',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'Adjectivele (nu se acordă!)',
    goalRo: 'Pui adjectivul unde trebuie, în forma invariabilă, și în ordinea corectă.',
    shortRo: 'Adjectivul nu se acordă niciodată și stă înaintea substantivului: two beautiful girls.',
    mnemonicRo: '-ed = ce simt eu (I\'m bored) · -ing = cum e lucrul (it\'s boring).',
    requires: ['word-order'],
    category: 'word_order',
    bodyRo: `# Adjectivul nu se schimbă niciodată
În română adjectivul se acordă (fată frumoas**ă**, băieți frumoș**i**). În engleză e **invariabil**:
- a beautiful girl → two **beautiful** girls
- a beautiful boy → many **beautiful** boys

Nu există „beautifuls", „beautifula". Niciodată.

# Poziția: înaintea substantivului
- a **red** car · an **interesting** book · **cold** water

Sau după verbele de stare (to be, seem, look, feel, sound, taste):
- The car is **red**. · You look **tired**. · It sounds **strange**.

# Ordinea mai multor adjective
opinie → mărime → vârstă → formă → culoare → origine → material
- a **beautiful little old** house
- a **big black Italian** car

Nu trebuie memorată ca tabel: cu cât adjectivul spune ceva mai obiectiv, cu atât stă mai aproape de substantiv.

# -ed vs -ing (capcană frecventă)
- **-ed** = ce simt eu: I am **bored** (mă plictisesc), I am **interested**.
- **-ing** = cum e lucrul: The film is **boring** (filmul e plictisitor), The book is **interesting**.

„I am boring" înseamnă „eu sunt un om plictisitor" — probabil nu asta vrei să spui.

# Adjectiv vs adverb
Adjectivul descrie un lucru, adverbul descrie o acțiune (de obicei + **-ly**):
- She is a **good** singer. → She sings **well**. (nu „sings good")
- a **quick** answer → answer **quickly**`,
    examples: [
      { en: 'Two beautiful girls.', ro: 'Două fete frumoase.', bad: 'Two beautifuls girls.', noteRo: 'Doar substantivul primește plural.' },
      { en: 'I am bored.', ro: 'Mă plictisesc.', bad: 'I am boring.', noteRo: '„I am boring" = sunt un om plictisitor.' },
      { en: 'He drives well.', ro: 'El conduce bine.', bad: 'He drives good.' },
      { en: 'a big black car', ro: 'o mașină neagră mare', bad: 'a car big black', noteRo: 'Adjectivele stau înaintea substantivului: mărime înainte de culoare.' },
      { en: 'The soup tastes delicious.', ro: 'Supa e delicioasă.', noteRo: 'După verbele de percepție se pune adjectiv, nu adverb.' },
    ],
    exercises: [
      { kind: 'fix', text: 'I have two olds cars.', answer: 'I have two old cars.', explainRo: 'Adjectivul nu primește niciodată -s.' },
      { kind: 'fix', text: 'She is a girl beautiful.', answer: 'She is a beautiful girl.', explainRo: 'Adjectivul stă înaintea substantivului.' },
      { kind: 'choice', text: 'This lesson is very ___ .', options: ['interested', 'interesting'], answer: 'interesting', explainRo: 'Lucrul care provoacă senzația primește -ing.' },
      { kind: 'choice', text: 'I am ___ in your offer.', options: ['interested', 'interesting'], answer: 'interested', explainRo: 'Persoana care simte primește -ed.' },
      { kind: 'choice', text: 'He speaks English ___ .', options: ['good', 'well'], answer: 'well', explainRo: 'Verbul cere adverb: „well" e adverbul de la „good".' },
      { kind: 'choice', text: 'a ___ table', options: ['wooden small round', 'small round wooden'], answer: 'small round wooden', explainRo: 'Ordinea: mărime → formă → material.' },
      { kind: 'translate', text: 'Sunt niște case vechi și frumoase.', answer: 'They are beautiful old houses.', accept: ['These are beautiful old houses.', 'There are some beautiful old houses.'], explainRo: 'Adjectivele rămân la singular; ordinea: opinie → vârstă.' },
      { kind: 'translate', text: 'Filmul a fost plictisitor.', answer: 'The film was boring.', accept: ['The movie was boring.'], explainRo: 'Lucrul plictisitor → -ing.' },
      { kind: 'order', text: 'Am cumpărat o mașină roșie mică.', answer: 'I bought a small red car.', explainRo: 'Ordinea adjectivelor: mărime înaintea culorii, ambele înaintea substantivului.' },
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'have-got',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'A avea: have / have got',
    goalRo: 'Exprimi posesia corect și eviți calcurile din română cu „a avea".',
    shortRo: 'have / has (he, she, it) pentru posesie · negativ și întrebare cu do/does · have to = trebuie.',
    mnemonicRo: 'Dacă în română zici „am" despre o stare (foame, frig, ani, dreptate), în engleză e „I am".',
    requires: ['to-be'],
    category: 'auxiliary',
    bodyRo: `# have / has
- I / you / we / they **have**
- he / she / it **has**

Negativ și interogativ folosesc **do / does**:
- I **don't have** a car. · **Does** she **have** a car?

# have got (mai ales în engleza britanică vorbită)
- I **have got** = I've got · She **has got** = She's got
- Negativ: I **haven't got** · Întrebare: **Have** you **got** a minute?

Ambele sunt corecte pentru posesie. „Have got" **nu** se folosește la trecut: la trecut e mereu **had**.

# Capcanele românești cu „a avea"
Româna folosește „a avea" în multe expresii unde engleza folosește **to be**:
- ~~I have 25 years~~ → **I am 25.**
- ~~I have hunger / thirst~~ → **I am hungry / thirsty.**
- ~~I have cold~~ → **I am cold.**
- ~~I have reason~~ → **I am right.**
- ~~I have need of~~ → **I need** / I have need**ed**… → simplu: **I need**.

Și invers, „have" apare unde româna nu-l folosește:
- **have** breakfast / lunch / dinner (a lua micul dejun)
- **have** a shower, **have** a good time, **have** a look

# have to = trebuie
- I **have to** go. (trebuie să plec)
- She **has to** work tomorrow.
- Negativ: I **don't have to** work = nu sunt obligat (nu „nu am voie"!).`,
    examples: [
      { en: 'I have two brothers.', ro: 'Am doi frați.', noteRo: '„I have got two brothers" e la fel de corect.' },
      { en: 'I am thirsty.', ro: 'Mi-e sete.', bad: 'I have thirst.' },
      { en: 'You are right.', ro: 'Ai dreptate.', bad: 'You have right.' },
      { en: 'Do you have a pen?', ro: 'Ai un pix?', bad: 'Have you a pen?', noteRo: 'În engleza modernă întrebarea cu „have" simplu cere „do".' },
      { en: 'I have to leave now.', ro: 'Trebuie să plec acum.', bad: 'I must to leave now.' },
    ],
    exercises: [
      { kind: 'fill', text: 'She ___ a new job.', answer: 'has', explainRo: 'he / she / it → has.' },
      { kind: 'choice', text: '___ you have any questions?', options: ['Do', 'Are', 'Have'], answer: 'Do', explainRo: '„have" ca verb principal formează întrebarea cu do/does.' },
      { kind: 'fix', text: 'I have 30 years old.', answer: 'I am 30 years old.', accept: ["I'm 30 years old.", 'I am 30.'], explainRo: 'Vârsta se spune cu to be.' },
      { kind: 'fix', text: 'He have not a car.', answer: "He doesn't have a car.", accept: ['He does not have a car.', "He hasn't got a car."], explainRo: 'Negativul cere does + not + have (sau „hasn\'t got").' },
      { kind: 'fix', text: 'You have right.', answer: 'You are right.', accept: ["You're right."], explainRo: '„a avea dreptate" = to be right.' },
      { kind: 'translate', text: 'Trebuie să mă trezesc devreme mâine.', answer: 'I have to get up early tomorrow.', accept: ['I have to wake up early tomorrow.'], explainRo: '„trebuie" ca obligație practică → have to.' },
      { kind: 'translate', text: 'Nu am timp acum.', answer: "I don't have time now.", accept: ['I do not have time now.', "I haven't got time now."], explainRo: 'Negativ cu don\'t + have.' },
    ],
  },

  // ---------------------------------------------------------------- 7
  {
    id: 'there-is',
    moduleId: 'basics',
    level: 'A1',
    titleRo: 'There is / there are',
    goalRo: 'Spui că ceva „există / se află undeva" fără să traduci cuvânt cu cuvânt.',
    shortRo: '„Este / sunt / există undeva" = there is (singular) / there are (plural). Vremea și starea generală = it is.',
    mnemonicRo: 'Nu începe niciodată cu „Are…" pentru „Sunt…". E „There are…".',
    requires: ['to-be'],
    category: 'word_order',
    bodyRo: `# Structura
„Este / sunt / se află / există" din română devine **there is** (singular) sau **there are** (plural).

- **There is** a book on the table. (E o carte pe masă.)
- **There are** two books on the table.
- Negativ: There **isn't** any milk. · There **aren't** any chairs.
- Întrebare: **Is there** a bank near here? · **Are there** any tickets left?

# Ce alegi după „there"?
Verbul se acordă cu **primul** substantiv care urmează:
- There **is** a chair and two tables.
- There **are** two tables and a chair.

# Nu confunda cu „it is"
- **It is** cold. = e frig (starea vremii)
- **There is** a problem. = există o problemă

# La trecut și viitor
- There **was** / There **were** (era / erau)
- There **will be** (va fi)
- There **has been** / There **have been** (a fost / au fost)

# Capcana
Româna spune „Sunt trei oameni aici" — dacă traduci direct „Are three people here", e greșit. Trebuie **There are three people here.**`,
    examples: [
      { en: 'There is a problem with my order.', ro: 'E o problemă cu comanda mea.', bad: 'It is a problem with my order.' },
      { en: 'There are many people here.', ro: 'Sunt mulți oameni aici.', bad: 'Are many people here.' },
      { en: "There isn't any coffee left.", ro: 'Nu a mai rămas cafea.', bad: "There isn't no coffee left." },
      { en: 'Is there a pharmacy nearby?', ro: 'E o farmacie prin apropiere?', bad: 'There is a pharmacy nearby?' },
      { en: 'There were ten of us.', ro: 'Eram zece.', bad: 'We were ten persons.' },
    ],
    exercises: [
      { kind: 'fill', text: '___ a supermarket at the corner.', answer: 'There is', accept: ["There's"], explainRo: 'Un singur lucru → there is.' },
      { kind: 'fill', text: '___ three chairs in the kitchen.', answer: 'There are', explainRo: 'Plural → there are.' },
      { kind: 'choice', text: '___ any milk in the fridge?', options: ['Is there', 'There is', 'It is'], answer: 'Is there', explainRo: 'Întrebarea inversează: Is there…?' },
      { kind: 'choice', text: '___ cold outside.', options: ['There is', 'It is'], answer: 'It is', explainRo: 'Vremea se descrie cu „it is", nu cu „there is".' },
      { kind: 'fix', text: 'Are many cars on the street.', answer: 'There are many cars on the street.', explainRo: 'Lipsește „there" — engleza cere subiect.' },
      { kind: 'fix', text: 'There is two problems.', answer: 'There are two problems.', explainRo: 'Acordul se face cu substantivul care urmează.' },
      { kind: 'translate', text: 'Nu e nimeni acasă.', answer: 'There is nobody at home.', accept: ["There's nobody at home.", "There isn't anybody at home.", 'There is no one at home.'], explainRo: 'Fie „nobody" cu verb afirmativ, fie „isn\'t anybody" — nu amândouă negațiile.' },
      { kind: 'translate', text: 'Erau mulți oameni la concert.', answer: 'There were many people at the concert.', accept: ['There were a lot of people at the concert.'], explainRo: 'Trecut + plural → there were.' },
      { kind: 'order', text: 'E o cafenea lângă biroul meu.', answer: 'There is a coffee shop near my office.', accept: ["There's a coffee shop near my office."], explainRo: 'Un singur lucru → there is; „near" arată apropierea.' },
    ],
  },
];
