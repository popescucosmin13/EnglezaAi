// Sesiune rapidă de 5 minute (§P1): drill cronometrat construit exclusiv din elementele
// scadente azi — greșeli de corectat, vocabular de reactivat, fraze pe sunetele slabe.
// Portat de pe web: timer pe AppState, navigare expo-router.

import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import type { Mistake, VocabItem, PronunciationResult } from '../types';
import { getMistakes, getVocab, saveVocab, savePronResult, newId, todayStr, bumpActivity, updateActivity, addXp } from '../db/db';
import { isDue, applyReview } from '../srs/ladder';
import { reviewMistake, prioritizeMistakes, markMistakePipeline, containsExpression, ensureMistakePromptRo } from '../logic/engine';
import { getPersonalizedPhrases, type PronPhrase } from '../logic/pron';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';
import { Screen, H1, Card, Banner, Button, ButtonRow, Tiny, Muted, Bar, Pill, StatGrid, StatTile, Spinner, Field } from '../ui';
import { usePalette } from '../theme';

const TOTAL_SEC = 5 * 60;

type Item =
  | { kind: 'mistake'; mistake: Mistake }
  | { kind: 'vocab'; vocab: VocabItem }
  | { kind: 'pron'; phrase: PronPhrase };

function interleave(...lists: Item[][]): Item[] {
  const out: Item[] = [];
  const max = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export default function QuickSession() {
  const p = usePalette();
  useKeepAwake();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(TOTAL_SEC);
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [stats, setStats] = useState({ done: 0, ok: 0 });
  const [finished, setFinished] = useState(false);
  const [loadError, setLoadError] = useState('');
  const recorder = useRef(new Recorder());

  async function load() {
    setLoadError('');
    try {
      const [mistakes, vocab, phrases] = await Promise.all([
        getMistakes(),
        getVocab(),
        getPersonalizedPhrases().catch(() => [] as PronPhrase[]),
      ]);
      const dueMistakes = prioritizeMistakes(mistakes.filter((m) => isDue(m.review) && m.status !== 'mastered')).slice(0, 8);
      const dueVocab = vocab.filter((v) => isDue(v.review) && v.translation).slice(0, 8);
      setItems(
        interleave(
          dueMistakes.map((m) => ({ kind: 'mistake', mistake: m }) as Item),
          dueVocab.map((v) => ({ kind: 'vocab', vocab: v }) as Item),
          phrases.slice(0, 6).map((ph) => ({ kind: 'pron', phrase: ph }) as Item)
        )
      );
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cronometrul global de 5 minute — nu curge cât timp aplicația e în fundal
  useEffect(() => {
    if (finished || !items) return;
    if (left <= 0) {
      void finish();
      return;
    }
    const t = setTimeout(() => {
      if (AppState.currentState === 'active') setLeft((s) => s - 1);
      else setLeft((s) => s); // în fundal timpul stă pe loc
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, items, finished]);

  const item = items && items.length > 0 ? items[idx % items.length] : null;

  // Sarcina în română pentru cardurile „Corectează" — traduci, nu ghicești contextul de atunci.
  const [promptRo, setPromptRo] = useState<string | null>(null);
  useEffect(() => {
    setPromptRo(null);
    if (!item || item.kind !== 'mistake') return;
    let cancelled = false;
    ensureMistakePromptRo(item.mistake).then((pr) => {
      if (!cancelled && pr) setPromptRo(pr);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.kind === 'mistake' ? item.mistake.id : null]);

  async function finish() {
    setFinished(true);
    if (stats.done > 0) {
      await updateActivity({ lessonDone: true }).catch(() => {});
      await addXp(10).catch(() => {});
    }
  }

  function next() {
    setAnswer('');
    setFeedback(null);
    setIdx((i) => i + 1);
  }

  async function submit(text: string) {
    if (!item || !text.trim()) return;
    let ok = false;
    let detail = '';
    if (item.kind === 'mistake') {
      const target = item.mistake.correctFragment ?? item.mistake.corrected;
      ok = sttDiffAssessment(target, text).accuracyScore >= 70;
      detail = target;
      await reviewMistake(item.mistake, ok ? 'good' : 'fail').catch(() => {});
      if (ok) await markMistakePipeline(item.mistake, 'repeatedOk').catch(() => {});
    } else if (item.kind === 'vocab') {
      ok = containsExpression(text, item.vocab.word);
      detail = item.vocab.word;
      const v = item.vocab;
      v.review = applyReview(v.review, ok ? 'good' : 'fail');
      if (ok) v.passiveScore = Math.min(100, v.passiveScore + 10);
      await saveVocab(v).catch(() => {});
      await bumpActivity('vocabReviews', 1).catch(() => {});
    } else {
      const score = sttDiffAssessment(item.phrase.text, text).accuracyScore;
      ok = score >= 70;
      detail = item.phrase.text;
      const rec: PronunciationResult = {
        id: newId(),
        date: todayStr(),
        exercise: 'personalized',
        phrase: item.phrase.text,
        targets: item.phrase.targets,
        score,
        wordScores: sttDiffAssessment(item.phrase.text, text).words,
        source: 'stt-diff',
      };
      await savePronResult(rec).catch(() => {});
      await bumpActivity('pronPhrases', 1).catch(() => {});
    }
    await addXp(ok ? 5 : 1).catch(() => {});
    setStats((s) => ({ done: s.done + 1, ok: s.ok + (ok ? 1 : 0) }));
    setFeedback({ ok, text: ok ? '✓ Corect!' : `✗ Răspunsul căutat: ${detail}` });
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setAnswer(text);
        await submit(text);
      } catch {
        setFeedback({ ok: false, text: 'Nu am putut transcrie — mai încearcă.' });
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setFeedback({ ok: false, text: 'Nu am acces la microfon.' });
    }
  }

  if (loadError) {
    return (
      <Screen>
        <Banner kind="error">Nu am putut pregăti sesiunea rapidă: {loadError}</Banner>
        <ButtonRow>
          <Button title="Reîncearcă" onPress={load} />
        </ButtonRow>
      </Screen>
    );
  }
  if (!items) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <Spinner />
          <Muted>Se pregătesc elementele scadente…</Muted>
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="zap" size={24} />
          <H1 style={{ marginVertical: 0 }}>Sesiune rapidă</H1>
        </View>
        <Card>
          <Muted>Nimic scadent chiar acum — totul e la zi. Revino după următoarea conversație.</Muted>
        </Card>
        <ButtonRow>
          <Button title="Înapoi acasă" variant="primary" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  if (finished) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkCircle" size={24} color={p.success} />
          <H1 style={{ marginVertical: 0 }}>Gata!</H1>
        </View>
        <StatGrid>
          <StatTile value={stats.done} label="elemente exersate" />
          <StatTile value={`${stats.done > 0 ? Math.round((stats.ok / stats.done) * 100) : 0}%`} label="corecte" />
        </StatGrid>
        <Muted style={{ marginTop: 10 }}>Elementele greșite revin mai repede în repetare — exact asta e ideea.</Muted>
        <ButtonRow>
          <Button title="Înapoi acasă" variant="primary" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="zap" size={24} />
          <H1 style={{ marginVertical: 0 }}>Sesiune rapidă</H1>
        </View>
        <Text style={{ fontWeight: '700', color: p.ink, fontVariant: ['tabular-nums'] }}>
          ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </Text>
      </View>
      <Bar ratio={1 - left / TOTAL_SEC} style={{ marginVertical: 8 }} />
      <Tiny>
        {stats.done} exersate · {stats.ok} corecte · doar elemente scadente azi
      </Tiny>

      {item && (
        <Card>
          {item.kind === 'mistake' && (
            <>
              <Pill kind="badge">Corectează</Pill>
              {promptRo ? (
                <>
                  <Text style={{ fontSize: 17.5, fontWeight: '600', color: p.ink, marginVertical: 6 }}>„{promptRo}"</Text>
                  <Tiny style={{ color: p.danger }}>Atunci ai spus: „{item.mistake.originalFragment ?? item.mistake.original}"</Tiny>
                  <Tiny>Spune corect în engleză:</Tiny>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 17.5, color: p.danger, marginVertical: 6 }}>
                    „{item.mistake.originalFragment ?? item.mistake.original}"
                  </Text>
                  <Tiny>Spune varianta corectă:</Tiny>
                </>
              )}
            </>
          )}
          {item.kind === 'vocab' && (
            <>
              <Pill kind="badge">Vocabular</Pill>
              <Text style={{ fontSize: 17.5, fontWeight: '700', color: p.ink, marginVertical: 6 }}>{item.vocab.translation}</Text>
              <Tiny>Spune cuvântul/expresia în engleză (poți face o propoziție cu el):</Tiny>
            </>
          )}
          {item.kind === 'pron' && (
            <>
              <Pill kind="badge">Pronunție</Pill>
              <Text style={{ fontSize: 17.5, color: p.ink, marginVertical: 6 }}>{item.phrase.text}</Text>
              <ButtonRow style={{ marginTop: 0 }}>
                <Button title="Ascultă" variant="ghost" icon="volume" small onPress={() => void speak(item.phrase.text, 0.95)} />
              </ButtonRow>
            </>
          )}
          {!feedback ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Field value={answer} onChange={setAnswer} placeholder="…sau scrie aici" />
                </View>
                <Button
                  title=""
                  variant={recording ? 'danger' : 'primary'}
                  icon={recording ? 'stop' : 'mic'}
                  onPress={mic}
                />
              </View>
              <ButtonRow style={{ marginBottom: 0 }}>
                <Button title="Verifică" onPress={() => void submit(answer)} disabled={!answer.trim()} />
                <Button title="Sari peste →" variant="ghost" onPress={next} />
              </ButtonRow>
            </>
          ) : (
            <>
              <Text style={{ color: feedback.ok ? p.success : p.danger, fontWeight: '700', fontSize: 15.5, marginVertical: 6 }}>
                {feedback.text}
              </Text>
              <ButtonRow style={{ marginBottom: 0 }}>
                <Button title="Următorul →" variant="primary" onPress={next} />
              </ButtonRow>
            </>
          )}
        </Card>
      )}
      <ButtonRow>
        <Button title="Încheie mai devreme" variant="ghost" onPress={finish} />
      </ButtonRow>
    </Screen>
  );
}
