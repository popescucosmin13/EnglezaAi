// Reformulare la cald (§12+): imediat după raport, utilizatorul rostește varianta
// corectă a fiecărei greșeli principale. Succesul actualizează SRS-ul greșelii persistate.

import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Mistake, ReportMistake } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { getMistakes, bumpActivity, addXp } from '../db/db';
import { reviewMistake } from '../logic/engine';
import { Icon } from './Icon';
import { H3, Muted, Tiny, Button, ButtonRow, Pill, IconButton, Card } from '../ui';
import { usePalette } from '../theme';

const PASS_SCORE = 80;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, '').replace(/\s+/g, ' ').trim();
}

type StepState = 'pending' | 'recording' | 'checking' | 'passed' | 'failed';

export default function ReformulateNow({ mistakes }: { mistakes: ReportMistake[] }) {
  const p = usePalette();
  const [idx, setIdx] = useState(0);
  const [state, setState] = useState<StepState>('pending');
  const [score, setScore] = useState<number | null>(null);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const [passedCount, setPassedCount] = useState(0);
  const recorder = useRef(new Recorder());
  const persisted = useRef<Mistake[] | null>(null);

  useEffect(() => {
    getMistakes().then((m) => { persisted.current = m; }).catch(() => { persisted.current = []; });
  }, []);

  if (mistakes.length === 0) return null;
  const done = idx >= mistakes.length;
  const m = done ? null : mistakes[idx];

  /** Greșeala persistată care corespunde corectării din raport (match tolerant). */
  function findPersisted(correct: string): Mistake | undefined {
    const target = norm(correct);
    return persisted.current?.find(
      (pm) => norm(pm.corrected) === target || norm(pm.corrected).includes(target) || target.includes(norm(pm.corrected))
    );
  }

  function advance() {
    setIdx((i) => i + 1);
    setState('pending');
    setScore(null);
    setHeard('');
    setError('');
  }

  async function toggleRecording() {
    if (!m) return;
    if (state === 'recording') {
      setState('checking');
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(m.correct));
        await audio.dispose();
        const res = sttDiffAssessment(m.correct, text);
        setScore(res.accuracyScore);
        setHeard(text);
        if (res.accuracyScore >= PASS_SCORE) {
          setState('passed');
          setPassedCount((n) => n + 1);
          await bumpActivity('sentencesRepeated', 1);
          await addXp(10);
          const persistedMistake = findPersisted(m.correct);
          if (persistedMistake) await reviewMistake(persistedMistake, 'good');
        } else {
          setState('failed');
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
        setState('pending');
      }
      return;
    }
    try {
      await recorder.current.start();
      setError('');
      setState('recording');
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  if (done) {
    return (
      <Card style={{ borderLeftWidth: 3, borderLeftColor: p.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="repeat" size={18} color={p.ink} />
          <H3 style={{ marginVertical: 0 }}>Reformulare la cald</H3>
        </View>
        <Muted>
          {passedCount === mistakes.length
            ? `Excelent! Ai reformulat corect toate cele ${mistakes.length} greșeli — corectarea imediată e cea care rămâne. +${passedCount * 10} XP`
            : `Ai reformulat ${passedCount} din ${mistakes.length} greșeli. Restul revin la recapitulare în zilele următoare.`}
        </Muted>
      </Card>
    );
  }

  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: p.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="repeat" size={18} color={p.ink} />
          <H3 style={{ marginVertical: 0 }}>Reformulează acum</H3>
        </View>
        <Pill kind="badgeSoft">
          {idx + 1} / {mistakes.length}
        </Pill>
      </View>
      <Muted>Rostește pe loc varianta corectă — corectarea imediată se ține minte cel mai bine.</Muted>

      <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.dangerSoft }}>
        <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>Ce ai spus</Text>
        <Text style={{ color: p.ink, fontSize: 15.5 }}>{m!.said}</Text>
      </View>
      <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.successSoft }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
            Rostește corect
          </Text>
          <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(m!.correct, 0.95)} />
        </View>
        <Text style={{ color: p.ink, fontSize: 15.5 }}>{m!.correct}</Text>
      </View>

      <ButtonRow>
        <Button
          title={state === 'recording' ? 'Oprește și verifică' : state === 'checking' ? 'Se verifică…' : 'Rostește corectarea'}
          variant={state === 'recording' ? 'danger' : 'primary'}
          icon={state === 'checking' ? undefined : state === 'recording' ? 'stop' : 'mic'}
          busy={state === 'checking'}
          disabled={state === 'checking'}
          onPress={toggleRecording}
        />
        {(state === 'passed' || state === 'failed') && (
          <Button title={idx === mistakes.length - 1 ? 'Încheie' : 'Următoarea →'} onPress={advance} />
        )}
        {state === 'failed' && (
          <Button
            title="↻ Mai încearcă"
            variant="ghost"
            onPress={() => {
              setState('pending');
              setScore(null);
            }}
          />
        )}
      </ButtonRow>

      {score != null && (
        <Text style={{ fontWeight: '700', color: state === 'passed' ? p.success : p.warn, fontSize: 14.5 }}>
          {state === 'passed' ? `✓ ${score}% — corect! +10 XP` : `${score}% — am auzit: „${heard}". Ascultă din nou și reia.`}
        </Text>
      )}
      {error ? <Tiny style={{ color: p.danger }}>{error}</Tiny> : null}
    </Card>
  );
}
