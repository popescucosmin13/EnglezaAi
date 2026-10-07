// Practică: harta greșelilor (§14), vocabular activ/pasiv (§15), microlecții (§17), pronunție (§18).

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Mistake, MistakeDeepDive, VocabItem, Profile, Microlesson, SavedLesson, PronunciationResult, MistakeCategory, MistakeStatus } from '../types';
import { CATEGORY_LABELS_RO, STATUS_LABELS_RO, MISTAKE_CATEGORIES, vocabStage, PIPELINE_STAGES_RO, emptyPipeline } from '../types';
import {
  getMistakes,
  defaultProfile,
  deleteMistake,
  getVocab,
  saveVocab,
  getProfile,
  getCachedLesson,
  cacheLesson,
  getSavedLessons,
  deleteSavedLesson,
  savePronResult,
  getPronResults,
  newId,
  todayStr,
  bumpActivity,
  updateActivity,
  addXp,
} from '../db/db';
import { isDue, applyReview } from '../srs/ladder';
import { reviewMistake, prioritizeMistakes, dedupeMistakes, markVocabUse, dominantCategory, containsExpression, markMistakePipeline, ensureMistakePromptRo, ensureMistakeDeepDive, ensureTransferTest, evaluateTransfer, evaluateReviewAnswer } from '../logic/engine';
import { GRAMMAR_CURRICULUM, MINIMAL_PAIRS, WORD_STRESS, RHYTHM_SENTENCES } from '../content';
import { getPersonalizedPhrasesDetailed, weakSounds, SOUND_LABELS, type PronPhrase, type PhraseSource } from '../logic/pron';
import { mistakeDisplay } from '../logic/mistake-quality';
import { TappableText } from '../components/TappableText';
import MicrolessonCard from '../components/MicrolessonCard';
import GrammarCourse from './GrammarCourse';
import { chatJson } from '../api/openrouter';
import { buildMicrolessonPrompt, isMicrolessonShape } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { assessWithAzure, sttDiffAssessment, type PronAssessment } from '../api/azure';
import { blobToWav16k } from '../audio/wav';
import { hasOpenRouterKey } from '../settings';
import { BarChart } from '../components/Charts';
import { Icon, type IconName } from '../components/Icon';

type Tab = 'mistakes' | 'vocab' | 'course' | 'grammar' | 'pron' | 'listening';

const TABS = ['mistakes', 'vocab', 'course', 'grammar', 'pron', 'listening'] as const;

const PRACTICE_TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'mistakes', label: 'Greșeli', icon: 'message' },
  { key: 'vocab', label: 'Vocabular', icon: 'book' },
  { key: 'course', label: 'Curs', icon: 'graduation' },
  { key: 'grammar', label: 'Gramatică', icon: 'clipboard' },
  { key: 'pron', label: 'Pronunție', icon: 'audio' },
  { key: 'listening', label: 'Ascultare', icon: 'headphones' },
];

type PracticeSummary = {
  mistakesDue: number;
  vocabDue: number;
  weakSoundCount: number;
};

const EMPTY_PRACTICE_SUMMARY: PracticeSummary = { mistakesDue: 0, vocabDue: 0, weakSoundCount: 0 };

export default function Practice({ preview = false }: { preview?: boolean }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('mistakes');
  const [profile, setProfile] = useState<Profile | null>(() => preview ? { ...defaultProfile(), onboarded: true, testDone: true, dailyGoalMinutes: 12 } : null);
  const [summary, setSummary] = useState<PracticeSummary>(() => preview ? { mistakesDue: 5, vocabDue: 8, weakSoundCount: 3 } : EMPTY_PRACTICE_SUMMARY);
  const [loadError, setLoadError] = useState('');
  const deepLinkCategory = searchParams.get('category');
  const categoryFilter: MistakeCategory | undefined = MISTAKE_CATEGORIES.includes(deepLinkCategory as MistakeCategory)
    ? (deepLinkCategory as MistakeCategory)
    : undefined;

  // reacționează la linkuri către /practice?tab=...&category=... chiar dacă pagina e deja montată
  // (ex. din tab-ul Gramatică spre greșelile personale ale aceleiași reguli)
  useEffect(() => {
    const t = searchParams.get('tab');
    if ((TABS as readonly string[]).includes(t ?? '')) setTab(t as Tab);
  }, [searchParams]);

  function load() {
    if (preview) return;
    setLoadError('');
    getProfile().then(setProfile).catch((e) => setLoadError(String(e?.message ?? e)));
  }
  useEffect(load, []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    Promise.all([getMistakes(), getVocab(), weakSounds()])
      .then(([mistakes, vocab, sounds]) => {
        if (cancelled) return;
        setSummary({
          mistakesDue: dedupeMistakes(mistakes).filter((m) => m.status !== 'mastered' && isDue(m.review)).length,
          vocabDue: vocab.filter((v) => isDue(v.review)).length,
          weakSoundCount: sounds.length,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [preview]);

  if (!profile) {
    return (
      <div className="page">
        {loadError ? (
          <div className="error-banner">
            Nu am putut încărca profilul: {loadError}
            <div className="btn-row"><button onClick={load}>Reîncearcă</button></div>
          </div>
        ) : (
          <p><span className="spinner" /> Se încarcă…</p>
        )}
      </div>
    );
  }

  return (
    <div className="page practice-page">
      <header className="practice-heading">
        <span className="practice-heading-icon"><Icon name="mic" size={25} /></span>
        <span><h1>Practică</h1><p>Planul tău de practică</p></span>
      </header>

      <nav className="practice-tabs" aria-label="Module de practică">
        {PRACTICE_TABS.map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? 'active' : ''}
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? 'page' : undefined}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <section className="practice-module-shell" aria-live="polite">
        {tab === 'mistakes' && (
          <>
            <PracticeDashboard
              summary={summary}
              dailyGoalMinutes={profile.dailyGoalMinutes}
              onSelect={setTab}
              onOpenLab={() => navigate('/lab')}
            />
            <MistakesTab category={categoryFilter} preview={preview} />
          </>
        )}
        {tab === 'vocab' && <><PracticeModuleIntro tab="vocab" summary={summary} /><VocabTab preview={preview} /></>}
        {tab === 'course' && <><PracticeModuleIntro tab="course" summary={summary} /><GrammarCourse /></>}
        {tab === 'grammar' && <><PracticeModuleIntro tab="grammar" summary={summary} /><GrammarTab profile={profile} /></>}
        {tab === 'pron' && <><PracticeModuleIntro tab="pron" summary={summary} /><PronTab /></>}
        {tab === 'listening' && <><PracticeModuleIntro tab="listening" summary={summary} /><ListeningTab /></>}
      </section>
    </div>
  );
}

function PracticeDashboard({
  summary,
  dailyGoalMinutes,
  onSelect,
  onOpenLab,
}: {
  summary: PracticeSummary;
  dailyGoalMinutes: number;
  onSelect: (tab: Tab) => void;
  onOpenLab: () => void;
}) {
  const priorities = [
    { tab: 'mistakes' as const, icon: 'triangleAlert' as const, title: 'Greșeli de reparat', subtitle: 'Recapitulare țintită', value: summary.mistakesDue },
    { tab: 'vocab' as const, icon: 'book' as const, title: 'Vocabular de activat', subtitle: 'Cuvinte de folosit azi', value: summary.vocabDue },
    { tab: 'pron' as const, icon: 'audio' as const, title: 'Pronunție', subtitle: 'Sunete de exersat', value: summary.weakSoundCount },
  ];
  const activityCount = priorities.filter((item) => item.value > 0).length;
  const workload = summary.mistakesDue + summary.vocabDue + summary.weakSoundCount;
  const workloadRatio = Math.max(18, Math.min(72, workload * 4));

  return (
    <>
      <div className="practice-plan-card">
        <div className="practice-time">
          <Icon name="clock" size={22} />
          <strong>{dailyGoalMinutes || 12}</strong>
          <span>min</span>
        </div>
        <div className="practice-plan-copy">
          <strong>{activityCount || 3} activități azi</strong>
          <div className="practice-plan-progress" role="progressbar" aria-label="Volumul planului de azi" aria-valuenow={workloadRatio} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${workloadRatio}%` }} />
          </div>
          <span>{workload > 0 ? 'Plan adaptat progresului tău' : 'Ești la zi — poți consolida ce ai învățat'}</span>
        </div>
        <span className="practice-target-icon"><Icon name="target" size={21} /></span>
      </div>

      <h2 className="practice-section-title">Priorități pentru azi</h2>
      <div className="practice-priority-list">
        {priorities.map((item) => (
          <button key={item.tab} className="practice-priority-row" onClick={() => onSelect(item.tab)}>
            <span className="practice-row-icon"><Icon name={item.icon} size={22} /></span>
            <span className="practice-row-copy"><strong>{item.title}</strong><small>{item.subtitle}</small><span className="practice-row-progress"><i style={{ width: `${Math.max(10, Math.min(100, item.value * 12))}%` }} /></span></span>
            <strong className="practice-row-value">{item.value}</strong>
            <Icon name="arrowUpRight" size={17} />
          </button>
        ))}
      </div>

      <button className="practice-map-link" onClick={() => document.getElementById('practice-mistake-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <span className="practice-row-icon"><Icon name="trending" size={21} /></span>
        <span><strong>Harta personală a greșelilor</strong><small>Vezi tiparele care se repetă</small></span>
        <Icon name="arrowUpRight" size={17} />
      </button>

      <button className="practice-lab-card" onClick={onOpenLab}>
        <span className="practice-lab-icon"><Icon name="flask" size={23} /></span>
        <span><strong>Speaking Lab</strong><small>Scene ghidate, pronunție și conversație</small></span>
        <span className="practice-lab-cta">Deschide <Icon name="arrowUpRight" size={16} /></span>
      </button>
    </>
  );
}

function PracticeModuleIntro({ tab, summary }: { tab: Exclude<Tab, 'mistakes'>; summary: PracticeSummary }) {
  const content: Record<Exclude<Tab, 'mistakes'>, { icon: IconName; eyebrow: string; title: string; subtitle: string; value: string }> = {
    vocab: { icon: 'book', eyebrow: 'Activează', title: 'Vocabular', subtitle: 'Recunoaște, pronunță și folosește cuvintele în contexte noi.', value: `${summary.vocabDue} de repetat` },
    course: { icon: 'graduation', eyebrow: 'Învață', title: 'Curs', subtitle: 'Continuă parcursul structurat de gramatică de unde ai rămas.', value: 'Parcurs complet' },
    grammar: { icon: 'clipboard', eyebrow: 'Clarifică', title: 'Gramatică', subtitle: 'Lecții recomandate din greșelile și nivelul tău actual.', value: 'Personalizat' },
    pron: { icon: 'audio', eyebrow: 'Rostește', title: 'Pronunție', subtitle: 'Lucrează sunetele, accentul, ritmul și fluența.', value: `${summary.weakSoundCount} sunete` },
    listening: { icon: 'headphones', eyebrow: 'Înțelege', title: 'Ascultare', subtitle: 'Ascultă fără text, reconstruiește și verifică fiecare cuvânt.', value: 'Scară ghidată' },
  };
  const item = content[tab];
  return (
    <div className="practice-module-intro">
      <span className="practice-row-icon"><Icon name={item.icon} size={22} /></span>
      <span><small>{item.eyebrow}</small><strong>{item.title}</strong><p>{item.subtitle}</p></span>
      <em>{item.value}</em>
    </div>
  );
}

// ============ Harta greșelilor + review (§14) ============
function MistakesTab({ category, preview = false }: { category?: MistakeCategory; preview?: boolean }) {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [queue, setQueue] = useState<Mistake[]>([]);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<{ wrong: string; correct: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [transferFor, setTransferFor] = useState<Mistake | null>(null);
  const [detail, setDetail] = useState<Mistake | null>(null);
  const [detailDeepDive, setDetailDeepDive] = useState<MistakeDeepDive | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [showAllMistakes, setShowAllMistakes] = useState(false);
  const [statusFilter, setStatusFilter] = useState<MistakeStatus | null>(null);
  const recorder = useRef(new Recorder());

  const load = async () => {
    const all = dedupeMistakes(await getMistakes());
    setMistakes(all);
    // venit dintr-un link „Repetă <categorie>" din Istoric — arătăm toate greșelile active din
    // categorie, nu doar cele scadente azi, fiindcă cererea de a exersa acum e explicită
    const eligible = all.filter((m) => m.status !== 'mastered' && (!category || m.category === category));
    setQueue(prioritizeMistakes(category ? eligible : eligible.filter((m) => isDue(m.review))));
  };
  useEffect(() => {
    if (preview) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, preview]);

  const card = queue[0];
  const cardDisplay = card ? mistakeDisplay(card) : null;

  // Sarcina în română: nu trebuie să-ți amintești contextul — traduci propoziția afișată.
  const [promptRo, setPromptRo] = useState<string | null>(null);
  // Mini-lecția „de ce greșesc aici" + ratingul amânat cât rulează testul de transfer.
  const [deepDive, setDeepDive] = useState<MistakeDeepDive | null>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [pendingRate, setPendingRate] = useState<{ ok: boolean; fast: boolean } | null>(null);
  useEffect(() => {
    setPromptRo(null);
    setDeepDive(null);
    setDeepBusy(false);
    setPendingRate(null);
    if (!card) return;
    let cancelled = false;
    ensureMistakePromptRo(card).then((p) => { if (!cancelled && p) setPromptRo(p); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  // Greșeală repetată des (sau reapărută după stăpânire): repetarea singură nu ajută — poate lipsește
  // regula sau cuvintele. După revelare deschidem automat mini-lecția, în loc s-o cerem cu un buton.
  const strugglingCard = !!card && (((card.review?.failures ?? 0) >= 2) || card.status === 'reappeared');
  useEffect(() => {
    if (!revealed || !card || !strugglingCard || deepDive || deepBusy || !hasOpenRouterKey()) return;
    let cancelled = false;
    setDeepBusy(true);
    ensureMistakeDeepDive(card)
      .then((d) => { if (!cancelled && d) setDeepDive(d); })
      .finally(() => { if (!cancelled) setDeepBusy(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, card?.id, strugglingCard]);

  function normalize(s: string) {
    return s.toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ').trim();
  }

  async function check() {
    if (!card) return;
    // Acceptă fragmentul corectat, propoziția completă sau o propoziție care conține corectura.
    const targets = [card.correctFragment, card.corrected].filter((t): t is string => Boolean(t));
    const frag = card.correctFragment ? normalize(card.correctFragment) : '';
    setReviewErrors([]);
    if (answer.trim()) {
      const a = normalize(answer);
      const cheapPass = targets.some((t) => a === normalize(t)) || (frag.length > 0 && a.includes(frag));
      // Fragmentul lipsește (sau n-avem AI): verdict determinist, fără apel. Dacă pare corect,
      // confirmăm cu AI că nu mai sunt alte greșeli în propoziție (§ „corect doar dacă e curat").
      if (!cheapPass || !hasOpenRouterKey()) {
        setVerdict(cheapPass);
      } else {
        setChecking(true);
        try {
          const profile = await getProfile();
          const ev = await evaluateReviewAnswer(profile, card, answer, cheapPass);
          setVerdict(ev.verdict);
          setReviewErrors(ev.otherErrors);
        } finally {
          setChecking(false);
        }
      }
    }
    setRevealed(true);
    // etapa „explicată": utilizatorul vede acum corectura + explicația
    void markMistakePipeline(card, 'explained');
  }

  async function completeRate(ok: boolean, fast = false) {
    if (!card) return;
    if (ok && verdict === true) await markMistakePipeline(card, 'repeatedOk'); // a produs efectiv forma corectă
    await reviewMistake(card, ok ? (fast ? 'fast' : 'good') : 'fail');
    if (ok) await updateActivity({ oldMistakeFixed: true });
    setQueue((q) => q.slice(1));
    setAnswer('');
    setRevealed(false);
    setVerdict(null);
    setReviewErrors([]);
    setTransferFor(null);
    setPendingRate(null);
    load();
  }

  async function rate(ok: boolean, fast = false) {
    if (!card) return;
    // Învățare, nu bifare: după un răspuns bun, regula se aplică imediat într-un context nou.
    // Rulează o singură dată per greșeală (până trece), apoi reviews-urile revin la ritmul normal.
    if (ok && !card.pipeline?.usedInNewContext && !transferFor && hasOpenRouterKey()) {
      setPendingRate({ ok, fast });
      setTransferFor(card);
      return;
    }
    await completeRate(ok, fast);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setAnswer(text);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  /** Corecturile absurde (nume „corectate", termeni schimbați) se pot elimina definitiv. */
  async function removeMistake(m: Mistake) {
    if (!window.confirm(`Ștergi definitiv această greșeală?\n„${m.originalFragment ?? m.original}" → „${m.correctFragment ?? m.corrected}"`)) return;
    await deleteMistake(m.id).catch(() => {});
    setQueue((q) => q.filter((x) => x.id !== m.id));
    load();
  }

  /**
   * Fișa completă a unei greșeli (ca la vocabular): regula, de ce apare interferența cu
   * limba română și exemple noi — generată o singură dată, salvată pe greșeală, refolosită mereu.
   */
  async function openDetail(m: Mistake) {
    setDetail(m);
    setDetailDeepDive(m.deepDive ?? null);
    if (!m.deepDive && hasOpenRouterKey()) {
      setDetailBusy(true);
      const d = await ensureMistakeDeepDive(m).catch(() => undefined);
      setDetailBusy(false);
      if (d) {
        setDetailDeepDive(d);
        setMistakes((all) => all.map((x) => (x.id === m.id ? { ...x, deepDive: d } : x)));
      }
    }
  }

  const catCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  for (const m of mistakes) {
    catCounts.set(CATEGORY_LABELS_RO[m.category], (catCounts.get(CATEGORY_LABELS_RO[m.category]) ?? 0) + m.occurrenceCount);
    statusCounts.set(m.status, (statusCounts.get(m.status) ?? 0) + 1);
  }
  const statusFilteredMistakes = statusFilter ? mistakes.filter((m) => m.status === statusFilter) : mistakes;

  return (
    <>
      {card ? (
        <div className="card">
          {promptRo ? (
            <>
              <p className="tiny">De repetat azi: {queue.length} · spune în engleză:</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>„{promptRo}"</p>
              <p className="tiny" style={{ color: 'var(--danger)' }}>Atunci ai spus: „{cardDisplay?.wrong ?? card.original}"</p>
            </>
          ) : (
            <>
              <p className="tiny">De repetat azi: {queue.length} · spune/scrie varianta corectă:</p>
              <p style={{ fontSize: '1.1rem', color: 'var(--danger)' }}>„{cardDisplay?.wrong ?? card.original}"</p>
            </>
          )}
          {!revealed ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={checking} placeholder="Varianta corectă…" onKeyDown={(e) => e.key === 'Enter' && check()} />
                <button onClick={mic} disabled={checking} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
              </div>
              <div className="btn-row">
                <button className="btn-primary" onClick={check} disabled={checking}>
                  {checking ? <><span className="spinner" /> Se verifică…</> : 'Verifică'}
                </button>
              </div>
            </>
          ) : (
            <>
              {verdict != null && (
                <p style={{ color: verdict ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                  {verdict ? '✓ Corect!' : reviewErrors.length > 0 ? '✗ Aproape — regula e bună, dar mai ai greșeli:' : '✗ Nu chiar.'}
                </p>
              )}
              {reviewErrors.length > 0 && (
                <div className="card" style={{ margin: '6px 0' }}>
                  {reviewErrors.map((e, i) => (
                    <p key={i} className="tiny" style={{ margin: '4px 0' }}>
                      <span style={{ color: 'var(--danger)' }}>{e.wrong}</span> → <TappableText text={e.correct} style={{ fontWeight: 700 }} />
                    </p>
                  ))}
                </div>
              )}
              <TappableText text={cardDisplay?.right ?? card.corrected} sentence={card.corrected} style={{ color: 'var(--success)', fontWeight: 600, fontSize: '1.05rem', display: 'block' }} />
              {cardDisplay?.contextRight && <p className="muted">În propoziție: <TappableText text={cardDisplay.contextRight} /></p>}
              {card.naturalVersion && card.naturalVersion !== cardDisplay?.contextRight && <p className="muted">Natural: <TappableText text={card.naturalVersion} /></p>}
              <p className="tiny">{card.explanationRo}</p>
              {strugglingCard && (
                <p className="tiny" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                  {card.status === 'reappeared'
                    ? 'A revenit după ce păruse învățată — hai să recapitulăm regula, nu doar s-o repetăm.'
                    : `Ai greșit asta de ${card.review?.failures ?? 0} ori — hai să învățăm regula, nu doar s-o repetăm.`}
                </p>
              )}
              {strugglingCard && deepBusy && !deepDive && (
                <p className="tiny"><span className="spinner" /> Îți pregătesc o lecție scurtă…</p>
              )}
              {!deepDive && !strugglingCard && hasOpenRouterKey() && (
                <button className="btn-ghost" disabled={deepBusy} onClick={async () => {
                  setDeepBusy(true);
                  const d = await ensureMistakeDeepDive(card).catch(() => undefined);
                  setDeepBusy(false);
                  if (d) setDeepDive(d);
                }}>
                  <Icon name={deepBusy ? 'loader' : 'lightbulb'} className={deepBusy ? 'icon-spin' : undefined} />
                  {deepBusy ? 'Se pregătește…' : 'De ce greșesc aici? Explică-mi regula'}
                </button>
              )}
              {deepDive && (
                <div className="info-banner" style={{ textAlign: 'left' }}>
                  <p style={{ margin: '2px 0' }}><strong>Regula:</strong> {deepDive.ruleRo}</p>
                  <p style={{ margin: '2px 0' }}><strong>De ce o greșești:</strong> {deepDive.interferenceRo}</p>
                  {deepDive.examples.map((ex, i) => (
                    <p key={i} className="tiny" style={{ margin: '3px 0' }}>
                      • <strong>{ex.en}</strong> — {ex.ro}
                      <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(ex.en, 0.92)} aria-label="Ascultă"><Icon name="volume" size={14} /></button>
                    </p>
                  ))}
                </div>
              )}
              {/* Drumul greșelii spre stăpânire — repetarea e doar prima etapă, nu scopul. */}
              <div className="tiny" style={{ marginTop: 6 }}>
                {PIPELINE_STAGES_RO.map(({ key, label }) => {
                  const p = card.pipeline ?? emptyPipeline();
                  const done = key === 'spontaneousUses' ? p.spontaneousUses >= 3 : p[key];
                  return (
                    <span key={key} style={{ opacity: done ? 1 : 0.45, marginRight: 6 }}>
                      {done ? '✓' : '○'} {label}
                    </span>
                  );
                })}
              </div>
              {!transferFor && (
                <div className="btn-row">
                  <button className="btn-danger" onClick={() => rate(false)}>N-am știut</button>
                  <button onClick={() => rate(true)}>Am știut</button>
                  <button className="btn-success" onClick={() => rate(true, true)}>Ușor</button>
                </div>
              )}
              {transferFor && (
                <TransferTest
                  mistake={transferFor}
                  onDone={() => {
                    const pr = pendingRate;
                    void completeRate(pr?.ok ?? true, pr?.fast ?? false);
                  }}
                />
              )}
            </>
          )}
        </div>
      ) : (
        <div className="card"><p className="muted">Nimic de repetat acum — greșelile revin după scara: 1, 3, 7, 14, 30, 60 de zile.</p></div>
      )}

      <h2 id="practice-mistake-map">Harta personală a greșelilor</h2>
      <div className="card">
        <BarChart items={[...catCounts.entries()].map(([label, value]) => ({ label, value }))} />
      </div>
      <div className="chip-row">
        <button className={`chip ${statusFilter == null ? 'selected' : ''}`} onClick={() => setStatusFilter(null)}>
          Toate: {mistakes.length}
        </button>
        {(['new', 'learning', 'improving', 'almost', 'mastered', 'reappeared'] as const).map((s) => (
          <button key={s} className={`chip ${statusFilter === s ? 'selected' : ''}`} onClick={() => setStatusFilter(s)}>
            {STATUS_LABELS_RO[s]}: {statusCounts.get(s) ?? 0}
          </button>
        ))}
      </div>
      <p className="tiny">Atinge o greșeală pentru fișa completă: regula, de ce apare (interferența cu română) și exemple noi.</p>
      {(showAllMistakes ? statusFilteredMistakes : statusFilteredMistakes.slice().sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 20))
        .map((m) => {
          const d = mistakeDisplay(m);
          return (
          <div key={m.id} className="card clickable" style={{ padding: 12 }} onClick={() => openDetail(m)}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>{d.wrong}</span>{' '}
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{d.right}</span>
                {m.deepDive && <span className="badge soft" style={{ marginLeft: 6 }}>fișă completă</span>}
              </div>
              <button
                className="btn-ghost"
                style={{ padding: '2px 6px', flex: '0 0 auto', color: 'var(--muted)' }}
                onClick={(e) => { e.stopPropagation(); removeMistake(m); }}
                aria-label="Șterge greșeala"
                title="Șterge — nu e o corectură reală"
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            {d.contextRight && <div className="tiny" style={{ opacity: 0.7, marginTop: 2 }}>În propoziție: {d.contextRight}</div>}
            <div className="tiny">
              {CATEGORY_LABELS_RO[m.category]} · {m.occurrenceCount}x · {STATUS_LABELS_RO[m.status]} · {m.review.correctUses} utilizări corecte
              {m.disputed && ' · contestată'}
            </div>
            <div className="tiny" style={{ marginTop: 2 }}>
              {PIPELINE_STAGES_RO.map(({ key, label }) => {
                const p = m.pipeline ?? emptyPipeline();
                const done = key === 'spontaneousUses' ? p.spontaneousUses >= 3 : p[key];
                const text = key === 'spontaneousUses' && p.spontaneousUses > 0 && p.spontaneousUses < 3 ? `spontan ${p.spontaneousUses}/3` : label;
                return (
                  <span key={key} style={{ opacity: done ? 1 : 0.45, marginRight: 6 }}>
                    {done ? '✓' : '○'} {text}
                  </span>
                );
              })}
            </div>
          </div>
          );
        })}
      {!showAllMistakes && statusFilteredMistakes.length > 20 && (
        <button className="btn-ghost" onClick={() => setShowAllMistakes(true)}>Arată toate ({statusFilteredMistakes.length})</button>
      )}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{mistakeDisplay(detail).wrong} → <span style={{ color: 'var(--success)' }}>{mistakeDisplay(detail).right}</span></h3>
            <p className="tiny">
              {CATEGORY_LABELS_RO[detail.category]} · {detail.occurrenceCount}x · {STATUS_LABELS_RO[detail.status]}
              {detail.naturalVersion && detail.naturalVersion !== detail.corrected && <> · natural: <strong>{detail.naturalVersion}</strong></>}
            </p>
            <p className="muted">{detail.explanationRo}</p>
            {detailBusy && <p><span className="spinner" /> Se pregătește regula și exemplele…</p>}
            {detailDeepDive && (
              <div className="info-banner" style={{ textAlign: 'left' }}>
                <p style={{ margin: '2px 0' }}><strong>Regula:</strong> {detailDeepDive.ruleRo}</p>
                <p style={{ margin: '2px 0' }}><strong>De ce o greșești:</strong> {detailDeepDive.interferenceRo}</p>
                {detailDeepDive.examples.map((ex, i) => (
                  <p key={i} className="tiny" style={{ margin: '3px 0' }}>
                    • <strong>{ex.en}</strong> — {ex.ro}
                    <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(ex.en, 0.92)} aria-label="Ascultă"><Icon name="volume" size={14} /></button>
                  </p>
                ))}
              </div>
            )}
            {!detailBusy && !detailDeepDive && !hasOpenRouterKey() && (
              <p className="tiny">Explicația detaliată este temporar indisponibilă. Încearcă din nou puțin mai târziu.</p>
            )}
            <div className="btn-row"><button onClick={() => setDetail(null)}>Închide</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/** Test de transfer (§P1): aceeași regulă gramaticală, într-un context complet nou. */
function TransferTest({ mistake, onDone }: { mistake: Mistake; onDone: (passed: boolean) => void }) {
  const [exercise, setExercise] = useState<{ situationRo: string; expectedEn: string; keyWords: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [outcome, setOutcome] = useState<'pass' | 'partial' | 'fail' | null>(null);
  const [otherErrors, setOtherErrors] = useState<{ wrong: string; correct: string }[]>([]);
  const [note, setNote] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const recorder = useRef(new Recorder());

  useEffect(() => {
    (async () => {
      setBusy(true);
      setError('');
      try {
        const profile = await getProfile();
        // reutilizat din greșeală dacă a mai fost generat (§ optimizare tokeni); regenerăm
        // doar la reîncercare explicită după o eroare (attempt > 0), nu la fiecare revenire SRS.
        const ex = await ensureTransferTest(profile, mistake, attempt > 0);
        if (!ex) throw new Error('Exercițiul nu a putut fi generat.');
        setExercise(ex);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mistake.id, attempt]);

  async function submit(text: string) {
    if (!exercise || !text.trim() || evaluating) return;
    setAnswer(text);
    setEvaluating(true);
    try {
      // Evaluare onestă: regula exersată e judecată separat de restul propoziției (§ credit doar dacă e curat).
      const profile = await getProfile();
      const ev = await evaluateTransfer(profile, mistake, exercise, text);
      setOtherErrors(ev.otherErrors);
      setNote(ev.noteRo);
      if (ev.ruleApplied && ev.otherErrors.length === 0) {
        setOutcome('pass');
        await markMistakePipeline(mistake, 'usedInNewContext');
        await addXp(12);
      } else {
        // regula aplicată dar cu alte greșeli = „partial" (fără credit); regula ratată = „fail"
        setOutcome(ev.ruleApplied ? 'partial' : 'fail');
      }
    } finally {
      setEvaluating(false);
    }
  }

  function retry() {
    setOutcome(null);
    setAnswer('');
    setOtherErrors([]);
    setNote('');
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        await submit(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  return (
    <div className="card" style={{ borderLeft: '3px solid var(--primary)', marginTop: 8 }}>
      <span className="badge">Test de transfer</span>
      {error && <div className="error-banner">{error}</div>}
      {busy && <p><span className="spinner" /> Se pregătește exercițiul…</p>}
      {!busy && !exercise && (
        <div className="btn-row">
          <button onClick={() => setAttempt((n) => n + 1)}><Icon name="rotate" />Reîncearcă</button>
          <button className="btn-ghost" onClick={() => onDone(false)}>Renunț</button>
        </div>
      )}
      {exercise && outcome == null && (
        <>
          <p style={{ margin: '6px 0' }}>{exercise.situationRo}</p>
          <p className="tiny">Spune sau scrie propoziția în engleză — aceeași regulă, context nou.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={evaluating} placeholder="Propoziția ta în engleză…" onKeyDown={(e) => e.key === 'Enter' && submit(answer)} />
            <button className={recording ? 'btn-danger' : ''} onClick={mic} disabled={evaluating} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
          </div>
          <div className="btn-row">
            <button className="btn-primary" onClick={() => submit(answer)} disabled={!answer.trim() || evaluating}>
              {evaluating ? <><span className="spinner" /> Se verifică…</> : 'Verifică'}
            </button>
            <button className="btn-ghost" onClick={() => onDone(false)} disabled={evaluating}>Renunț</button>
          </div>
        </>
      )}
      {exercise && outcome != null && (
        <>
          <p style={{ color: outcome === 'pass' ? 'var(--success)' : outcome === 'partial' ? 'var(--warn, #b06f00)' : 'var(--danger)', fontWeight: 700 }}>
            {outcome === 'pass'
              ? '✓ Transfer reușit! Regula funcționează și în context nou. +12 XP'
              : outcome === 'partial'
                ? '✓ Ai aplicat regula — dar mai sunt greșeli de corectat:'
                : '✗ Regula nu a fost aplicată corect.'}
          </p>
          {note && <p className="tiny">{note}</p>}
          {otherErrors.length > 0 && (
            <div className="card" style={{ margin: '6px 0' }}>
              {otherErrors.map((e, i) => (
                <p key={i} className="tiny" style={{ margin: '4px 0' }}>
                  <span style={{ color: 'var(--danger)' }}>{e.wrong}</span> → <TappableText text={e.correct} style={{ fontWeight: 700 }} />
                </p>
              ))}
            </div>
          )}
          <p className="tiny">Ai spus: „{answer}"</p>
          <p className="tiny">Un răspuns bun: <TappableText text={exercise.expectedEn} style={{ fontWeight: 700 }} /> <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(exercise.expectedEn, 0.92)} aria-label="Ascultă"><Icon name="volume" /></button></p>
          <div className="btn-row">
            <button className="btn-primary" onClick={() => onDone(outcome === 'pass')}>Continuă</button>
            {outcome !== 'pass' && <button onClick={retry}>Mai încearcă</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ============ Vocabular (§15) ============
function VocabTab({ preview = false }: { preview?: boolean }) {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [queue, setQueue] = useState<VocabItem[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [sentence, setSentence] = useState('');
  const [recording, setRecording] = useState(false);
  const [pronRecording, setPronRecording] = useState(false);
  const [useResult, setUseResult] = useState<string | null>(null);
  const [detail, setDetail] = useState<VocabItem | null>(null);
  const recorder = useRef(new Recorder());

  const load = async () => {
    const all = await getVocab();
    setVocab(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setQueue(all.filter((v) => isDue(v.review)));
  };
  useEffect(() => {
    if (preview) return;
    load();
  }, [preview]);

  const card = queue[0];

  async function rate(ok: boolean) {
    if (!card) return;
    card.review = applyReview(card.review, ok ? 'good' : 'fail');
    if (ok) card.passiveScore = Math.min(100, card.passiveScore + 10);
    await saveVocab(card);
    await bumpActivity('vocabReviews', 1);
    await addXp(ok ? 4 : 1);
    setQueue((q) => q.slice(1));
    setRevealed(false);
    setSentence('');
    setPronRecording(false);
    setUseResult(null);
    load();
  }

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ').trim();

  /** Pasul 3 din activare (§15): folosește cuvântul într-o propoziție proprie, cu voce. */
  async function useInSentence() {
    if (!card) return;
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setSentence(text);
        // verificare riguroasă: expresia întreagă, pe cuvinte complete, minimum 4 cuvinte,
        // și nu exemplul afișat repetat papagalicește
        if (!containsExpression(text, card.word)) {
          setUseResult('Propoziția nu conține cuvântul întreg — mai încearcă.');
        } else if (text.trim().split(/\s+/).length < 4) {
          setUseResult('Prea scurt — spune o propoziție completă (minimum 4 cuvinte).');
        } else if (card.example && normalize(text) === normalize(card.example)) {
          setUseResult('Ai repetat exemplul — construiește o propoziție proprie.');
        } else if (card.usedInSentence && card.personalExample && normalize(text) === normalize(card.personalExample)) {
          setUseResult('Ai spus aceeași propoziție ca data trecută — pentru „context nou" folosește cuvântul într-o situație diferită.');
        } else {
          card.personalExample = text;
          await markVocabUse(card, card.usedInSentence ? 'usedInNewContext' : 'usedInSentence');
          await addXp(8);
          setUseResult('✓ Propoziție acceptată — cuvântul avansează spre vocabularul activ!');
        }
      } catch {
        setUseResult('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* ignore */
    }
  }

  /** Pasul 2 din activare (§15): utilizatorul pronunță efectiv cuvântul, iar aplicația îl verifică. */
  async function pronounceIt() {
    if (!card || recording) return;
    if (pronRecording) {
      setPronRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(card.word));
        if (containsExpression(text, card.word)) {
          await markVocabUse(card, 'pronounced');
          await addXp(4);
          setUseResult('✓ Pronunție confirmată! Acum folosește-l într-o propoziție.');
        } else {
          setUseResult(`Nu am recunoscut cuvântul${text.trim() ? ` (am auzit: „${text.trim()}")` : ''} — ascultă modelul și mai încearcă.`);
        }
      } catch {
        setUseResult('Nu am putut transcrie — mai încearcă.');
      }
      return;
    }
    await speak(card.word, 0.9); // întâi modelul, apoi înregistrăm utilizatorul
    try {
      await recorder.current.start();
      setPronRecording(true);
      setUseResult('Acum pronunță tu cuvântul, apoi apasă din nou.');
    } catch {
      setUseResult('Nu am acces la microfon.');
    }
  }

  const active = vocab.filter((v) => v.activeScore >= 60).length;
  const passive = vocab.length - active;

  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile"><div className="value">{active}</div><div className="label">vocabular ACTIV</div></div>
        <div className="stat-tile"><div className="value">{passive}</div><div className="label">vocabular pasiv</div></div>
        <div className="stat-tile"><div className="value">{queue.length}</div><div className="label">de repetat azi</div></div>
      </div>
      <p className="tiny">Un cuvânt devine activ doar după: recunoscut → pronunțat → folosit în propoziție → context nou → spontan în conversație.</p>

      {card && (
        <div className="card">
          <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary-deep)' }}>{card.word}</p>
          <p className="tiny">{vocabStage(card)} · activ {card.activeScore}/100</p>
          {!revealed ? (
            <div className="btn-row">
              <button className="btn-primary" onClick={() => setRevealed(true)}>Arată traducerea</button>
              <button className="btn-ghost" onClick={() => speak(card.word, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
            </div>
          ) : (
            <>
              <p style={{ fontWeight: 600 }}>{card.translation || '(fără traducere salvată)'}</p>
              {card.example && <p className="tiny">„{card.example}"</p>}
              <div className="btn-row">
                <button className="btn-danger" onClick={() => rate(false)}>Nu-l știam</button>
                <button className="btn-success" onClick={() => rate(true)}>Îl știu</button>
              </div>
              <div className="btn-row">
                <button className={pronRecording ? 'btn-danger' : ''} onClick={pronounceIt} disabled={recording}>
                  <Icon name={pronRecording ? 'stop' : 'audio'} />{pronRecording ? 'Am pronunțat' : 'Pronunță-l'}
                </button>
                <button className={recording ? 'btn-danger' : ''} onClick={useInSentence} disabled={pronRecording}>
                  <Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Oprește' : 'Folosește-l într-o propoziție'}
                </button>
              </div>
              {sentence && <p className="tiny">Ai spus: „{sentence}"</p>}
              {useResult && <div className="info-banner"><Icon name={useResult.startsWith('Acum') ? 'mic' : useResult.includes('confirmată') ? 'checkCircle' : 'lightbulb'} size={16} /> {useResult}</div>}
            </>
          )}
        </div>
      )}

      <h2>Toate cuvintele ({vocab.length})</h2>
      {vocab.slice(0, 30).map((v) => (
        <div key={v.id} className="card clickable" style={{ padding: 12 }} onClick={() => setDetail(v)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{v.word}</strong> <span className="tiny">{v.translation}</span>
            </div>
            <span className={`badge ${v.activeScore >= 60 ? '' : 'soft'}`}>{v.activeScore >= 60 ? 'ACTIV' : vocabStage(v)}</span>
          </div>
          <div className="bar" style={{ marginTop: 6 }}>
            <div style={{ width: `${v.activeScore}%` }} />
          </div>
        </div>
      ))}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{detail.word} <button className="btn-ghost" onClick={() => speak(detail.word, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button></h3>
            <p><strong>{detail.translation}</strong> {detail.cefrLevel && <span className="badge soft">{detail.cefrLevel}</span>}</p>
            {detail.example && <p className="muted">Exemplu: {detail.example}</p>}
            {detail.personalExample && <p className="muted">Din contextul tău: {detail.personalExample}</p>}
            {detail.synonyms && detail.synonyms.length > 0 && <p className="tiny">Sinonime: {detail.synonyms.join(', ')}</p>}
            {detail.opposite && <p className="tiny">Opus: {detail.opposite}</p>}
            <p className="tiny">
              Stadiu: {vocabStage(detail)} · pasiv {detail.passiveScore}/100 · activ {detail.activeScore}/100 · următoarea repetare: {detail.review.nextReviewAt}
            </p>
            <div className="btn-row"><button onClick={() => setDetail(null)}>Închide</button></div>
          </div>
        </div>
      )}
    </>
  );
}

// ============ Gramatică: microlecții din curriculum (§17) + lecții salvate ============
function GrammarTab({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<Microlesson | null>(null);
  const [lessonKey, setLessonKey] = useState('');
  const [lessonCategory, setLessonCategory] = useState<MistakeCategory | null>(null);
  const [lessonMistakeCount, setLessonMistakeCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [savedLessons, setSavedLessons] = useState<SavedLesson[]>([]);
  const [openSavedId, setOpenSavedId] = useState<string | null>(null);

  const loadSaved = () => getSavedLessons().then(setSavedLessons).catch(() => {});

  useEffect(() => {
    dominantCategory().then((cat) => {
      if (!cat) return;
      const item = GRAMMAR_CURRICULUM.find((c) => c.level === profile.currentLevel && c.category === cat) ?? GRAMMAR_CURRICULUM.find((c) => c.category === cat);
      setRecommended(item?.id ?? null);
    });
    getMistakes().then((all) => setMistakes(dedupeMistakes(all))).catch(() => {});
    loadSaved();
  }, [profile]);

  async function openLesson(id: string, titleRo: string) {
    setError('');
    setLessonKey(id);
    const item = GRAMMAR_CURRICULUM.find((c) => c.id === id);
    setLessonCategory(item?.category ?? null);
    const relatedNow = item ? (await getMistakes()).filter((m) => m.category === item.category && m.status !== 'mastered') : [];
    setLessonMistakeCount(relatedNow.length);
    const cached = await getCachedLesson(id);
    if (cached) {
      setLesson(cached);
      return;
    }
    if (!hasOpenRouterKey()) {
      setError('Lecția este temporar indisponibilă. Încearcă din nou puțin mai târziu.');
      return;
    }
    setBusy(true);
    try {
      const l = await chatJson<Microlesson>([{ role: 'user', content: buildMicrolessonPrompt(profile, titleRo, relatedNow) }], {
        feature: 'microlesson_curriculum', maxTokens: 1600, validate: isMicrolessonShape,
      });
      await cacheLesson(id, l);
      setLesson(l);
      await updateActivity({ lessonDone: true });
      await addXp(15);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function removeSavedLesson(id: string) {
    if (!window.confirm('Ștergi această lecție salvată?')) return;
    await deleteSavedLesson(id).catch(() => {});
    setSavedLessons((all) => all.filter((l) => l.id !== id));
    if (openSavedId === id) setOpenSavedId(null);
  }

  const levels: Profile['currentLevel'][] = ['A1', 'A2', 'B1', 'B2'];
  const topMistakes = mistakes
    .filter((m) => m.status !== 'mastered')
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, 5);

  return (
    <>
      {error && <div className="error-banner">{error}</div>}

      {topMistakes.length > 0 && (
        <>
          <h2><Icon name="flame" size={16} />Cele mai frecvente greșeli</h2>
          <div className="card">
            {topMistakes.map((m) => {
              const d = mistakeDisplay(m);
              return (
                <div key={m.id} style={{ margin: '8px 0' }}>
                  <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>{d.wrong}</span>{' '}
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>{d.right}</span>
                  <div className="tiny">{CATEGORY_LABELS_RO[m.category]} · {m.occurrenceCount}x</div>
                </div>
              );
            })}
            <button className="btn-ghost" onClick={() => navigate('/practice?tab=mistakes')}>
              <Icon name="target" size={15} />Vezi și exersează toate greșelile →
            </button>
          </div>
        </>
      )}

      {busy && <p><span className="spinner" /> Se generează microlecția…</p>}
      {lesson && (
        <MicrolessonCard
          lesson={lesson}
          footer={
            <>
              <p className="tiny">Pasul următor: folosește structura în conversația de azi — AI-ul o va forța.</p>
              {lessonCategory && lessonMistakeCount > 0 && (
                <button className="btn-ghost" onClick={() => navigate(`/practice?tab=mistakes&category=${lessonCategory}`)}>
                  <Icon name="target" size={15} />Vezi cele {lessonMistakeCount} greșeli ale tale la asta, cu regulă și exemple →
                </button>
              )}
            </>
          }
        />
      )}

      {levels.map((lvl) => (
        <div key={lvl}>
          <h2>Nivel {lvl} {lvl === profile.currentLevel && <span className="badge">nivelul tău</span>}</h2>
          <div className="chip-row">
            {GRAMMAR_CURRICULUM.filter((c) => c.level === lvl).map((c) => (
              <button
                key={c.id}
                className={`chip ${lessonKey === c.id ? 'selected' : ''}`}
                style={recommended === c.id ? { borderColor: 'var(--warn)', background: 'var(--warn-soft)' } : undefined}
                onClick={() => openLesson(c.id, c.titleRo)}
              >
                {recommended === c.id && <Icon name="flame" size={15} />}
                {c.titleRo}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="tiny"><Icon name="flame" size={14} /> = recomandat din greșelile tale. Lecțiile generate se salvează local (cache).</p>

      {savedLessons.length > 0 && (
        <>
          <h2><Icon name="star" size={16} />Lecțiile mele salvate</h2>
          {savedLessons.map((l) =>
            openSavedId === l.id ? (
              <MicrolessonCard
                key={l.id}
                lesson={l}
                badge="Lecția ta"
                footer={
                  <div className="btn-row">
                    <button className="btn-ghost" onClick={() => setOpenSavedId(null)}>Închide</button>
                    <button className="btn-ghost" onClick={() => removeSavedLesson(l.id)}><Icon name="trash" size={15} />Șterge</button>
                  </div>
                }
              />
            ) : (
              <div key={l.id} className="card clickable" onClick={() => setOpenSavedId(l.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <strong>{l.rule}</strong>
                    <div className="tiny">„{l.sourceEn}"</div>
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ padding: '2px 6px', flex: '0 0 auto', color: 'var(--muted)' }}
                    onClick={(e) => { e.stopPropagation(); removeSavedLesson(l.id); }}
                    aria-label="Șterge lecția"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}

// ============ Listening ladder (§P1): fără text → reascultare → reconstrucție → verificare ============
function ListeningTab() {
  const [phrases, setPhrases] = useState<PronPhrase[]>([]);
  const [idx, setIdx] = useState(0);
  const [listens, setListens] = useState(0);
  const [attempt, setAttempt] = useState('');
  const [recording, setRecording] = useState(false);
  const [checked, setChecked] = useState<PronAssessment | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [error, setError] = useState('');
  const [source, setSource] = useState<PhraseSource>('generated');
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getPersonalizedPhrasesDetailed().then(({ phrases: p, source: s }) => { setPhrases(p); setSource(s); }).catch(() => setPhrases([]));
    getPronResults().then((r) => setTodayCount(r.filter((x) => x.exercise === 'listening' && x.date === todayStr()).length)).catch(() => {});
  }, []);

  const current = phrases.length > 0 ? phrases[idx % phrases.length] : null;

  async function listen() {
    if (!current) return;
    setListens((n) => n + 1);
    await speak(current.text, listens === 0 ? 0.95 : 0.85); // reascultarea e mai lentă
  }

  async function verify(text: string) {
    if (!current || !text.trim()) return;
    const res = sttDiffAssessment(current.text, text);
    setChecked(res);
    const rec: PronunciationResult = {
      id: newId(),
      date: todayStr(),
      exercise: 'listening',
      phrase: current.text,
      targets: ['listening'],
      score: res.accuracyScore,
      wordScores: res.words,
      source: 'stt-diff',
    };
    try {
      await savePronResult(rec);
      await addXp(res.accuracyScore >= 80 ? 8 : 4);
      setTodayCount((n) => n + 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setAttempt(text);
        await verify(text);
      } catch {
        setError('Nu am putut transcrie.');
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  function next() {
    setIdx((i) => i + 1);
    setListens(0);
    setAttempt('');
    setChecked(null);
  }

  return (
    <>
      <p className="tiny">
        Scara ascultării: asculți FĂRĂ text → reasculți (mai lent) → reconstruiești propoziția → verifici cuvânt cu cuvânt.
        Rezultatele alimentează scorul competenței „Înțelegere".
      </p>
      {source === 'static' && <p className="tiny" style={{ opacity: 0.8 }}>Astăzi folosim un set standard. Exercițiile personalizate vor reveni automat.</p>}
      {error && <div className="error-banner">{error}</div>}
      {!current && <div className="card"><p className="muted">Nu există fraze încă — deschide întâi tab-ul Pronunție ca să se genereze setul zilei.</p></div>}
      {current && (
        <div className="card">
          <p className="tiny" style={{ fontWeight: 700 }}>Propoziția {(idx % phrases.length) + 1}/{phrases.length} · ascultări: {listens}</p>
          {!checked ? (
            <>
              <div className="btn-row">
                <button className="btn-primary" onClick={listen}>
                  <Icon name="volume" />{listens === 0 ? 'Ascultă (fără text)' : `Reascultă mai lent (${listens})`}
                </button>
              </div>
              {listens > 0 && (
                <>
                  <p className="tiny">Reconstruiește exact ce ai auzit:</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Ce ai auzit…" onKeyDown={(e) => e.key === 'Enter' && verify(attempt)} />
                    <button className={recording ? 'btn-danger' : ''} onClick={mic} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
                  </div>
                  <div className="btn-row">
                    <button onClick={() => verify(attempt)} disabled={!attempt.trim()}>Verifică</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <p style={{ fontWeight: 700, color: checked.accuracyScore >= 80 ? 'var(--success)' : checked.accuracyScore >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
                {checked.accuracyScore}% din cuvinte prinse
              </p>
              <div className="word-scores">
                {checked.words.map((w, i) => (
                  <span key={i} className={w.score >= 80 ? 'ws-good' : 'ws-bad'}>{w.word}</span>
                ))}
              </div>
              {attempt.trim() && <p className="tiny" style={{ opacity: 0.85 }}>Tu ai auzit: „{attempt.trim()}"</p>}
              <p className="tiny">Textul real: „{current.text}" <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(current.text, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button></p>
              <div className="btn-row">
                <button className="btn-primary" onClick={next}>Următoarea →</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>Azi: {todayCount} propoziții de ascultare · țintă: 5. La 5+ pe mai multe zile, scorul „Înțelegere" începe să evolueze din exerciții reale.</p>
      </div>
    </>
  );
}

// ============ Pronunție (§18): 5 tipuri de exerciții + raport ============
type PronMode = 'personalized' | 'shadowing' | 'minimal_pairs' | 'word_stress' | 'rhythm';

function PronTab() {
  const [mode, setMode] = useState<PronMode>('personalized');
  const [phrases, setPhrases] = useState<PronPhrase[]>([]);
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelPlaying, setModelPlaying] = useState(false);
  const [result, setResult] = useState<PronAssessment | null>(null);
  const [weak, setWeak] = useState<string[]>([]);
  const [history, setHistory] = useState<PronunciationResult[]>([]);
  const [error, setError] = useState('');
  const [source, setSource] = useState<PhraseSource>('generated');
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getPersonalizedPhrasesDetailed().then(({ phrases: p, source: s }) => { setPhrases(p); setSource(s); }).catch(() => {});
    weakSounds().then(setWeak);
    getPronResults().then((r) => setHistory(r.filter((x) => x.date === todayStr() && x.exercise !== 'listening')));
  }, []);

  const current: { text: string; targets: string[]; extra?: string } | null = (() => {
    if (mode === 'personalized' || mode === 'shadowing') {
      const p = phrases[idx % Math.max(phrases.length, 1)];
      return p ? { text: p.text, targets: p.targets } : null;
    }
    if (mode === 'minimal_pairs') {
      const p = MINIMAL_PAIRS[idx % MINIMAL_PAIRS.length];
      return { text: p.sentence, targets: ['ee_i'], extra: `${p.a} vs ${p.b}` };
    }
    if (mode === 'word_stress') {
      const w = WORD_STRESS[idx % WORD_STRESS.length];
      return { text: w.word.split(' ')[0], targets: ['stress'], extra: `${w.stressed} — ${w.note}` };
    }
    const r = RHYTHM_SENTENCES[idx % RHYTHM_SENTENCES.length];
    return { text: r.text, targets: ['stress'] };
  })();

  async function record() {
    if (!current) return;
    setError('');
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        const blob = await recorder.current.stop();
        // assessWithAzure face singur fallback pe STT-diff; sursa reală rămâne în assessment.source
        const wav = await blobToWav16k(blob);
        const assessment: PronAssessment = await assessWithAzure(wav, current.text);
        setResult(assessment);
        const rec: PronunciationResult = {
          id: newId(),
          date: todayStr(),
          exercise: mode === 'personalized' ? 'personalized' : mode === 'shadowing' ? 'shadowing' : mode === 'minimal_pairs' ? 'minimal_pairs' : mode === 'word_stress' ? 'word_stress' : 'rhythm',
          phrase: current.text,
          targets: current.targets,
          score: assessment.accuracyScore,
          fluencyScore: assessment.fluencyScore,
          prosodyScore: assessment.prosodyScore,
          wordScores: assessment.words,
          source: assessment.source,
        };
        await savePronResult(rec);
        await bumpActivity(mode === 'shadowing' ? 'shadowPhrases' : 'pronPhrases', 1);
        await addXp(assessment.accuracyScore >= 80 ? 8 : 4);
        setHistory((h) => [...h, rec]);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setBusy(false);
      return;
    }
    try {
      setResult(null);
      // Shadowing = redă modelul ÎNTÂI, apoi înregistrează repetarea. Redarea simultană cu microfonul
      // deschis polua înregistrarea cu vocea TTS (un singur microfon pe telefon), iar scorul ieșea mereu 0.
      if (mode === 'shadowing') {
        setModelPlaying(true);
        try { await speak(current.text, 1); } finally { setModelPlaying(false); }
      }
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  const MODES: { id: PronMode; label: string; icon: IconName }[] = [
    { id: 'personalized', label: 'Personalizat', icon: 'target' },
    { id: 'shadowing', label: 'Shadowing', icon: 'headphones' },
    { id: 'minimal_pairs', label: 'Minimal pairs', icon: 'ear' },
    { id: 'word_stress', label: 'Accent', icon: 'type' },
    { id: 'rhythm', label: 'Ritm', icon: 'music' },
  ];

  const rhythmSentence = mode === 'rhythm' ? RHYTHM_SENTENCES[idx % RHYTHM_SENTENCES.length] : null;

  return (
    <>
      <div className="tabs">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'active' : ''} onClick={() => { setMode(m.id); setIdx(0); setResult(null); }}>
            <Icon name={m.icon} size={16} />{m.label}
          </button>
        ))}
      </div>
      <p className="tiny">Sunete de exersat azi: {weak.map((s) => SOUND_LABELS[s] ?? s).join(', ') || 'niciunul'}</p>
      {source === 'static' && (mode === 'personalized' || mode === 'shadowing') && (
        <p className="tiny" style={{ opacity: 0.8 }}>Astăzi folosim un set standard. Exercițiile personalizate vor reveni automat.</p>
      )}
      {error && <div className="error-banner">{error}</div>}
      {current && (
        <div className="card">
          {current.extra && <p className="tiny" style={{ fontWeight: 700 }}>{current.extra}</p>}
          {rhythmSentence ? (
            <p style={{ fontSize: '1.15rem' }}>
              {rhythmSentence.text.split(' ').map((w, i) => (
                <span key={i} className={rhythmSentence.stressedWords.some((s) => w.toLowerCase().includes(s.toLowerCase())) ? 'stress' : ''}>
                  {w}{' '}
                </span>
              ))}
            </p>
          ) : (
            <p style={{ fontSize: '1.15rem' }}>{current.text}</p>
          )}
          <div className="btn-row">
            <button onClick={() => speak(current.text, mode === 'shadowing' ? 1 : 0.95)}><Icon name="volume" />Ascultă</button>
            <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={record} disabled={busy || modelPlaying}>
              {busy || modelPlaying ? <Icon name="loader" className="icon-spin" /> : <Icon name={recording ? 'stop' : mode === 'shadowing' ? 'headphones' : 'mic'} />}
              {recording ? 'Oprește' : modelPlaying ? 'Ascultă modelul…' : busy ? 'Se evaluează…' : mode === 'shadowing' ? 'Shadowing (redă + repetă)' : 'Rostește'}
            </button>
            <button className="btn-ghost" onClick={() => { setIdx(idx + 1); setResult(null); }}>Următoarea →</button>
          </div>
          {mode === 'shadowing' && !result && (
            <p className="tiny" style={{ opacity: 0.8 }}>{recording ? 'Repetă acum ce ai auzit, apoi apasă „Oprește".' : 'Apasă: mai întâi auzi modelul, apoi înregistrezi repetarea ta.'}</p>
          )}
          {result && (
            <>
              <div className="stat-grid" style={{ marginTop: 8 }}>
                <div className="stat-tile"><div className="value">{result.accuracyScore}</div><div className="label">claritate</div></div>
                <div className="stat-tile"><div className="value">{result.fluencyScore}</div><div className="label">fluență</div></div>
                {result.prosodyScore != null && <div className="stat-tile"><div className="value">{result.prosodyScore}</div><div className="label">prozodie</div></div>}
              </div>
              <div className="word-scores">
                {result.words.map((w, i) => (
                  <span key={i} className={w.score >= 80 ? 'ws-good' : w.score >= 60 ? 'ws-mid' : 'ws-bad'}>{w.word}</span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <h2>Raport de azi</h2>
      <div className="card">
        {history.length === 0 ? (
          <p className="muted">Niciun exercițiu azi. Țintă: 5-10 fraze.</p>
        ) : (
          <>
            <p className="muted">
              {history.length} fraze · medie {Math.round(history.reduce((a, r) => a + r.score, 0) / history.length)}%
            </p>
            <p className="tiny">
              Cuvinte problematice: {history.flatMap((r) => r.wordScores.filter((w) => w.score < 60).map((w) => w.word)).slice(0, 10).join(', ') || 'niciunul'}
            </p>
            <p className="tiny">Sunetele sub 70% intră automat în rotația de mâine.</p>
          </>
        )}
      </div>
    </>
  );
}
