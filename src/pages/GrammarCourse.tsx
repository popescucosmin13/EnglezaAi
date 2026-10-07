// Cursul de gramatică (tab-ul „Curs" din Practică) — trei părți:
//   Lecții    → manualul static, cu explicații, exemple și exerciții verificate local
//   Conjugări → formele oricărui verb, la toate timpurile, plus dicționarul de neregulate
//   Tabele    → referința rapidă, pentru momentul „am nevoie ACUM de forma corectă"
//
// Totul funcționează offline și fără AI. Progresul se ține local și se sincronizează cu Firestore.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Markdown from '../components/Markdown';
import { TappableText } from '../components/TappableText';
import { Icon, type IconName } from '../components/Icon';
import { SpeakButton } from '../components/grammar/SpeakButton';
import ExerciseRunner from '../components/grammar/ExerciseRunner';
import Conjugator from '../components/grammar/Conjugator';
import ReferenceTables from '../components/grammar/ReferenceTables';
import { addXp, updateActivity } from '../db/db';
import { dominantCategory } from '../logic/engine';
import { CATEGORY_LABELS_RO, type MistakeCategory } from '../types';
import { GRAMMAR_MODULES, GRAMMAR_COURSE, TOTAL_EXERCISES, type GrammarLesson } from '../grammar';
import { searchVerbs } from '../grammar/verbs';
import {
  getGrammarProgress,
  getDrillMemory,
  markLessonRead,
  saveLessonScore,
  recordDrillAnswer,
  drillKey,
  dueCount,
  type DrillMemory,
  type GrammarProgress,
} from '../grammar/progress';
import { syncGrammarState } from '../grammar/sync';
import { buildDrill, recommendedLesson, DRILL_SIZE, type DrillItem } from '../grammar/drill';

type View = 'lessons' | 'verbs' | 'tables';

const MODULE_ICONS: Record<string, IconName> = {
  basics: 'book',
  tenses: 'clock',
  details: 'target',
  traps: 'triangleAlert',
  next: 'rocket',
};

/** Exercițiile unei lecții, în forma folosită și de antrenamentul mixt. */
function lessonItems(lesson: GrammarLesson): DrillItem[] {
  return lesson.exercises.map((exercise, index) => ({
    lessonId: lesson.id,
    lessonTitleRo: lesson.titleRo,
    index,
    exercise,
  }));
}

function masteredCount(lesson: GrammarLesson, progress: GrammarProgress): number {
  return Math.min(progress[lesson.id]?.best ?? 0, lesson.exercises.length);
}

export default function GrammarCourse() {
  const [view, setView] = useState<View>('lessons');
  const [progress, setProgress] = useState<GrammarProgress>(() => getGrammarProgress());
  const [memory, setMemory] = useState<DrillMemory>(() => getDrillMemory());
  const [openId, setOpenId] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillItem[] | null>(null);
  const [weakCategory, setWeakCategory] = useState<MistakeCategory | undefined>();
  const [query, setQuery] = useState('');

  const lesson = openId ? GRAMMAR_COURSE.find((l) => l.id === openId) ?? null : null;

  // categoria în care greșești cel mai des în conversații — schimbă lecția recomandată
  useEffect(() => {
    dominantCategory().then((c) => setWeakCategory(c ?? undefined)).catch(() => {});
  }, []);

  // progresul din Firestore (alt telefon, alt browser) se îmbină cu cel local la deschiderea cursului
  useEffect(() => {
    let alive = true;
    syncGrammarState()
      .then((state) => {
        if (!alive) return;
        setProgress(state.progress);
        setMemory(state.drill);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // la deschiderea unei lecții, a antrenamentului sau la schimbarea secțiunii pornim de sus
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [openId, drill, view]);

  function onAnswered(item: DrillItem, ok: boolean) {
    setMemory(recordDrillAnswer(drillKey(item.lessonId, item.index), ok));
  }

  if (drill) {
    return (
      <ExerciseRunner
        title="Antrenament mixt"
        items={drill}
        showSource
        onAnswered={onAnswered}
        onExit={() => setDrill(null)}
        onFinish={async (correct) => {
          await addXp(Math.min(20, 3 + correct * 2)).catch(() => {});
        }}
      />
    );
  }

  if (lesson) {
    return (
      <LessonView
        lesson={lesson}
        progress={progress}
        onBack={() => setOpenId(null)}
        onProgress={setProgress}
        onAnswered={onAnswered}
        onOpenLesson={setOpenId}
      />
    );
  }

  const viewSwitch = (
    <div className="tabs">
      <button className={view === 'lessons' ? 'active' : ''} onClick={() => setView('lessons')}>Lecții</button>
      <button className={view === 'verbs' ? 'active' : ''} onClick={() => setView('verbs')}>Conjugări</button>
      <button className={view === 'tables' ? 'active' : ''} onClick={() => setView('tables')}>Tabele</button>
    </div>
  );

  if (view === 'verbs') return <>{viewSwitch}<Conjugator /></>;
  if (view === 'tables') return <>{viewSwitch}<ReferenceTables /></>;

  const q = query.trim().toLowerCase();
  const matches = (l: GrammarLesson) =>
    !q ||
    l.titleRo.toLowerCase().includes(q) ||
    l.goalRo.toLowerCase().includes(q) ||
    l.shortRo.toLowerCase().includes(q) ||
    l.bodyRo.toLowerCase().includes(q);

  const doneExercises = GRAMMAR_COURSE.reduce((n, l) => n + masteredCount(l, progress), 0);
  const readLessons = GRAMMAR_COURSE.filter((l) => progress[l.id]?.read).length;
  const due = dueCount(memory);
  const recommendedId = recommendedLesson(progress, weakCategory);
  const recommended = recommendedId ? GRAMMAR_COURSE.find((l) => l.id === recommendedId) : undefined;
  const verbHit = q ? searchVerbs(q, 1)[0] : undefined;

  return (
    <>
      {viewSwitch}

      <p className="tiny">
        Manualul tău de gramatică: {GRAMMAR_COURSE.length} lecții scrise în română, cu {TOTAL_EXERCISES} exerciții
        care se verifică pe loc. Merge fără internet și fără AI — e locul unde revii când nu ești sigur pe o regulă.
      </p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <strong>Progresul tău</strong>
          <span className="tiny">{readLessons}/{GRAMMAR_COURSE.length} lecții citite</span>
        </div>
        <div className="bar" style={{ margin: '8px 0 4px' }}>
          <div style={{ width: `${Math.round((doneExercises / TOTAL_EXERCISES) * 100)}%` }} />
        </div>
        <p className="tiny" style={{ margin: 0 }}>{doneExercises} din {TOTAL_EXERCISES} exerciții rezolvate corect</p>
      </div>

      {recommended && (
        <div className="card" style={{ borderColor: 'var(--primary)' }}>
          <p className="tiny" style={{ marginTop: 0, fontWeight: 700, color: 'var(--primary-deep)' }}>
            <Icon name="compass" size={15} />
            {weakCategory && recommended.category === weakCategory ? 'Recomandat din greșelile tale reale' : 'Începe de aici'}
          </p>
          <strong>{recommended.titleRo}</strong>
          <p className="tiny">{recommended.shortRo}</p>
          <div className="btn-row" style={{ marginBottom: 0 }}>
            <button className="btn-primary" onClick={() => setOpenId(recommended.id)}>
              Deschide lecția <Icon name="arrowUpRight" size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <strong><Icon name="zap" size={16} />Antrenament mixt</strong>
        <p className="tiny">
          {due > 0
            ? `${due} exerciții sunt programate pentru azi — cele pe care le-ai greșit revin primele.`
            : 'Un set scurt din tot cursul: ce ai greșit revine des, ce știi revine rar.'}
        </p>
        <div className="btn-row" style={{ marginBottom: 0 }}>
          <button
            className={due > 0 ? 'btn-primary' : ''}
            onClick={() => setDrill(buildDrill(memory, progress))}
          >
            <Icon name="zap" size={15} />Antrenează {DRILL_SIZE} exerciții
          </button>
        </div>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Caută o regulă (ex. articole, plural, prepoziții)…"
        aria-label="Caută în curs"
      />

      {verbHit && (
        <p className="tiny">
          <button className="btn-ghost" style={{ padding: '2px 4px' }} onClick={() => setView('verbs')}>
            <Icon name="arrowUpRight" size={14} />„{verbHit.base}" e un verb — vezi conjugarea completă
          </button>
        </p>
      )}

      {GRAMMAR_MODULES.map((m) => {
        const all = GRAMMAR_COURSE.filter((l) => l.moduleId === m.id);
        const lessons = all.filter(matches);
        if (lessons.length === 0) return null;
        const modDone = all.reduce((n, l) => n + masteredCount(l, progress), 0);
        const modTotal = all.reduce((n, l) => n + l.exercises.length, 0);
        return (
          <div key={m.id}>
            <h2><Icon name={MODULE_ICONS[m.id] ?? 'book'} size={16} />{m.titleRo}</h2>
            <p className="tiny" style={{ marginTop: -6 }}>{m.descRo}</p>
            <div className="bar" style={{ margin: '0 0 10px' }}>
              <div style={{ width: `${Math.round((modDone / modTotal) * 100)}%` }} />
            </div>
            {lessons.map((l) => {
              const best = masteredCount(l, progress);
              const complete = best === l.exercises.length;
              const p = progress[l.id];
              return (
                <div key={l.id} className="card clickable" onClick={() => setOpenId(l.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>
                        {complete && <Icon name="checkCircle" size={15} style={{ color: 'var(--success)' }} />}
                        {l.titleRo}
                      </strong>
                      <div className="tiny">{l.shortRo}</div>
                    </div>
                    <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
                      <span className="badge soft">{l.level}</span>
                      <div className="tiny" style={{ marginTop: 4, color: complete ? 'var(--success)' : undefined }}>
                        {p?.attempts ? `${best}/${l.exercises.length}` : `${l.exercises.length} exerciții`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {q && GRAMMAR_COURSE.every((l) => !matches(l)) && (
        <div className="card">
          <p className="muted">Nicio lecție pentru „{query}".</p>
          <div className="btn-row" style={{ marginBottom: 0 }}>
            <button onClick={() => setView('tables')}><Icon name="search" size={15} />Caută în tabele</button>
            <button onClick={() => setView('verbs')}><Icon name="search" size={15} />Caută în verbe</button>
          </div>
        </div>
      )}
    </>
  );
}

// ============ O lecție: pe scurt + explicație + exemple + exerciții ============
function LessonView({
  lesson,
  progress,
  onBack,
  onProgress,
  onAnswered,
  onOpenLesson,
}: {
  lesson: GrammarLesson;
  progress: GrammarProgress;
  onBack: () => void;
  onProgress: (p: GrammarProgress) => void;
  onAnswered: (item: DrillItem, ok: boolean) => void;
  onOpenLesson: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [practising, setPractising] = useState(false);
  const [showTheory, setShowTheory] = useState(false);

  useEffect(() => {
    onProgress(markLessonRead(lesson.id));
    setShowTheory(false);
    setPractising(false);
    // marcăm o singură dată, la deschiderea lecției
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const index = GRAMMAR_COURSE.findIndex((l) => l.id === lesson.id);
  const next = GRAMMAR_COURSE[index + 1];
  const best = masteredCount(lesson, progress);

  if (practising) {
    return (
      <ExerciseRunner
        title={lesson.titleRo}
        items={lessonItems(lesson)}
        onAnswered={onAnswered}
        onExit={() => setPractising(false)}
        onFinish={async (correct, total, isRetry) => {
          if (isRetry) return;
          onProgress(saveLessonScore(lesson.id, correct, total));
          await Promise.all([
            updateActivity({ lessonDone: true }).catch(() => {}),
            addXp(correct >= Math.ceil(total * 0.8) ? 20 : 10).catch(() => {}),
          ]);
        }}
        onNext={next ? () => { setPractising(false); onOpenLesson(next.id); } : undefined}
        nextLabel={next ? `Lecția următoare: ${next.titleRo}` : undefined}
      />
    );
  }

  const requires = (lesson.requires ?? [])
    .map((id) => GRAMMAR_COURSE.find((l) => l.id === id))
    .filter((l): l is GrammarLesson => Boolean(l));

  return (
    <>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button className="btn-ghost" onClick={onBack}><Icon name="undo" size={15} />Toate lecțiile</button>
      </div>

      <h2 style={{ marginTop: 0 }}>{lesson.titleRo}</h2>
      <p className="tiny">
        <span className="badge soft">{lesson.level}</span> {lesson.goalRo}
        {best > 0 && <> · <span style={{ color: best === lesson.exercises.length ? 'var(--success)' : undefined }}>{best}/{lesson.exercises.length} exerciții</span></>}
      </p>

      {/* Regula în două rânduri — pentru cine vrea doar răspunsul, nu teoria */}
      <div className="card" style={{ background: 'var(--primary-soft)', borderColor: 'var(--primary)' }}>
        <p className="tiny" style={{ marginTop: 0, fontWeight: 700, color: 'var(--primary-deep)' }}>
          <Icon name="zap" size={14} />PE SCURT
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>{lesson.shortRo}</p>
      </div>

      {lesson.mnemonicRo && (
        <div className="card" style={{ background: 'var(--tip-bg)' }}>
          <p className="tiny" style={{ marginTop: 0, fontWeight: 700 }}><Icon name="lightbulb" size={14} />TRUCUL DE ȚINUT MINTE</p>
          <p style={{ margin: 0 }}>{lesson.mnemonicRo}</p>
        </div>
      )}

      {requires.length > 0 && (
        <p className="tiny">
          Se sprijină pe:{' '}
          {requires.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ' · '}
              <button className="btn-ghost" style={{ padding: '0 2px', minHeight: 0 }} onClick={() => onOpenLesson(r.id)}>{r.titleRo}</button>
            </span>
          ))}
        </p>
      )}

      <div className="btn-row">
        <button className="btn-primary" onClick={() => setPractising(true)}>
          <Icon name="puzzle" size={16} />Exersează ({lesson.exercises.length} exerciții)
        </button>
        <button onClick={() => setShowTheory((s) => !s)}>
          <Icon name={showTheory ? 'chevronUp' : 'chevronDown'} size={15} />
          {showTheory ? 'Ascunde explicația' : 'Explicația completă'}
        </button>
      </div>

      {showTheory && (
        <div className="card">
          <Markdown text={lesson.bodyRo} />
        </div>
      )}

      {lesson.examples.length > 0 && (
        <>
          <h3><Icon name="lightbulb" size={15} />Exemple</h3>
          <div className="card">
            {lesson.examples.map((ex, i) => (
              <div key={i} style={{ padding: '9px 0', borderBottom: i < lesson.examples.length - 1 ? '1px solid var(--border)' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="checkCircle" size={15} style={{ color: 'var(--success)', flex: '0 0 auto' }} />
                  <TappableText text={ex.en} style={{ fontWeight: 600 }} />
                  <SpeakButton text={ex.en} />
                </div>
                <div className="tiny" style={{ marginLeft: 21 }}>{ex.ro}</div>
                {ex.bad && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Icon name="xCircle" size={15} style={{ color: 'var(--danger)', flex: '0 0 auto' }} />
                    <span style={{ color: 'var(--danger)', textDecoration: 'line-through', fontSize: '0.9rem' }}>{ex.bad}</span>
                  </div>
                )}
                {ex.noteRo && <div className="tiny" style={{ marginLeft: 21, opacity: 0.85 }}>{ex.noteRo}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="btn-row">
        <button className="btn-ghost" onClick={() => navigate(`/practice?tab=mistakes&category=${lesson.category}`)}>
          <Icon name="target" size={15} />Greșelile tale la „{CATEGORY_LABELS_RO[lesson.category]}" →
        </button>
      </div>
      {next && (
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn-ghost" onClick={() => onOpenLesson(next.id)}>
            Lecția următoare: {next.titleRo} <Icon name="arrowUpRight" size={15} />
          </button>
        </div>
      )}
    </>
  );
}
