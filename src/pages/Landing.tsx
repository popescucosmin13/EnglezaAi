import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon, type IconName } from '../components/Icon';
import StoreBadges from '../components/StoreBadges';
import { APP_STORES } from '../config/stores';
import './Landing.css';

const scenarios: {
  label: string;
  icon: IconName;
  title: string;
  description: string;
  prompt: string;
  answer: string;
  natural: string;
  explanation: string;
}[] = [
  {
    label: 'La serviciu',
    icon: 'briefcase',
    title: 'Următoarea ședință. Cu mai multă încredere.',
    description:
      'Exersează un interviu, o prezentare sau o discuție cu un client. Ai un loc în care să-ți găsești cuvintele înainte să ai nevoie de ele.',
    prompt: 'How is the project coming along?',
    answer: 'We work on this project since Monday.',
    natural: 'We’ve been working on this project since Monday.',
    explanation: 'Acțiunea a început luni și continuă acum. Folosește „have been working” cu „since Monday”.',
  },
  {
    label: 'În călătorii',
    icon: 'plane',
    title: 'Biletul e rezervat. Pregătește și conversația.',
    description:
      'De la check-in la hotel până la o comandă la restaurant. Repetă situațiile de vacanță, în ritmul tău, cu un profesor care are răbdare.',
    prompt: 'Welcome! How can I help you?',
    answer: 'I want make check-in early.',
    natural: 'I’d like to check in early, please.',
    explanation: '„I’d like to” sună mai politicos când ceri ceva. Pentru acțiune, folosește „check in”, fără „make”.',
  },
  {
    label: 'Zi de zi',
    icon: 'message',
    title: 'Mai puțină traducere în minte. Mai multă conversație.',
    description:
      'Povestește ce ai făcut, vorbește despre pasiunile tale sau începe o conversație liberă. Transformă expresiile cunoscute în cuvinte pe care chiar le folosești.',
    prompt: 'What did you do yesterday?',
    answer: 'Yesterday I go to the cinema with my friends.',
    natural: 'Yesterday I went to the cinema with my friends.',
    explanation: '„Yesterday” plasează acțiunea în trecut. Trecutul verbului „go” este „went”.',
  },
];

const features: { icon: IconName; title: string; copy: string; detail: string }[] = [
  {
    icon: 'target',
    title: 'Un plan care pornește de la tine',
    copy: 'Testul vocal îți stabilește nivelul. Sesiunile țin cont de obiectivele, interesele și dificultățile tale.',
    detail: 'Test de nivel · Plan zilnic',
  },
  {
    icon: 'repeat',
    title: 'Greșelile devin următoarea lecție',
    copy: 'Revii la ce te-a încurcat, în contexte noi. Repetiția te ajută să folosești structura și fără indicii.',
    detail: 'Harta greșelilor · Recapitulare',
  },
  {
    icon: 'headphones',
    title: 'Auzi diferența. Exersezi pronunția.',
    copy: 'Asculți modelul, repeți cu voce tare și primești feedback. Lucrezi și sunetele dificile pentru români.',
    detail: 'Pronunție · Shadowing',
  },
  {
    icon: 'sparkles',
    title: 'Ai 3 minute? Ai timp de engleză.',
    copy: 'Microlecții și un feed For You cu expresii, construcții și exerciții alese pentru nivelul tău.',
    detail: 'Microlearning · For You',
  },
  {
    icon: 'book',
    title: 'Engleza pe care o și înțelegi',
    copy: 'Povești audio, întrebări de înțelegere și vocabular pe care îl asculți, îl rostești și îl folosești.',
    detail: 'Povești · Ascultare · Vocabular',
  },
  {
    icon: 'trending',
    title: 'Vezi ce se schimbă în timp',
    copy: 'Urmărește timpul vorbit, competențele și consecvența. Compară-ți rezultatele de la o sesiune la alta.',
    detail: 'Progres · Provocări · Rapoarte',
  },
];

const faqs = [
  [
    'Pot începe dacă nu vorbesc aproape deloc engleză?',
    'Da. Aplicația include conținut de la A1 la B2 și un mod de conversație cu profesor răbdător. Testul inițial te ajută să găsești punctul de pornire, iar explicațiile sunt în română.',
  ],
  [
    'Ce fac dacă nu știu cum să spun ceva?',
    'Poți cere ajutor în română. Funcția „Nu știu cum să spun” îți oferă expresia în engleză și explicația, apoi te ajută să o folosești în conversație.',
  ],
  [
    'Este gratuită?',
    'Poți începe cu planul Free: testul vocal inițial și o sesiune zilnică de până la 5 minute. Pro deblochează toate modulele, în limitele de utilizare ale planului. Prețurile, perioadele de probă disponibile și condițiile de abonare sunt afișate în aplicație înainte de confirmare.',
  ],
  [
    'Cât timp trebuie să exersez?',
    'Îți alegi ritmul. Ai micro-antrenamente de 3 minute, sesiuni scurte și conversații mai ample. Începe cu timpul pe care îl poți păstra în programul tău.',
  ],
  [
    'Funcționează pe iPhone și Android?',
    'Da. Descarcă EnglezaAI din App Store pentru iPhone sau din Google Play pentru Android, folosind butoanele de pe această pagină. Îți creezi contul direct în aplicația mobilă.',
  ],
  [
    'Pot crea un cont pe site?',
    'Conturile noi se creează exclusiv în aplicația mobilă. Descarcă EnglezaAI pe telefon și urmează pașii de acolo. Dacă ai deja un cont, autentificarea web rămâne disponibilă.',
  ],
  [
    'Am nevoie de internet și microfon?',
    'Da. Conversațiile cu profesorul AI au nevoie de conexiune la internet. Pentru exercițiile vocale, aplicația îți cere acces la microfon.',
  ],
];

function scrollTo(id: string, event?: MouseEvent<HTMLAnchorElement>) {
  event?.preventDefault();
  const section = document.getElementById(id);
  section?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  section?.focus({ preventScroll: true });
}

export default function Landing() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [showInstallBar, setShowInstallBar] = useState(false);
  const heroDownloads = useRef<HTMLDivElement>(null);
  const finalDownloads = useRef<HTMLElement>(null);
  const scenario = scenarios[scenarioIndex];

  useEffect(() => {
    const section = window.location.hash.slice(2).split('?')[0];
    if (['descarca', 'cum-functioneaza', 'pentru-tine', 'intrebari', 'planuri'].includes(section)) {
      scrollTo(section);
    }
  }, []);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    let heroVisible = true;
    let finalVisible = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === heroDownloads.current) heroVisible = entry.isIntersecting;
        if (entry.target === finalDownloads.current) finalVisible = entry.isIntersecting;
      }
      setShowInstallBar(!heroVisible && !finalVisible);
    });
    if (heroDownloads.current) observer.observe(heroDownloads.current);
    if (finalDownloads.current) observer.observe(finalDownloads.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page">
      <a className="lp-skip" href="#/continut" onClick={(event) => scrollTo('landing-main', event)}>
        Sari la conținut
      </a>
      <header className="lp-header">
        <a
          className="lp-brand"
          href="#/"
          aria-label="EnglezaAI — pagina principală"
          onClick={(event) => scrollTo('landing-main', event)}
        >
          <img src="/icon.svg" width="36" height="36" alt="" />
          <span>
            Engleza<span className="lp-brand-ai">AI</span>
          </span>
        </a>
        <nav className="lp-nav" aria-label="Navigare pagină">
          <a href="#/cum-functioneaza" onClick={(event) => scrollTo('cum-functioneaza', event)}>
            Cum funcționează
          </a>
          <a href="#/pentru-tine" onClick={(event) => scrollTo('pentru-tine', event)}>
            Pentru tine
          </a>
          <a href="#/intrebari" onClick={(event) => scrollTo('intrebari', event)}>
            Întrebări
          </a>
        </nav>
        <a className="lp-button lp-header-download" href="#/descarca" onClick={(event) => scrollTo('descarca', event)}>
          Descarcă aplicația <Icon name="arrowUpRight" size={17} />
        </a>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero lp-container" aria-labelledby="landing-title">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <span className="lp-status-dot" /> ENGLEZĂ VORBITĂ. EXPLICAȚII ÎN ROMÂNĂ.
            </span>
            <h1 id="landing-title">
              Engleza ta.
              <br />
              În sfârșit,
              <br />
              <span>cu voce tare.</span>
            </h1>
            <p className="lp-hero-lead">Cuvintele sunt acolo. Hai să le transformăm în conversații.</p>
            <p className="lp-hero-description">
              Vorbește cu un profesor AI care are răbdare, îți explică în română și te ajută să înveți din propriile
              greșeli. Direct pe telefonul tău.
            </p>
            <div className="lp-hero-downloads" ref={heroDownloads}>
              <StoreBadges />
              <p className="lp-download-note">
                <Icon name="checkCircle" size={15} /> Începi gratuit <span>·</span> iPhone și Android <span>·</span>{' '}
                Fără reclame
              </p>
            </div>
            <a
              className="lp-text-link lp-hero-explore"
              href="#/cum-functioneaza"
              onClick={(event) => scrollTo('cum-functioneaza', event)}
            >
              Descoperă cum înveți <Icon name="chevronDown" size={17} />
            </a>
          </div>

          <div className="lp-hero-visual" aria-label="Planul zilnic și un exemplu de conversație în EnglezaAI">
            <div className="lp-visual-orbit" aria-hidden="true" />
            <div className="lp-visual-orbit lp-visual-orbit-inner" aria-hidden="true" />
            <span className="lp-visual-caption">
              <Icon name="sparkles" size={16} /> Un profesor. Mereu în buzunar.
            </span>
            <figure className="lp-app-screen">
              <img
                src="/landing/daily-plan.png"
                width="390"
                height="844"
                alt="Plan zilnic EnglezaAI cu o sesiune pentru ședințe și scurtături către practică"
                loading="eager"
              />
            </figure>
            <div className="lp-conversation-card">
              <div className="lp-tutor-heading">
                <img src="/tutor-emma.png" width="44" height="44" alt="" />
                <div>
                  <strong>
                    Emma <span>· profesor AI</span>
                  </strong>
                  <small>
                    <span className="lp-status-dot" /> Aici pentru conversația ta
                  </small>
                </div>
                <Icon name="audio" size={23} />
              </div>
              <span className="lp-demo-label">EXEMPLU DE CONVERSAȚIE</span>
              <div className="lp-chat-teacher" lang="en">
                Tell me about your day.
                <br />
                What made you smile?
              </div>
              <div className="lp-chat-student" lang="en">
                Today I <span>make</span> a new friend.
              </div>
              <div className="lp-chat-feedback">
                <span>
                  <Icon name="sparkles" size={14} /> O mică ajustare
                </span>
                <p lang="en">
                  “Today I <strong>made</strong> a new friend.”
                </p>
                <small>O acțiune încheiată? Folosește „made”.</small>
              </div>
              <div className="lp-voice-display" aria-hidden="true">
                <div className="lp-wave">
                  {[11, 21, 31, 17, 37, 23].map((height, i) => (
                    <i key={i} style={{ height }} />
                  ))}
                </div>
                <span>
                  <Icon name="mic" size={26} />
                </span>
                <div className="lp-wave">
                  {[23, 37, 17, 31, 21, 11].map((height, i) => (
                    <i key={i} style={{ height }} />
                  ))}
                </div>
              </div>
              <p className="lp-voice-note">Tu vorbești. De aici începe progresul.</p>
            </div>
            <div className="lp-floating-note">
              <span>
                <Icon name="check" size={18} />
              </span>
              <div>
                <strong>Ai voie să greșești.</strong>
                <small>Așa începe învățarea.</small>
              </div>
            </div>
          </div>
        </section>

        <div className="lp-proof-strip lp-container" aria-label="Ce găsești în aplicație">
          <span>
            <Icon name="mic" size={21} /> Conversații vocale cu AI
          </span>
          <span>
            <Icon name="languages" size={21} /> Feedback în română
          </span>
          <span>
            <Icon name="target" size={21} /> Plan adaptat ție
          </span>
          <span>
            <Icon name="trending" size={21} /> Progres pe care îl vezi
          </span>
        </div>

        <section className="lp-section lp-container" id="cum-functioneaza" tabIndex={-1}>
          <div className="lp-section-heading">
            <span className="lp-kicker">DE LA „ÎNȚELEG” LA „POT SĂ SPUN”</span>
            <h2>
              Încrederea vine
              <br />
              din conversație.
            </h2>
            <p>Când înveți din ce tocmai ai spus, următoarea replică devine mai ușoară.</p>
          </div>
          <div className="lp-steps">
            <article>
              <span className="lp-step-number">
                01 <Icon name="mic" size={23} />
              </span>
              <h3>Spune-o în felul tău.</h3>
              <p>Începe o conversație despre o situație reală. Emma se adaptează nivelului și ritmului tău.</p>
            </article>
            <article>
              <span className="lp-step-number">
                02 <Icon name="message" size={23} />
              </span>
              <h3>Înțelege ce poți schimba.</h3>
              <p>Primești o corectură clară, explicația în română și o variantă care sună mai natural.</p>
            </article>
            <article>
              <span className="lp-step-number">
                03 <Icon name="repeat" size={23} />
              </span>
              <h3>Folosește-o data viitoare.</h3>
              <p>Greșelile revin ca exerciții și în contexte noi, ca să poți folosi singur ce ai învățat.</p>
            </article>
          </div>
        </section>

        <section className="lp-scenarios" id="pentru-tine" tabIndex={-1}>
          <div className="lp-container">
            <div className="lp-scenarios-top">
              <div>
                <span className="lp-kicker">PENTRU VIAȚA TA REALĂ</span>
                <h2>
                  Tu alegi motivul.
                  <br />
                  Exersăm împreună.
                </h2>
              </div>
              <div className="lp-scenario-tabs" aria-label="Alege un exemplu de conversație">
                {scenarios.map((item, index) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={scenarioIndex === index}
                    aria-controls="scenario-example"
                    onClick={() => setScenarioIndex(index)}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="lp-scenario-content" id="scenario-example" aria-live="polite" aria-atomic="true">
              <div className="lp-scenario-copy">
                <span className="lp-feature-symbol">
                  <Icon name={scenario.icon} size={29} />
                </span>
                <h3>{scenario.title}</h3>
                <p>{scenario.description}</p>
                <a className="lp-text-link" href="#/descarca" onClick={(event) => scrollTo('descarca', event)}>
                  Începe pe telefonul tău <Icon name="arrowUpRight" size={18} />
                </a>
              </div>
              <div className="lp-scenario-example">
                <div className="lp-example-heading">
                  <span>
                    <Icon name="sparkles" size={16} /> O conversație. Un pas înainte.
                  </span>
                  <small>EXEMPLU ILUSTRATIV</small>
                </div>
                <p className="lp-example-prompt" lang="en">
                  “{scenario.prompt}”
                </p>
                <div className="lp-example-before">
                  <span>TU SPUI</span>
                  <p lang="en">{scenario.answer}</p>
                </div>
                <div className="lp-example-after">
                  <span>
                    <Icon name="checkCircle" size={15} /> MAI NATURAL
                  </span>
                  <p lang="en">{scenario.natural}</p>
                </div>
                <p className="lp-example-explanation">
                  <Icon name="lightbulb" size={18} />
                  <span>{scenario.explanation}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-container" aria-labelledby="features-title">
          <div className="lp-section-heading">
            <span className="lp-kicker">TOTUL LUCREAZĂ ÎMPREUNĂ</span>
            <h2 id="features-title">
              O conversație bună
              <br />e doar începutul.
            </h2>
            <p>Un singur loc pentru engleza pe care o vorbești, o asculți și o folosești zi de zi.</p>
          </div>
          <div className="lp-feature-grid">
            {features.map((feature) => (
              <article key={feature.title}>
                <span className="lp-feature-symbol">
                  <Icon name={feature.icon} size={24} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
                <span className="lp-feature-detail">{feature.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-emma lp-container">
          <div className="lp-emma-portrait">
            <img
              src="/tutor-emma.png"
              alt="Emma, personajul profesorului AI din EnglezaAI"
              width="400"
              height="400"
              loading="lazy"
            />
            <span>
              <span className="lp-status-dot" /> Emma · profesorul tău AI
            </span>
          </div>
          <div className="lp-emma-copy">
            <span className="lp-kicker">FĂRĂ EMOȚIA UNEI CLASE</span>
            <h2>
              Un profesor cu care
              <br />
              poți fi începător.
            </h2>
            <p>
              Poți să cauți cuvintele. Să repeți. Să ceri ajutor în română. Emma păstrează firul conversațiilor și te
              ajută să faci următorul pas, din punctul în care ești.
            </p>
            <div className="lp-emma-rescue">
              <Icon name="message" size={22} />
              <div>
                <span>„Nu știu cum să spun că am amânat ședința.”</span>
                <strong lang="en">“I postponed the meeting.”</strong>
                <small>Înțelegi. Repeți. Continui conversația.</small>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-container lp-plans" id="planuri" tabIndex={-1}>
          <div className="lp-section-heading">
            <span className="lp-kicker">ÎNCEPE CU O CONVERSAȚIE</span>
            <h2>Primul pas e gratuit.</h2>
            <p>Descoperă-ți nivelul și încearcă profesorul. Alege Pro când vrei să mergi mai departe.</p>
          </div>
          <div className="lp-plan-grid">
            <article className="lp-plan">
              <span className="lp-plan-label">ENGLEZAAI FREE</span>
              <h3>Găsește-ți vocea.</h3>
              <p>Pentru prima conversație și un obicei nou.</p>
              <ul>
                <li>
                  <Icon name="check" size={18} /> Testul vocal inițial de nivel
                </li>
                <li>
                  <Icon name="check" size={18} /> O sesiune zilnică de până la 5 minute
                </li>
                <li>
                  <Icon name="check" size={18} /> Feedback explicat în română
                </li>
              </ul>
              <a
                className="lp-button lp-button-outline"
                href="#/descarca"
                onClick={(event) => scrollTo('descarca', event)}
              >
                Începe gratuit în aplicație <Icon name="arrowUpRight" size={17} />
              </a>
            </article>
            <article className="lp-plan lp-plan-pro">
              <span className="lp-plan-label">
                ENGLEZAAI PRO <span>Experiența completă</span>
              </span>
              <h3>Dă-i spațiu să crească.</h3>
              <p>Pentru mai multă conversație și practică.</p>
              <ul>
                <li>
                  <Icon name="check" size={18} /> Toate modurile de conversație
                </li>
                <li>
                  <Icon name="check" size={18} /> Pronunție, vocabular, gramatică și ascultare
                </li>
                <li>
                  <Icon name="check" size={18} /> For You, povești și microlecții adaptive
                </li>
                <li>
                  <Icon name="check" size={18} /> Provocări și rapoarte de progres
                </li>
              </ul>
              <a className="lp-button" href="#/descarca" onClick={(event) => scrollTo('descarca', event)}>
                Descoperă Pro în aplicație <Icon name="arrowUpRight" size={17} />
              </a>
            </article>
          </div>
          <p className="lp-plan-note">
            Prețurile și condițiile abonamentelor sunt afișate în aplicație înainte de cumpărare. Se aplică limitele de
            utilizare ale fiecărui plan.
          </p>
        </section>

        <section className="lp-faq lp-container" id="intrebari" tabIndex={-1}>
          <div>
            <span className="lp-kicker">ÎNTREBĂRI FIREȘTI</span>
            <h2>
              Hai să le
              <br />
              lămurim.
            </h2>
            <p>
              Mai ai nevoie de ajutor?
              <br />
              <a href="/support.html">
                Suntem aici pentru tine <Icon name="arrowUpRight" size={15} />
              </a>
            </p>
          </div>
          <div className="lp-faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Icon name="chevronDown" size={19} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-final" id="descarca" tabIndex={-1} ref={finalDownloads}>
          <div className="lp-container">
            <span className="lp-kicker">URMĂTOAREA REPLICĂ E A TA</span>
            <h2>
              Mai puțin „oare cum se spune?”.
              <br />
              <span>Mai mult „hai să vorbim”.</span>
            </h2>
            <p>
              Descarcă EnglezaAI, creează-ți contul în aplicație
              <br className="lp-desktop-break" /> și începe de la nivelul tău.
            </p>
            <StoreBadges />
            <span className="lp-final-note">Disponibilă pe iPhone și Android. Începi gratuit.</span>
          </div>
        </section>
      </main>

      <footer className="lp-footer lp-container">
        <div className="lp-footer-top">
          <a className="lp-brand" href="#/" onClick={(event) => scrollTo('landing-main', event)}>
            <img src="/icon.svg" width="32" height="32" alt="" />
            <span>
              Engleza<span className="lp-brand-ai">AI</span>
            </span>
          </a>
          <p>Engleza ta. Cu voce tare.</p>
          <a className="lp-existing-account" href="#/login">
            Ai deja cont? Autentificare web <Icon name="arrowUpRight" size={15} />
          </a>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} EnglezaAI</span>
          <nav aria-label="Informații și asistență">
            <a href="/privacy.html">Confidențialitate</a>
            <a href="/terms.html">Termeni</a>
            <a href="/support.html">Contact și suport</a>
            <a href="/delete-account.html">Ștergere cont</a>
          </nav>
        </div>
        <p className="lp-trademarks">
          Apple și sigla Apple sunt mărci comerciale ale Apple Inc. App Store este o marcă de serviciu a Apple Inc.
          Google Play și sigla Google Play sunt mărci comerciale ale Google LLC.
        </p>
      </footer>
      {showInstallBar && (
        <aside className="lp-mobile-install" aria-label="Instalează EnglezaAI">
          <span>
            <img src="/icon.svg" width="34" height="34" alt="" />
            <strong>Începe gratuit</strong>
          </span>
          <a href={APP_STORES.apple}>
            App Store <Icon name="arrowUpRight" size={14} />
          </a>
          <a href={APP_STORES.google}>
            Google Play <Icon name="arrowUpRight" size={14} />
          </a>
        </aside>
      )}
    </div>
  );
}
