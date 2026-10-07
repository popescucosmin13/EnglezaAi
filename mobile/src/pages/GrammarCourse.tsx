import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Markdown from '../components/Markdown';
import { speak } from '../audio/tts';
import { addXp, updateActivity } from '../db/db';
import { dominantCategory } from '../logic/engine';
import { CATEGORY_LABELS_RO, type MistakeCategory } from '../types';
import { GRAMMAR_MODULES, GRAMMAR_COURSE, TOTAL_EXERCISES, type GrammarLesson } from '../grammar';
import { allTables, tableMatches } from '../grammar/reference';
import { nonFiniteForms, PERSONS, searchVerbs, TENSES, verbForms, type ConjugationMode } from '../grammar/verbs';
import { checkAnswer, filledText, orderWords, type GrammarExercise } from '../grammar/types';
import { getGrammarProgress, getDrillMemory, markLessonRead, saveLessonScore, recordDrillAnswer, drillKey, dueCount, type DrillMemory, type GrammarProgress } from '../grammar/progress';
import { syncGrammarState } from '../grammar/sync';
import { buildDrill, recommendedLesson, DRILL_SIZE, type DrillItem } from '../grammar/drill';
import { Banner, Bar, Button, ButtonRow, Card, Chip, ChipRow, Field, H1, H2, H3, Muted, Pill, Screen, StatGrid, StatTile, TabsBar, Tiny } from '../ui';
import { usePalette } from '../theme';

type CourseView = 'lessons' | 'verbs' | 'tables';
function lessonItems(lesson: GrammarLesson): DrillItem[] { return lesson.exercises.map((exercise, index) => ({ lessonId: lesson.id, lessonTitleRo: lesson.titleRo, index, exercise })); }
function masteredCount(lesson: GrammarLesson, progress: GrammarProgress): number { return Math.min(progress[lesson.id]?.best ?? 0, lesson.exercises.length); }

export default function GrammarCourse() {
  const p = usePalette();
  const [view, setView] = useState<CourseView>('lessons');
  const [progress, setProgress] = useState<GrammarProgress>(() => getGrammarProgress());
  const [memory, setMemory] = useState<DrillMemory>(() => getDrillMemory());
  const [openId, setOpenId] = useState<string | null>(null);
  const [drill, setDrill] = useState<DrillItem[] | null>(null);
  const [weakCategory, setWeakCategory] = useState<MistakeCategory | undefined>();
  const [query, setQuery] = useState('');
  const lesson = openId ? GRAMMAR_COURSE.find((item) => item.id === openId) ?? null : null;

  useEffect(() => { dominantCategory().then((category) => setWeakCategory(category ?? undefined)).catch(() => {}); }, []);
  useEffect(() => { let alive = true; syncGrammarState().then((state) => { if (alive) { setProgress(state.progress); setMemory(state.drill); } }).catch(() => {}); return () => { alive = false; }; }, []);
  function onAnswered(item: DrillItem, ok: boolean) { setMemory(recordDrillAnswer(drillKey(item.lessonId, item.index), ok)); }

  if (drill) return <ExerciseRunner title="Antrenament mixt" items={drill} showSource onAnswered={onAnswered} onExit={() => setDrill(null)} onFinish={async (correct) => { await addXp(Math.min(20, 3 + correct * 2)).catch(() => {}); }} />;
  if (lesson) return <LessonView lesson={lesson} progress={progress} onBack={() => setOpenId(null)} onProgress={setProgress} onAnswered={onAnswered} onOpenLesson={setOpenId} />;

  const q = query.trim().toLowerCase();
  const tabs = <TabsBar tabs={[{ key: 'lessons', label: 'Lecții' }, { key: 'verbs', label: 'Conjugări' }, { key: 'tables', label: 'Tabele' }]} active={view} onChange={(key) => setView(key as CourseView)} />;
  if (view === 'verbs') return <Screen>{tabs}<Conjugator /></Screen>;
  if (view === 'tables') return <Screen>{tabs}<ReferenceTables /></Screen>;

  const matches = (item: GrammarLesson) => !q || [item.titleRo, item.goalRo, item.shortRo, item.bodyRo].some((text) => text.toLowerCase().includes(q));
  const doneExercises = GRAMMAR_COURSE.reduce((count, item) => count + masteredCount(item, progress), 0);
  const readLessons = GRAMMAR_COURSE.filter((item) => progress[item.id]?.read).length;
  const due = dueCount(memory);
  const recommended = GRAMMAR_COURSE.find((item) => item.id === recommendedLesson(progress, weakCategory));
  const verbHit = q ? searchVerbs(q, 1)[0] : undefined;

  return (
    <Screen>
      {tabs}
      <Muted>Manualul tău de gramatică: {GRAMMAR_COURSE.length} lecții în română și {TOTAL_EXERCISES} exerciții verificate local. Funcționează și fără internet.</Muted>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: p.ink, fontWeight: '800' }}>Progresul tău</Text><Tiny>{readLessons}/{GRAMMAR_COURSE.length} lecții citite</Tiny></View>
        <Bar ratio={TOTAL_EXERCISES ? doneExercises / TOTAL_EXERCISES : 0} style={{ marginVertical: 10 }} />
        <Tiny>{doneExercises} din {TOTAL_EXERCISES} exerciții rezolvate corect</Tiny>
      </Card>
      {recommended ? <Card style={{ borderColor: p.primary }}><Tiny>{weakCategory && recommended.category === weakCategory ? 'RECOMANDAT DIN GREȘELILE TALE' : 'ÎNCEPE DE AICI'}</Tiny><H3>{recommended.titleRo}</H3><Muted>{recommended.shortRo}</Muted><Button title="Deschide lecția" variant="primary" onPress={() => setOpenId(recommended.id)} style={{ marginTop: 10 }} /></Card> : null}
      <Card><H3>Antrenament mixt</H3><Muted>{due > 0 ? `${due} exerciții sunt programate pentru azi — cele greșite revin primele.` : 'Un set scurt din tot cursul: ce greșești revine des, ce știi revine rar.'}</Muted><Button title={`Antrenează ${DRILL_SIZE} exerciții`} icon="zap" variant={due > 0 ? 'primary' : 'default'} onPress={() => setDrill(buildDrill(memory, progress))} style={{ marginTop: 10 }} /></Card>
      <Field value={query} onChange={setQuery} placeholder="Caută o regulă: articole, plural, prepoziții…" />
      {verbHit ? <Button title={`„${verbHit.base}” — vezi conjugarea completă`} variant="ghost" onPress={() => setView('verbs')} /> : null}
      {GRAMMAR_MODULES.map((module) => {
        const all = GRAMMAR_COURSE.filter((item) => item.moduleId === module.id);
        const lessons = all.filter(matches);
        if (!lessons.length) return null;
        const modDone = all.reduce((count, item) => count + masteredCount(item, progress), 0);
        const modTotal = all.reduce((count, item) => count + item.exercises.length, 0);
        return <View key={module.id}><H2>{module.titleRo}</H2><Tiny>{module.descRo}</Tiny><Bar ratio={modTotal ? modDone / modTotal : 0} style={{ marginVertical: 10 }} />{lessons.map((item) => {
          const best = masteredCount(item, progress); const complete = best === item.exercises.length; const saved = progress[item.id];
          return <Card key={item.id} onPress={() => setOpenId(item.id)} style={{ marginVertical: 6 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ flex: 1 }}><Text style={{ color: complete ? p.success : p.ink, fontWeight: '800', fontSize: 16 }}>{complete ? '✓ ' : ''}{item.titleRo}</Text><Tiny>{item.shortRo}</Tiny></View><View style={{ alignItems: 'flex-end' }}><Pill kind="badgeSoft">{item.level}</Pill><Tiny>{saved?.attempts ? `${best}/${item.exercises.length}` : `${item.exercises.length} exerciții`}</Tiny></View></View></Card>;
        })}</View>;
      })}
      {q && GRAMMAR_COURSE.every((item) => !matches(item)) ? <Banner kind="info">Nicio lecție pentru „{query}”. Încearcă secțiunile Conjugări sau Tabele.</Banner> : null}
    </Screen>
  );
}

function LessonView({ lesson, progress, onBack, onProgress, onAnswered, onOpenLesson }: { lesson: GrammarLesson; progress: GrammarProgress; onBack: () => void; onProgress: (progress: GrammarProgress) => void; onAnswered: (item: DrillItem, ok: boolean) => void; onOpenLesson: (id: string) => void }) {
  const p = usePalette();
  const [practising, setPractising] = useState(false);
  const [showTheory, setShowTheory] = useState(false);
  useEffect(() => { onProgress(markLessonRead(lesson.id)); setShowTheory(false); setPractising(false); }, [lesson.id]);
  const index = GRAMMAR_COURSE.findIndex((item) => item.id === lesson.id);
  const next = GRAMMAR_COURSE[index + 1];
  const best = masteredCount(lesson, progress);
  if (practising) return <ExerciseRunner title={lesson.titleRo} items={lessonItems(lesson)} onAnswered={onAnswered} onExit={() => setPractising(false)} onFinish={async (correct, total, isRetry) => { if (!isRetry) { onProgress(saveLessonScore(lesson.id, correct, total)); await Promise.all([updateActivity({ lessonDone: true }).catch(() => {}), addXp(correct >= Math.ceil(total * 0.8) ? 20 : 10).catch(() => {})]); } }} onNext={next ? () => { setPractising(false); onOpenLesson(next.id); } : undefined} nextLabel={next ? `Lecția următoare: ${next.titleRo}` : undefined} />;
  return <Screen>
    <Button title="Toate lecțiile" icon="undo" variant="ghost" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
    <H1>{lesson.titleRo}</H1><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pill kind="badgeSoft">{lesson.level}</Pill><Tiny>{lesson.goalRo}{best > 0 ? ` · ${best}/${lesson.exercises.length}` : ''}</Tiny></View>
    <Card style={{ backgroundColor: p.primarySoft, borderColor: p.primary }}><Tiny>PE SCURT</Tiny><Text style={{ color: p.ink, fontWeight: '700', fontSize: 16, lineHeight: 23, marginTop: 7 }}>{lesson.shortRo}</Text></Card>
    {lesson.mnemonicRo ? <Card style={{ backgroundColor: p.tipBg }}><Tiny>TRUCUL DE ȚINUT MINTE</Tiny><Text style={{ color: p.ink, lineHeight: 22, marginTop: 7 }}>{lesson.mnemonicRo}</Text></Card> : null}
    <ButtonRow><Button title={`Exersează (${lesson.exercises.length})`} icon="puzzle" variant="primary" onPress={() => setPractising(true)} /><Button title={showTheory ? 'Ascunde explicația' : 'Explicația completă'} icon={showTheory ? 'chevronUp' : 'chevronDown'} onPress={() => setShowTheory((value) => !value)} /></ButtonRow>
    {showTheory ? <Card><Markdown text={lesson.bodyRo} /></Card> : null}
    {lesson.examples.length ? <><H2>Exemple</H2><Card>{lesson.examples.map((example, i) => <View key={`${example.en}-${i}`} style={{ paddingVertical: 10, borderBottomWidth: i < lesson.examples.length - 1 ? 1 : 0, borderColor: p.border }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ color: p.success, fontWeight: '900' }}>✓</Text><Text style={{ color: p.ink, flex: 1, fontWeight: '700' }}>{example.en}</Text><Button title="Ascultă" icon="volume" small variant="ghost" onPress={() => void speak(example.en, 0.92)} /></View><Tiny>{example.ro}</Tiny>{example.bad ? <Text style={{ color: p.danger, textDecorationLine: 'line-through', marginTop: 4 }}>✕ {example.bad}</Text> : null}{example.noteRo ? <Tiny>{example.noteRo}</Tiny> : null}</View>)}</Card></> : null}
    <Button title={`Greșelile tale: ${CATEGORY_LABELS_RO[lesson.category]}`} variant="ghost" onPress={onBack} />
    {next ? <Button title={`Lecția următoare: ${next.titleRo}`} variant="ghost" onPress={() => onOpenLesson(next.id)} /> : null}
  </Screen>;
}

function ExerciseRunner({ title, items, showSource, onAnswered, onExit, onFinish, onNext, nextLabel }: { title: string; items: DrillItem[]; showSource?: boolean; onAnswered: (item: DrillItem, ok: boolean) => void; onExit: () => void; onFinish: (correct: number, total: number, isRetry: boolean) => Promise<void>; onNext?: () => void; nextLabel?: string }) {
  const p = usePalette();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; isRetry: boolean } | null>(null);
  const [correct, setCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [retry, setRetry] = useState<DrillItem[]>([]);
  const [isRetryRound, setIsRetryRound] = useState(false);
  const activeItems = isRetryRound ? retry : items;
  const item = activeItems[index];

  function verify(value = answer) {
    if (!item || !value.trim()) return;
    const ok = checkAnswer(item.exercise, value);
    setAnswer(value); setFeedback({ ok, isRetry: isRetryRound }); onAnswered(item, ok);
    if (ok) setCorrect((count) => count + 1); else if (!isRetryRound) setRetry((all) => [...all, item]);
  }
  async function advance() {
    if (index + 1 < activeItems.length) { setIndex((value) => value + 1); setAnswer(''); setFeedback(null); return; }
    if (!isRetryRound && retry.length) { await onFinish(correct, items.length, false); setIsRetryRound(true); setIndex(0); setAnswer(''); setFeedback(null); return; }
    if (!isRetryRound) await onFinish(correct, items.length, false); else await onFinish(correct, items.length, true);
    setFinished(true);
  }
  if (!items.length) return <Screen><Banner kind="info">Nu există exerciții disponibile.</Banner><Button title="Înapoi" onPress={onExit} /></Screen>;
  if (finished) return <Screen><Card style={{ alignItems: 'center', paddingVertical: 30 }}><Text style={{ fontSize: 50 }}>🎯</Text><H1>Set terminat</H1><StatGrid><StatTile value={correct} label="răspunsuri corecte" /><StatTile value={items.length} label="exerciții inițiale" /></StatGrid><ButtonRow>{onNext && nextLabel ? <Button title={nextLabel} variant="primary" onPress={onNext} /> : null}<Button title="Înapoi la curs" onPress={onExit} /></ButtonRow></Card></Screen>;
  const exercise = item.exercise;
  const words = exercise.kind === 'order' ? orderWords(exercise) : [];
  return <Screen>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Button title="Ieși" icon="x" variant="ghost" onPress={onExit} /><Pill kind="level">{index + 1}/{activeItems.length}</Pill></View>
    <H1>{title}</H1>{showSource ? <Tiny>{item.lessonTitleRo}</Tiny> : null}<Bar ratio={(index + (feedback ? 1 : 0)) / activeItems.length} style={{ marginVertical: 12 }} />
    <Card style={{ borderColor: feedback ? (feedback.ok ? p.success : p.danger) : p.border }}><Pill kind="badgeSoft">{exercise.kind === 'choice' ? 'Alege' : exercise.kind === 'fill' ? 'Completează' : exercise.kind === 'fix' ? 'Corectează' : exercise.kind === 'order' ? 'Construiește' : 'Tradu'}</Pill><H2>{exercise.text}</H2>
      {!feedback ? <>{exercise.kind === 'choice' && exercise.options ? <View style={{ gap: 8 }}>{exercise.options.map((option) => <Button key={option} title={option} onPress={() => verify(option)} style={{ justifyContent: 'flex-start' }} />)}</View> : exercise.kind === 'order' ? <><ChipRow>{words.map((word, i) => <Chip key={`${word}-${i}`} label={word} onPress={() => setAnswer(`${answer} ${word}`.trim())} />)}</ChipRow><Field value={answer} onChange={setAnswer} editable={false} placeholder="Atinge cuvintele în ordine" /><ButtonRow><Button title="Șterge" variant="ghost" onPress={() => setAnswer('')} /><Button title="Verifică" variant="primary" onPress={() => verify()} disabled={!answer} /></ButtonRow></> : <><Field value={answer} onChange={setAnswer} placeholder="Răspunsul tău…" /><Button title="Verifică" variant="primary" onPress={() => verify()} disabled={!answer.trim()} /></>}</> : <><Banner kind={feedback.ok ? 'success' : 'warn'}>{feedback.ok ? 'Corect!' : `Varianta corectă: ${filledText(exercise)}`}</Banner><Muted>{exercise.explainRo}</Muted><Button title={index + 1 >= activeItems.length ? (retry.length && !isRetryRound ? 'Reia ce ai greșit' : 'Vezi rezultatul') : 'Următorul'} variant="primary" onPress={advance} style={{ marginTop: 12 }} /></>}
    </Card>
  </Screen>;
}

function Conjugator() {
  const p = usePalette();
  const [input, setInput] = useState('work');
  const [mode, setMode] = useState<ConjugationMode>('affirmative');
  const forms = useMemo(() => verbForms(input || 'work'), [input]);
  const suggestions = input.trim().length > 1 ? searchVerbs(input, 6) : [];
  return <View><H1>Conjugări</H1><Muted>Scrie orice verb. Formele și timpurile sunt calculate local, inclusiv verbele neregulate.</Muted><Field value={input} onChange={setInput} placeholder="Ex: go, work, be…" />{suggestions.length ? <ChipRow>{suggestions.map((item) => <Chip key={item.base} label={`${item.base} — ${item.ro}`} onPress={() => setInput(item.base)} />)}</ChipRow> : null}<TabsBar tabs={[{ key: 'affirmative', label: 'Afirmativ' }, { key: 'negative', label: 'Negativ' }, { key: 'question', label: 'Întrebare' }]} active={mode} onChange={(key) => setMode(key as ConjugationMode)} /><Card><H3>{forms.base}{forms.ro ? ` — ${forms.ro}` : ''}</H3><View style={{ gap: 5 }}>{nonFiniteForms(forms).map((item) => <View key={item.labelRo} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderColor: p.border, paddingVertical: 7 }}><Tiny>{item.labelRo}</Tiny><Text style={{ color: p.ink, fontWeight: '700', textAlign: 'right' }}>{item.value}</Text></View>)}</View></Card>{TENSES.map((tense) => <Card key={tense.id}><H3>{tense.nameEn}</H3><Tiny>{tense.nameRo} · {tense.useRo}</Tiny><View style={{ gap: 6, marginTop: 10 }}>{PERSONS.map((person, i) => { const sentence = tense.build(forms, i, mode); return <View key={person} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ color: p.muted, width: 82, fontSize: 12 }}>{person}</Text><Text style={{ color: p.ink, flex: 1, fontSize: 13.5 }}>{sentence}</Text><Button title="" icon="volume" small variant="ghost" onPress={() => void speak(sentence, 0.92)} style={{ paddingHorizontal: 8 }} /></View>; })}</View></Card>)}</View>;
}

function ReferenceTables() {
  const p = usePalette();
  const [query, setQuery] = useState('');
  const tables = allTables().filter(({ table }) => tableMatches(table, query));
  return <View><H1>Tabele rapide</H1><Muted>Răspunsul de care ai nevoie acum, într-un format ușor de scanat.</Muted><Field value={query} onChange={setQuery} placeholder="Caută: timpuri, pronume, prepoziții…" />{tables.map(({ section, table }) => <Card key={table.id}><Tiny>{section.titleRo.toUpperCase()}</Tiny><H3>{table.titleRo}</H3>{table.noteRo ? <Muted>{table.noteRo}</Muted> : null}<ScrollView horizontal showsHorizontalScrollIndicator><View><View style={{ flexDirection: 'row', backgroundColor: p.primarySoft }}>{table.columns.map((column, i) => <Text key={`${column}-${i}`} style={{ color: p.primaryDeep, fontWeight: '800', width: 150, padding: 9, fontSize: 12 }}>{column}</Text>)}</View>{table.rows.map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: p.border }}>{row.map((cell, cellIndex) => <Text key={cellIndex} style={{ color: p.ink, width: 150, padding: 9, fontSize: 12.5, lineHeight: 18 }}>{cell}</Text>)}</View>)}</View></ScrollView></Card>)}{!tables.length ? <Banner kind="info">Nu am găsit niciun tabel pentru „{query}”.</Banner> : null}</View>;
}
