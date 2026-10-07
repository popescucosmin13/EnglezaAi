// Raportul după conversație (§12): rezumat, ce ai făcut bine, max 3 greșeli cu exercițiu vocal.
// Portat de pe web.

import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Session, SessionReport, Utterance } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { checkWithLanguageTool, type LtMatch } from '../api/languagetool';
import { bumpActivity, addXp, getProfile } from '../db/db';
import { chatJson } from '../api/openrouter';
import { buildRedoSceneEvalPrompt } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import ReformulateNow from './ReformulateNow';
import { TappableText } from './TappableText';
import { H2, Muted, Tiny, P, Card, Banner, Button, ButtonRow, Chip, ChipRow, StatGrid, StatTile, Field, IconButton } from '../ui';
import { usePalette } from '../theme';

export default function ReportView({ session, report }: { session: Session; report?: SessionReport }) {
  const p = usePalette();
  const [recordingIdx, setRecordingIdx] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [ltMatches, setLtMatches] = useState<LtMatch[] | null>(session.grammarMatches ?? null);
  const [ltBusy, setLtBusy] = useState(false);
  const [ltError, setLtError] = useState<string | null>(null);
  const recorder = useRef(new Recorder());

  const minutes = Math.round(session.userSpeakingSec / 60);
  const per100 = session.wordCount > 0 ? ((session.errorCount / session.wordCount) * 100).toFixed(1) : '0';
  const pause = session.avgHesitationMs != null ? (session.avgHesitationMs / 1000).toFixed(1) : '—';

  async function repeatSentence(key: string, target: string) {
    if (recordingIdx === key) {
      setRecordingIdx(null);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(target));
        await audio.dispose();
        const res = sttDiffAssessment(target, text);
        setScores((s) => ({ ...s, [key]: res.accuracyScore }));
        await bumpActivity('sentencesRepeated', 1);
        await addXp(res.accuracyScore >= 80 ? 8 : 4);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecordingIdx(key);
    } catch {
      /* fără mic */
    }
  }

  async function runLanguageTool() {
    setLtBusy(true);
    setLtError(null);
    const userText = session.turns.filter((t) => t.role === 'user').map((t) => t.text).join('. ');
    try {
      setLtMatches(await checkWithLanguageTool(userText));
    } catch (e: any) {
      setLtError(String(e?.message ?? e));
    }
    setLtBusy(false);
  }

  const mirrorRow = (label: string, text: string, bg: string, withSpeak?: boolean) => (
    <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>{label}</Text>
        {withSpeak && <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(text, 0.95)} />}
      </View>
      {withSpeak
        ? <TappableText text={text} color={p.ink} style={{ fontSize: 15.5 }} />
        : <Text style={{ color: p.ink, fontSize: 15.5 }}>{text}</Text>}
    </View>
  );

  return (
    <View>
      <StatGrid>
        <StatTile value={Math.round(session.durationSec / 60)} label="min sesiune" />
        <StatTile value={minutes} label="min vorbite de tine" />
        <StatTile value={session.wordCount} label="cuvinte" />
        <StatTile value={pause} label="pauza medie (s)" />
        <StatTile value={per100} label="greșeli / 100 cuvinte" />
        {report && <StatTile value={report.generalScore} label="scor general" />}
      </StatGrid>

      {report && (
        <>
          <Muted style={{ marginTop: 12 }}>{report.summaryRo}</Muted>

          <H2>Ce ai făcut bine</H2>
          <Card>
            {report.wellDone.map((w, i) => (
              <P key={i} style={{ marginVertical: 5 }}>
                • {w}
              </P>
            ))}
          </Card>

          {report.mainMistakes.length > 0 && <H2>Greșelile principale (max 3)</H2>}
          {report.mainMistakes.map((m, i) => (
            <Card key={i}>
              {mirrorRow('Ce ai spus', m.said, p.dangerSoft)}
              {mirrorRow('Corect', m.correct, p.successSoft, true)}
              {mirrorRow('Mai natural', m.natural, p.primarySoft, true)}
              <Muted>{m.explanationRo}</Muted>
              <Tiny style={{ fontWeight: '700', marginTop: 6 }}>Exercițiu — rostește:</Tiny>
              {m.exerciseSentences.map((s, j) => {
                const key = `${i}-${j}`;
                return (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 }}>
                    <TappableText text={s} color={p.ink} style={{ flex: 1, fontSize: 15 }} />
                    <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(s, 0.95)} />
                    <Button
                      title=""
                      variant={recordingIdx === key ? 'danger' : 'default'}
                      icon={recordingIdx === key ? 'stop' : 'mic'}
                      small
                      onPress={() => void repeatSentence(key, s)}
                    />
                    {scores[key] != null && (
                      <View
                        style={{
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: scores[key] >= 80 ? p.successSoft : p.warnSoft,
                        }}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: scores[key] >= 80 ? p.success : p.warnInk }}>
                          {scores[key]}%
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          ))}

          {report.mainMistakes.length > 0 && <ReformulateNow mistakes={report.mainMistakes} />}

          {report.newExpressions.length > 0 && (
            <>
              <H2>Expresii noi</H2>
              <ChipRow>
                {report.newExpressions.map((e, i) => (
                  <Chip key={i} label={e} selected />
                ))}
              </ChipRow>
            </>
          )}
        </>
      )}

      <RedoScene session={session} />

      {/* Fără replici ale utilizatorului nu există text de verificat — serverul ar respinge cererea goală. */}
      {session.turns.some((t) => t.role === 'user') && (
        <>
          <H2>Verificare suplimentară</H2>
          {!ltMatches && (
            <ButtonRow>
              <Button
                title={ltBusy ? 'Se verifică…' : ltError ? 'Reîncearcă' : 'Rulează din nou verificarea'}
                busy={ltBusy}
                onPress={runLanguageTool}
                disabled={ltBusy}
              />
            </ButtonRow>
          )}
          {ltError ? <Tiny style={{ color: p.danger }}>✗ {ltError}</Tiny> : null}
          {ltMatches && ltMatches.length === 0 && <Muted>Nicio problemă suplimentară găsită.</Muted>}
          {ltMatches &&
            ltMatches.slice(0, 8).map((m, i) => (
              <Tiny key={i} style={{ marginVertical: 4 }}>
                • {m.message}{' '}
                {m.replacements.length > 0 && <Text style={{ fontWeight: '700' }}>→ {m.replacements.join(' / ')}</Text>}
              </Tiny>
            ))}
        </>
      )}
    </View>
  );
}

/** Reia scena (§P1): refaci momentul cu cele mai multe greșeli din conversație, mai natural. */
function RedoScene({ session }: { session: Session }) {
  const p = usePalette();
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ improved: boolean; feedbackRo: string; bestVersionEn: string } | null>(null);
  const [error, setError] = useState('');
  const recorder = useRef(new Recorder());

  // momentul cu cele mai multe greșeli + replica profesorului dinaintea lui
  const moment = ((): { teacher?: Utterance; learner: Utterance; errors: number } | null => {
    let best: { teacher?: Utterance; learner: Utterance; errors: number } | null = null;
    for (let i = 0; i < session.turns.length; i++) {
      const t = session.turns[i];
      if (t.role !== 'user' || !t.analysis) continue;
      const errors = t.analysis.errors.filter((e) => !e.disputed).length;
      if (errors === 0) continue;
      if (!best || errors > best.errors) {
        const teacher = [...session.turns.slice(0, i)].reverse().find((x) => x.role === 'ai');
        best = { teacher, learner: t, errors };
      }
    }
    return best;
  })();

  if (!moment || !hasOpenRouterKey()) return null;

  async function evaluate(text: string) {
    if (!text.trim() || !moment) return;
    setBusy(true);
    setError('');
    try {
      const profile = await getProfile();
      const res = await chatJson<{ improved: boolean; feedbackRo: string; bestVersionEn: string }>(
        [
          { role: 'system', content: buildRedoSceneEvalPrompt(profile) },
          {
            role: 'user',
            content: `Teacher said: "${moment.teacher?.text ?? '(conversation opening)'}"\nOriginal learner answer: "${moment.learner.text}"\nNew attempt: "${text.trim()}"`,
          },
        ],
        {
          tier: 'utility',
          feature: 'redo_scene',
          maxTokens: 700,
          validate: (v: any) => typeof v?.improved === 'boolean' && typeof v?.feedbackRo === 'string' && typeof v?.bestVersionEn === 'string',
        }
      );
      setResult(res);
      if (res.improved) await addXp(10);
      await bumpActivity('sentencesRepeated', 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio);
        await audio.dispose();
        setAnswer(text);
        await evaluate(text);
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
    <>
      <H2>Reia scena</H2>
      <Card>
        <Tiny>Refă momentul în care ai avut cele mai multe greșeli — de data asta mai natural.</Tiny>
        {moment.teacher && (
          <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.bgSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
                Profesorul a spus
              </Text>
              <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(moment.teacher!.text, 0.92)} />
            </View>
            <Text style={{ color: p.ink, fontSize: 15 }}>{moment.teacher.text}</Text>
          </View>
        )}
        <View style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 6, backgroundColor: p.dangerSoft }}>
          <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
            Tu ai răspuns
          </Text>
          <Text style={{ color: p.ink, fontSize: 15 }}>{moment.learner.text}</Text>
        </View>
        {error ? <Banner kind="error">{error}</Banner> : null}
        {!result ? (
          <>
            <Tiny style={{ fontWeight: '700' }}>Răspunde din nou, mai bine:</Tiny>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Field value={answer} onChange={setAnswer} placeholder="Noua ta variantă…" />
              </View>
              <Button
                title=""
                variant={recording ? 'danger' : 'default'}
                icon={recording ? 'stop' : 'mic'}
                onPress={mic}
                disabled={busy}
              />
            </View>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button
                title={busy ? 'Se evaluează…' : 'Evaluează'}
                variant="primary"
                busy={busy}
                onPress={() => void evaluate(answer)}
                disabled={!answer.trim() || busy}
              />
            </ButtonRow>
          </>
        ) : (
          <>
            <Text style={{ color: result.improved ? p.success : p.warn, fontWeight: '700', fontSize: 15.5, marginVertical: 4 }}>
              {result.improved ? '✓ Mai bine decât prima dată! +10 XP' : 'Încă nu e mai bine — vezi feedbackul.'}
            </Text>
            <Muted>{result.feedbackRo}</Muted>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Tiny style={{ flexShrink: 1 }}>
                Varianta cea mai naturală: <Text style={{ fontWeight: '700' }}>{result.bestVersionEn}</Text>
              </Tiny>
              <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(result.bestVersionEn, 0.92)} />
            </View>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button
                title="Mai încearcă o dată"
                onPress={() => {
                  setResult(null);
                  setAnswer('');
                }}
              />
            </ButtonRow>
          </>
        )}
      </Card>
    </>
  );
}
