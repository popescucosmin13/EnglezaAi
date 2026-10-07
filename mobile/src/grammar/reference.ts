// Tabelele de referință: partea în care cauți repede un răspuns, fără să citești o lecție.
//
// Tot ce e aici apare și în lecții, dar în formă de tabel: se scanează din ochi, se caută cu
// filtrul de sus și e gândit pentru momentul „am nevoie ACUM de forma corectă".

export interface RefTable {
  id: string;
  titleRo: string;
  noteRo?: string;
  columns: string[];
  rows: string[][];
}

export interface RefSection {
  id: string;
  titleRo: string;
  descRo: string;
  tables: RefTable[];
}

export const REFERENCE: RefSection[] = [
  {
    id: 'tenses',
    titleRo: 'Timpurile verbale',
    descRo: 'Toate timpurile pe o pagină: formula, când se folosește, exemplu.',
    tables: [
      {
        id: 'tense-overview',
        titleRo: 'Tabel sinoptic',
        columns: ['Timp', 'Formula', 'Când', 'Exemplu'],
        rows: [
          ['Present Simple', 'verb (+ -s la III)', 'rutine, adevăruri', 'She works here.'],
          ['Present Continuous', 'am/is/are + -ing', 'chiar acum, temporar', "She is working now."],
          ['Past Simple', 'verb + -ed / formă II', 'moment încheiat', 'She worked yesterday.'],
          ['Past Continuous', 'was/were + -ing', 'fundal în trecut', 'She was working at 8.'],
          ['Present Perfect', 'have/has + forma III', 'fără moment precis, efect acum', 'She has worked here for years.'],
          ['Present Perfect Cont.', 'have/has been + -ing', 'a început în trecut, ține acum', 'She has been working since 9.'],
          ['Past Perfect', 'had + forma III', 'înainte de alt moment trecut', 'She had worked there before.'],
          ['Future (will)', 'will + verb', 'decizie de moment, predicție', 'She will work tomorrow.'],
          ['Future (going to)', 'am/is/are going to + verb', 'plan deja făcut', 'She is going to work tomorrow.'],
          ['Future Perfect', 'will have + forma III', 'gata până la un moment viitor', 'She will have worked 10 years.'],
          ['Conditional', 'would + verb', 'ipotetic', 'She would work more.'],
          ['Conditional Perfect', 'would have + forma III', 'regret despre trecut', 'She would have worked more.'],
        ],
      },
      {
        id: 'time-markers',
        titleRo: 'Cuvintele care îți spun ce timp să folosești',
        columns: ['Cuvânt', 'Timp'],
        rows: [
          ['always, usually, every day, never', 'Present Simple'],
          ['now, right now, at the moment, today', 'Present Continuous'],
          ['yesterday, last week, in 2019, ago', 'Past Simple'],
          ['while, when (fundal)', 'Past Continuous'],
          ['ever, never, just, already, yet, so far', 'Present Perfect'],
          ['for, since', 'Present Perfect (+ Continuous)'],
          ['tomorrow, next week, soon', 'Future'],
        ],
      },
    ],
  },

  {
    id: 'pronouns',
    titleRo: 'Pronume și posesiv',
    descRo: 'Toate formele, pe un singur rând per persoană.',
    tables: [
      {
        id: 'pronoun-table',
        titleRo: 'Tabelul complet',
        noteRo: 'Adjectivul posesiv stă înaintea substantivului (my car), pronumele posesiv stă singur (it\'s mine).',
        columns: ['Subiect', 'Complement', 'Adjectiv pos.', 'Pronume pos.', 'Reflexiv'],
        rows: [
          ['I', 'me', 'my', 'mine', 'myself'],
          ['you', 'you', 'your', 'yours', 'yourself'],
          ['he', 'him', 'his', 'his', 'himself'],
          ['she', 'her', 'her', 'hers', 'herself'],
          ['it', 'it', 'its', '—', 'itself'],
          ['we', 'us', 'our', 'ours', 'ourselves'],
          ['you (voi)', 'you', 'your', 'yours', 'yourselves'],
          ['they', 'them', 'their', 'theirs', 'themselves'],
        ],
      },
      {
        id: 'this-that',
        titleRo: 'this / that / these / those',
        columns: ['Formă', 'Sens', 'Exemplu'],
        rows: [
          ['this', 'acesta (aproape, singular)', 'This is my seat.'],
          ['that', 'acela (departe, singular)', 'That is your seat.'],
          ['these', 'aceștia (aproape, plural)', 'These are my keys.'],
          ['those', 'aceia (departe, plural)', 'Those are your keys.'],
        ],
      },
      {
        id: 'some-any-no',
        titleRo: 'some / any / no + body, thing, where',
        columns: ['', 'Persoane', 'Lucruri', 'Locuri'],
        rows: [
          ['afirmativ', 'somebody / someone', 'something', 'somewhere'],
          ['negativ / întrebare', 'anybody / anyone', 'anything', 'anywhere'],
          ['negație singură', 'nobody / no one', 'nothing', 'nowhere'],
          ['toate', 'everybody / everyone', 'everything', 'everywhere'],
        ],
      },
    ],
  },

  {
    id: 'be-have-do',
    titleRo: 'To be, to have, to do',
    descRo: 'Cele trei verbe pe care se sprijină toată gramatica engleză.',
    tables: [
      {
        id: 'to-be',
        titleRo: 'to be (a fi)',
        columns: ['Persoană', 'Prezent', 'Trecut', 'Scurt'],
        rows: [
          ['I', 'am', 'was', "I'm / I'm not"],
          ['you', 'are', 'were', "you're / you aren't"],
          ['he / she / it', 'is', 'was', "he's / he isn't"],
          ['we', 'are', 'were', "we're / we aren't"],
          ['they', 'are', 'were', "they're / they aren't"],
        ],
      },
      {
        id: 'to-have',
        titleRo: 'to have (a avea)',
        noteRo: 'Ca verb principal, negativul și întrebarea se fac cu do/does: I don\'t have… / Do you have…?',
        columns: ['Persoană', 'Prezent', 'Trecut', 'Participiu'],
        rows: [
          ['I / you / we / they', 'have', 'had', 'had'],
          ['he / she / it', 'has', 'had', 'had'],
        ],
      },
      {
        id: 'to-do',
        titleRo: 'to do (auxiliar)',
        noteRo: 'Auxiliarul preia „efortul": după do/does/did, verbul principal rămâne la forma de bază.',
        columns: ['Timp', 'Afirmativ', 'Negativ', 'Întrebare'],
        rows: [
          ['prezent (I/you/we/they)', 'I work', "I don't work", 'Do I work?'],
          ['prezent (he/she/it)', 'He works', "He doesn't work", 'Does he work?'],
          ['trecut (toate)', 'I worked', "I didn't work", 'Did I work?'],
        ],
      },
    ],
  },

  {
    id: 'articles-nouns',
    titleRo: 'Articole și substantive',
    descRo: 'a / an / the / nimic, pluralul și substantivele fără plural.',
    tables: [
      {
        id: 'article-decision',
        titleRo: 'Ce articol pun?',
        columns: ['Situație', 'Articol', 'Exemplu'],
        rows: [
          ['singular numărabil, nespecific, sunet de consoană', 'a', 'a car, a university'],
          ['singular numărabil, nespecific, sunet de vocală', 'an', 'an apple, an hour'],
          ['ceva deja menționat sau știut de amândoi', 'the', 'the car I bought'],
          ['lucruri unice, superlative', 'the', 'the sun, the best'],
          ['plural sau abstract, în sens general', '(nimic)', 'Dogs are loyal. Life is short.'],
          ['nume, limbi, țări, mese, at home/work/school', '(nimic)', 'I speak English at work.'],
        ],
      },
      {
        id: 'plural-rules',
        titleRo: 'Pluralul',
        columns: ['Terminație', 'Regulă', 'Exemplu'],
        rows: [
          ['normal', '+ s', 'book → books'],
          ['s, ss, sh, ch, x, o', '+ es', 'box → boxes, go → goes'],
          ['consoană + y', 'y → ies', 'city → cities'],
          ['vocală + y', '+ s', 'day → days'],
          ['f / fe', '→ ves', 'knife → knives'],
        ],
      },
      {
        id: 'irregular-plurals',
        titleRo: 'Plurale neregulate',
        columns: ['Singular', 'Plural'],
        rows: [
          ['man', 'men'],
          ['woman', 'women'],
          ['child', 'children'],
          ['person', 'people'],
          ['foot', 'feet'],
          ['tooth', 'teeth'],
          ['mouse', 'mice'],
          ['goose', 'geese'],
          ['sheep / fish / deer', 'neschimbat'],
        ],
      },
      {
        id: 'uncountable',
        titleRo: 'Cuvinte fără plural (nenumărabile)',
        noteRo: 'Cer verb la singular și se numără cu „a piece of / a glass of": Money is important.',
        columns: ['Greșit', 'Corect'],
        rows: [
          ['informations', 'information'],
          ['advices', 'advice / pieces of advice'],
          ['knowledges', 'knowledge'],
          ['furnitures', 'furniture'],
          ['homeworks', 'homework'],
          ['moneys', 'money'],
          ['the news are', 'the news is'],
          ['people is', 'people are'],
        ],
      },
    ],
  },

  {
    id: 'prepositions',
    titleRo: 'Prepoziții',
    descRo: 'Timp, loc și combinațiile fixe pe care nu le poți deduce.',
    tables: [
      {
        id: 'prep-time',
        titleRo: 'De timp',
        columns: ['Prepoziție', 'Se folosește pentru', 'Exemple'],
        rows: [
          ['at', 'ore exacte, momente', 'at 5, at noon, at night, at the weekend'],
          ['on', 'zile și date', 'on Monday, on July 5th, on my birthday'],
          ['in', 'luni, ani, anotimpuri, părți ale zilei', 'in May, in 2024, in summer, in the morning'],
          ['(nimic)', 'today, tomorrow, yesterday, next/last…', 'See you next week.'],
          ['for / since', 'durată / moment de start', 'for two hours, since Monday'],
          ['by / until', 'cel târziu până la / tot timpul până la', 'by Friday, until 6 p.m.'],
          ['ago / in', 'acum X timp / peste X timp', 'two years ago, in ten minutes'],
        ],
      },
      {
        id: 'prep-place',
        titleRo: 'De loc',
        columns: ['Prepoziție', 'Se folosește pentru', 'Exemple'],
        rows: [
          ['in', 'spații închise, zone', 'in the room, in Romania, in the picture'],
          ['on', 'suprafețe, linii, transport mare', 'on the table, on the bus, on the left'],
          ['at', 'puncte, adrese, activități', 'at the door, at work, at home, at school'],
          ['to', 'mișcare către', 'go to work (dar: go home)'],
          ['into / out of', 'intrare / ieșire', 'He walked into the room.'],
        ],
      },
      {
        id: 'prep-fixed',
        titleRo: 'Combinații fixe (se învață ca atare)',
        columns: ['Corect', 'Greșeala frecventă'],
        rows: [
          ['depend on', 'depend of'],
          ['arrive at / in', 'arrive to'],
          ['listen to', 'listen (fără to)'],
          ['wait for', 'wait after'],
          ['look for / after / forward to', 'look (fără particulă)'],
          ['interested in', 'interested of'],
          ['good at / bad at', 'good in'],
          ['married to', 'married with'],
          ['afraid of', 'afraid from'],
          ['on the picture → in the picture', 'on the picture'],
        ],
      },
    ],
  },

  {
    id: 'quantity',
    titleRo: 'Cantități și comparații',
    descRo: 'much/many, comparativ, superlativ.',
    tables: [
      {
        id: 'quantifiers',
        titleRo: 'Cuvinte de cantitate',
        columns: ['Numărabile', 'Nenumărabile', 'Amândouă'],
        rows: [
          ['many books', 'much time', 'a lot of / lots of'],
          ['a few friends', 'a little sugar', 'some / any'],
          ['few (prea puțini)', 'little (prea puțin)', 'plenty of'],
          ['too many emails', 'too much noise', 'enough'],
          ['How many?', 'How much?', '—'],
        ],
      },
      {
        id: 'comparatives',
        titleRo: 'Comparativ și superlativ',
        columns: ['Tip', 'Comparativ', 'Superlativ'],
        rows: [
          ['adjectiv scurt (tall)', 'taller than', 'the tallest'],
          ['scurt în -y (easy)', 'easier than', 'the easiest'],
          ['scurt CVC (big)', 'bigger than', 'the biggest'],
          ['adjectiv lung (expensive)', 'more expensive than', 'the most expensive'],
          ['good', 'better', 'the best'],
          ['bad', 'worse', 'the worst'],
          ['far', 'further / farther', 'the furthest'],
          ['much / many', 'more', 'the most'],
          ['little', 'less', 'the least'],
          ['egalitate', 'as tall as', '—'],
        ],
      },
    ],
  },

  {
    id: 'questions-modals',
    titleRo: 'Întrebări și modale',
    descRo: 'Cum construiești o întrebare și ce spune fiecare modal.',
    tables: [
      {
        id: 'question-words',
        titleRo: 'Cuvinte de întrebare',
        columns: ['Cuvânt', 'Sens', 'Exemplu'],
        rows: [
          ['what', 'ce', 'What do you want?'],
          ['who', 'cine', 'Who called you?'],
          ['where', 'unde', 'Where do you live?'],
          ['when', 'când', 'When did it happen?'],
          ['why', 'de ce', 'Why are you late?'],
          ['how', 'cum', 'How does it work?'],
          ['which', 'care (dintre)', 'Which one do you prefer?'],
          ['whose', 'al cui', 'Whose car is this?'],
          ['how much / how many', 'cât / câți', 'How many people came?'],
          ['how long / how often', 'cât timp / cât de des', 'How long have you been here?'],
        ],
      },
      {
        id: 'question-aux',
        titleRo: 'Ce auxiliar folosesc',
        noteRo: 'Ordinea e mereu: (cuvânt de întrebare) + auxiliar + subiect + verb.',
        columns: ['Timp / verb', 'Întrebare'],
        rows: [
          ['to be', 'Are you ready?'],
          ['present simple', 'Do you work? / Does he work?'],
          ['past simple', 'Did you work?'],
          ['present perfect', 'Have you worked?'],
          ['modale', 'Can you help? / Should I go?'],
          ['întrebare despre subiect', 'Who called you? (fără do)'],
        ],
      },
      {
        id: 'modals',
        titleRo: 'Verbe modale',
        noteRo: 'După modal, verbul rămâne la forma de bază: fără „to", fără „-s".',
        columns: ['Modal', 'Sens', 'Exemplu'],
        rows: [
          ['can / can\'t', 'pot / știu să', 'I can drive.'],
          ['could', 'puteam / aș putea (politicos)', 'Could you help me?'],
          ['may / might', 'e posibil', 'It might rain.'],
          ['must', 'obligație din interior', 'I must stop smoking.'],
          ['mustn\'t', 'interdicție', "You mustn't smoke here."],
          ['have to', 'obligație din exterior', 'I have to wear a uniform.'],
          ["don't have to", 'nu ești obligat', "You don't have to come."],
          ['should', 'sfat', 'You should rest.'],
          ['would', 'politețe / ipotetic', 'I would like a coffee.'],
          ['had to', 'trecutul lui must', 'I had to work late.'],
        ],
      },
    ],
  },

  {
    id: 'verb-patterns',
    titleRo: 'Ce urmează după verb',
    descRo: 'to + verb, verb-ing, sau nimic.',
    tables: [
      {
        id: 'verb-to',
        titleRo: 'Verb + to + verb',
        columns: ['Verb', 'Exemplu'],
        rows: [
          ['want', 'I want to go.'],
          ['need', 'I need to talk to you.'],
          ['decide', 'She decided to leave.'],
          ['hope / plan / promise', 'I hope to see you.'],
          ['learn / try / manage', 'I learnt to drive.'],
          ['would like / offer / refuse', "I'd like to help."],
          ['agree / expect / afford', 'They agreed to wait.'],
        ],
      },
      {
        id: 'verb-ing',
        titleRo: 'Verb + verb-ing',
        columns: ['Verb', 'Exemplu'],
        rows: [
          ['enjoy', 'I enjoy reading.'],
          ['mind', 'Do you mind waiting?'],
          ['finish / keep / avoid', 'I finished working at 6.'],
          ['suggest / imagine / miss', 'He suggested going by train.'],
          ["can't stand / practise", "I can't stand waiting."],
          ['look forward to', 'I look forward to hearing from you.'],
          ['orice prepoziție (in, at, for, of…)', "I'm good at cooking."],
        ],
      },
      {
        id: 'verb-nothing',
        titleRo: 'Verb + verb (fără to)',
        columns: ['Structură', 'Exemplu'],
        rows: [
          ['modale', 'I can swim.'],
          ['make / let / help', 'He made me wait. Let me know.'],
          ['see / hear + persoană', 'I saw him leave.'],
        ],
      },
      {
        id: 'meaning-change',
        titleRo: 'Aceleași verbe, alt sens',
        columns: ['Cu to', 'Cu -ing'],
        rows: [
          ['stop to smoke (te oprești ca să fumezi)', 'stop smoking (te lași de fumat)'],
          ['remember to lock (nu uita să încui)', 'remember locking (îți amintești că ai încuiat)'],
          ['try to open (încerci, e greu)', 'try opening (încearcă varianta asta)'],
        ],
      },
    ],
  },

  {
    id: 'spelling',
    titleRo: 'Ortografie și forme scurte',
    descRo: 'Cum se scriu terminațiile și cum se prescurtează în vorbire.',
    tables: [
      {
        id: 'spelling-rules',
        titleRo: 'Terminațiile verbelor',
        columns: ['Terminația verbului', '-s (persoana III)', '-ing', '-ed'],
        rows: [
          ['normal (work)', 'works', 'working', 'worked'],
          ['-e (like)', 'likes', 'liking', 'liked'],
          ['consoană + y (study)', 'studies', 'studying', 'studied'],
          ['vocală + y (play)', 'plays', 'playing', 'played'],
          ['s, sh, ch, x, o (watch)', 'watches', 'watching', 'watched'],
          ['CVC accentuat (stop)', 'stops', 'stopping', 'stopped'],
          ['-ie (lie)', 'lies', 'lying', 'lied'],
        ],
      },
      {
        id: 'contractions',
        titleRo: 'Forme scurte',
        noteRo: 'În vorbire se folosesc aproape mereu. În scrisul formal se evită.',
        columns: ['Formă lungă', 'Formă scurtă'],
        rows: [
          ['I am', "I'm"],
          ['you are / we are / they are', "you're / we're / they're"],
          ['he is / she is / it is', "he's / she's / it's"],
          ['I have / he has', "I've / he's"],
          ['I will / he will', "I'll / he'll"],
          ['I would / I had', "I'd"],
          ['is not / are not / was not', "isn't / aren't / wasn't"],
          ['do not / does not / did not', "don't / doesn't / didn't"],
          ['cannot / will not', "can't / won't"],
          ['should not / would not', "shouldn't / wouldn't"],
        ],
      },
    ],
  },

  {
    id: 'daily',
    titleRo: 'Numere, dată și oră',
    descRo: 'Cum se citesc lucrurile pe care le spui zilnic.',
    tables: [
      {
        id: 'time',
        titleRo: 'Ora',
        columns: ['Scris', 'Se citește'],
        rows: [
          ['7:00', "seven (o'clock)"],
          ['7:15', 'quarter past seven / seven fifteen'],
          ['7:30', 'half past seven / seven thirty'],
          ['7:45', 'quarter to eight / seven forty-five'],
          ['7:10', 'ten past seven'],
          ['12:00', 'midday / noon · 00:00 = midnight'],
          ['14:30', '2:30 p.m. (engleza folosește 12 ore)'],
        ],
      },
      {
        id: 'dates',
        titleRo: 'Data',
        columns: ['Scris', 'Se citește / se scrie'],
        rows: [
          ['5 iulie 2026 (UK)', '5 July 2026 → "the fifth of July"'],
          ['5 iulie 2026 (US)', 'July 5, 2026 → "July fifth"'],
          ['zile', 'on Monday, on 5 July'],
          ['ani', 'in 2026 → "twenty twenty-six"'],
          ['1990', '"nineteen ninety"'],
        ],
      },
      {
        id: 'numbers',
        titleRo: 'Numere care se greșesc',
        columns: ['Cifră', 'Cuvânt', 'Ordinal'],
        rows: [
          ['1', 'one', 'first (1st)'],
          ['2', 'two', 'second (2nd)'],
          ['3', 'three', 'third (3rd)'],
          ['5', 'five', 'fifth (5th)'],
          ['8', 'eight', 'eighth (8th)'],
          ['9', 'nine', 'ninth (9th)'],
          ['12', 'twelve', 'twelfth (12th)'],
          ['20', 'twenty', 'twentieth (20th)'],
          ['100', 'a/one hundred', 'hundredth'],
          ['1.000', 'a/one thousand', 'thousandth'],
          ['1.000.000', 'a/one million', 'millionth'],
        ],
      },
    ],
  },

  {
    id: 'connectors',
    titleRo: 'Conectori și expresii utile',
    descRo: 'Cuvintele care leagă ideile și te fac să sune fluent.',
    tables: [
      {
        id: 'linking',
        titleRo: 'Conectori',
        columns: ['Rol', 'Cuvinte', 'Ce urmează după'],
        rows: [
          ['contrast', 'but, although, even though', 'propoziție întreagă'],
          ['contrast', 'however, nevertheless', 'frază nouă, cu virgulă'],
          ['contrast', 'despite, in spite of', 'substantiv sau -ing'],
          ['cauză', 'because, since, as', 'propoziție întreagă'],
          ['cauză', 'because of, due to', 'substantiv'],
          ['efect', 'so, therefore, as a result', 'propoziție întreagă'],
          ['adăugare', 'and, also, as well as, moreover', '—'],
          ['ordine', 'first, then, after that, finally', '—'],
          ['exemplu', 'for example, for instance, such as', '—'],
          ['rezumat', 'in short, overall, to sum up', '—'],
        ],
      },
      {
        id: 'polite',
        titleRo: 'Politețe (engleza e mai indirectă decât româna)',
        columns: ['În loc de', 'Spune'],
        rows: [
          ['I want a coffee.', "I'd like a coffee, please."],
          ['Give me the report.', 'Could you send me the report?'],
          ['No.', "I'm afraid I can't."],
          ['You are wrong.', "I'm not sure that's right."],
          ['Repeat, please.', 'Sorry, could you repeat that?'],
          ['I don\'t understand.', "Sorry, I didn't catch that."],
        ],
      },
    ],
  },
];

/** Toate tabelele, cu secțiunea din care fac parte — folosit de căutare. */
export function allTables(): { section: RefSection; table: RefTable }[] {
  return REFERENCE.flatMap((section) => section.tables.map((table) => ({ section, table })));
}

/** Un tabel se potrivește dacă întrebarea apare în titlu, în notă sau oriunde în conținut. */
export function tableMatches(table: RefTable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (table.titleRo.toLowerCase().includes(q)) return true;
  if (table.noteRo?.toLowerCase().includes(q)) return true;
  if (table.columns.some((c) => c.toLowerCase().includes(q))) return true;
  return table.rows.some((row) => row.some((cell) => cell.toLowerCase().includes(q)));
}
