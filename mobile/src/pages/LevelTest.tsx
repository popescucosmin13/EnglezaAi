// Testul inițial de nivel (§7): 7 etape, ~10-15 minute, rezultat pe 5 competențe + top 5 probleme + plan.
// Portat de pe web: înregistrarea e deja WAV 16k (fără conversie), timer pe AppState.

import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle, Ellipse, Line, Rect } from 'react-native-svg';
import type { Profile, LevelTestResult, CompetencyScores, CompetencyLevels, Cefr } from '../types';
import { CEFR_ORDER, COMPETENCY_LABELS_RO } from '../types';
import { getProfile, saveProfile, saveTestResult, todayStr, updateActivity, addXp } from '../db/db';
import { useVoiceChat } from '../hooks/useVoiceChat';
import ChatView from '../components/ChatView';
import TutorSessionHeader from '../components/TutorSessionHeader';
import TimeUpModal from '../components/TimeUpModal';
import { DIFFICULTY_MODES, LEVEL_TEST_PRON_SENTENCES } from '../content';
import { chatJson } from '../api/openrouter';
import { buildLevelTestEvalPrompt, LISTENING_PASSAGE } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { assessWithAzure } from '../api/azure';
import { hasOpenRouterKey } from '../settings';
import { Icon } from '../components/Icon';
import { Screen, H1, H2, Card, Banner, Button, ButtonRow, Tiny, Muted, P, Pill, Spinner } from '../ui';
import { usePalette } from '../theme';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import SubscriptionGate from './SubscriptionGate';

// seconds = durata orientativă a etapei; la expirare apare popup-ul de continuare (între replici)
const STAGES = [
  { id: 'convo', titleRo: 'Conversație simplă', chat: true, seconds: 120 },
  { id: 'past', titleRo: 'Povestire la trecut', chat: true, seconds: 120 },
  { id: 'picture', titleRo: 'Descriere vizuală', chat: true, seconds: 120 },
  { id: 'listening', titleRo: 'Ascultare', chat: true, seconds: 150 },
  { id: 'work', titleRo: 'Situație profesională', chat: true, seconds: 120 },
  { id: 'pron', titleRo: 'Pronunție', chat: false, seconds: 150 },
  { id: 'freeform', titleRo: 'Conversație liberă', chat: true, seconds: 180 },
];

const STAGE_INSTRUCTIONS: Record<string, string> = {
  convo: 'LEVEL TEST — Stage 1, simple conversation: ask, one at a time: What is your name? Where do you live? What do you do? What do you enjoy doing? Tell me about your family. Short friendly acknowledgements, no corrections, no teaching.',
  past: 'LEVEL TEST — Stage 2, past narration: ask the learner to tell you what they did yesterday, then one follow-up about a recent weekend or trip. No corrections.',
  picture: "LEVEL TEST — Stage 3, picture description: the learner sees a picture of a busy office (a man typing at a desk with two monitors, a woman drinking coffee by the window, a printer with paper on the floor, a clock showing 9 o'clock, a dog sleeping under the table). Ask them to describe what is happening in the picture, then ask one detail question about it. No corrections.",
  listening: `LEVEL TEST — Stage 4, listening: the learner just heard this voicemail (do NOT repeat its text): "${LISTENING_PASSAGE.text}". Ask these questions one at a time and move on regardless of correctness: ${LISTENING_PASSAGE.questions.join(' | ')}. No corrections.`,
  work: 'LEVEL TEST — Stage 5, professional situation: ask the learner to explain a technical/work problem to a colleague (e.g. something broken at work and what they did). One follow-up question. No corrections.',
  freeform: 'LEVEL TEST — Stage 7, free conversation: 2-3 minutes of natural free conversation. Pick an engaging topic, keep questions open. No suggestions, no corrections.',
};

export default function LevelTest({ onDone }: { onDone?: () => void }) {
  const p = usePalette();
  const access = useRevenueCat();
  useKeepAwake();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stageIdx, setStageIdx] = useState(-1); // -1 = intro
  const [pronIdx, setPronIdx] = useState(0);
  const [pronScores, setPronScores] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [pronBusy, setPronBusy] = useState(false);
  const [listeningPlayed, setListeningPlayed] = useState(0);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState<LevelTestResult | null>(null);
  const [error, setError] = useState('');
  const recorder = useRef(new Recorder());
  const finishing = useRef(false);
  const [stageElapsed, setStageElapsed] = useState(0);
  const [timeUpPrompt, setTimeUpPrompt] = useState(false);
  const timeUpSnoozedAt = useRef(-1); // stageElapsed la ultima amânare; -1 = neîntrebat încă

  const difficulty = DIFFICULTY_MODES[1];
  const chat = useVoiceChat({
    type: 'leveltest',
    scenarioTitle: 'Test de nivel',
    profile: profile ?? ({} as Profile),
    difficulty,
    correctionMode: 'final',
  });

  useEffect(() => {
    getProfile().then(setProfile).catch(() => {});
  }, []);

  const stage = stageIdx >= 0 && stageIdx < STAGES.length ? STAGES[stageIdx] : null;

  // cronometrul etapei curente — nu curge cât timp aplicația e în fundal
  useEffect(() => {
    if (!stage) return;
    setStageElapsed(0);
    const t = setInterval(() => {
      if (AppState.currentState === 'active') setStageElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx]);

  // popup „timpul a expirat” — doar între replici, după ce examinatorul/elevul termină
  useEffect(() => {
    if (!stage) return;
    const overtime = stageElapsed >= stage.seconds;
    const snoozed = timeUpSnoozedAt.current >= 0 && stageElapsed < timeUpSnoozedAt.current + 120;
    const wantPrompt = overtime && !snoozed && !timeUpPrompt;
    chat.suspendAutoRecord(wantPrompt || timeUpPrompt);
    const between = chat.busy === 'idle' && !recording && !pronBusy;
    if (wantPrompt && between) setTimeUpPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageElapsed, chat.busy, recording, pronBusy, timeUpPrompt, stageIdx]);

  function stayInStage() {
    timeUpSnoozedAt.current = stageElapsed; // reîntrebăm după încă 2 minute
    setTimeUpPrompt(false);
    chat.suspendAutoRecord(false);
    chat.resumeListening();
  }

  function advanceFromPrompt() {
    setTimeUpPrompt(false);
    chat.suspendAutoRecord(false);
    void nextStage();
  }

  async function startTest() {
    setStageIdx(0);
    chat.setPhase(STAGE_INSTRUCTIONS.convo);
    await chat.start('The level test starts now. Briefly welcome the learner and ask the first question (What is your name?).');
  }

  async function nextStage() {
    const next = stageIdx + 1;
    setTimeUpPrompt(false);
    timeUpSnoozedAt.current = -1;
    if (next >= STAGES.length) return finishTest();
    setStageIdx(next);
    const s = STAGES[next];
    if (s.id === 'pron') return; // etapă fără chat
    if (s.id === 'listening') {
      chat.setPhase(STAGE_INSTRUCTIONS.listening);
      await speak(LISTENING_PASSAGE.text, 0.95);
      setListeningPlayed(1);
      await chat.aiTurn('(The learner has just heard the voicemail. Ask the first listening question now.)');
      return;
    }
    chat.setPhase(STAGE_INSTRUCTIONS[s.id]);
    await chat.aiTurn(`(Move to the next test stage: ${s.titleRo}. Transition briefly and ask the first question of this stage.)`);
  }

  async function pronRecord() {
    const sentence = LEVEL_TEST_PRON_SENTENCES[pronIdx];
    if (recording) {
      setRecording(false);
      setPronBusy(true);
      try {
        // înregistrarea nativă este deja WAV PCM16 mono 16 kHz (pe iOS) — fără conversie;
        // assessWithAzure face singur fallback pe STT-diff dacă backend-ul nu răspunde
        const wav = await recorder.current.stop();
        const score = (await assessWithAzure(wav, sentence)).accuracyScore;
        await wav.dispose();
        setPronScores((s) => [...s, score]);
        if (pronIdx < LEVEL_TEST_PRON_SENTENCES.length - 1) setPronIdx(pronIdx + 1);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
      setPronBusy(false);
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon.');
    }
  }

  async function finishTest() {
    if (finishing.current || !profile) return;
    finishing.current = true;
    setEvaluating(true);
    setStageIdx(STAGES.length);
    try {
      const pronAvg = pronScores.length > 0 ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length) : null;
      const transcript = chat.turns.map((t) => `${t.role === 'user' ? 'Learner' : 'Examiner'}: ${t.text}`).join('\n');
      const evalRes = await chatJson<{
        general: Cefr;
        levels: CompetencyLevels;
        scores: CompetencyScores;
        fluency: number;
        confidence: 'scăzută' | 'medie' | 'ridicată';
        activeVocabEstimate: string;
        topProblems: string[];
        recommendedPlanRo: string;
      }>([
        { role: 'system', content: buildLevelTestEvalPrompt(pronAvg) },
        { role: 'user', content: `Full test transcript:\n${transcript}` },
      ], {
        temperature: 0.2,
        feature: 'level_test_evaluation',
        maxTokens: 2200,
        // evaluarea scrie direct în profil — structura trebuie garantată
        validate: (v: any) =>
          CEFR_ORDER.includes(v?.general) &&
          v?.levels && typeof v.levels === 'object' &&
          v?.scores && ['conversation', 'grammar', 'pronunciation', 'vocabulary', 'listening'].every((k) =>
            CEFR_ORDER.includes(v.levels[k]) && typeof v.scores[k] === 'number' && v.scores[k] >= 0 && v.scores[k] <= 100
          ),
      });

      const res: LevelTestResult = {
        date: todayStr(),
        general: evalRes.general,
        levels: evalRes.levels,
        fluency: evalRes.fluency,
        confidence: evalRes.confidence,
        activeVocabEstimate: evalRes.activeVocabEstimate,
        topProblems: evalRes.topProblems ?? [],
        recommendedPlanRo: evalRes.recommendedPlanRo ?? '',
      };
      await saveTestResult(res);
      const prof = await getProfile();
      prof.testDone = true;
      prof.currentLevel = evalRes.general;
      prof.competencyLevels = evalRes.levels;
      prof.scores = { ...evalRes.scores, pronunciation: pronAvg ?? evalRes.scores.pronunciation };
      prof.confidence = evalRes.confidence;
      prof.topProblems = evalRes.topProblems ?? [];
      prof.recommendedPlanRo = evalRes.recommendedPlanRo ?? '';
      await saveProfile(prof);
      await updateActivity({ testDone: true });
      await addXp(50);
      await chat.finish({ withReport: false }); // salvează sesiunea de test + greșelile în hartă
      setResult(res);
      onDone?.();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setEvaluating(false);
  }

  if (!profile) return <Screen scroll={false}>{null}</Screen>;
  if (profile.testDone && !access.isPro) return <SubscriptionGate lockedFeature="Refacerea testului de nivel" />;

  // ---------- Rezultat ----------
  if (result) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="graduation" size={24} />
          <H1 style={{ marginVertical: 0 }}>Rezultatul testului</H1>
        </View>
        <Card style={{ alignItems: 'center' }}>
          <Tiny style={{ textTransform: 'uppercase', fontWeight: '700' }}>Nivel general</Tiny>
          <Text style={{ fontSize: 48, fontWeight: '800', color: p.primaryDeep }}>{result.general}</Text>
          <Muted style={{ textAlign: 'center' }}>
            Încredere: {result.confidence} · vocabular activ: {result.activeVocabEstimate} · fluență {result.fluency}/100
          </Muted>
        </Card>
        <H2>Pe competențe</H2>
        <Card>
          {(Object.keys(result.levels) as (keyof CompetencyLevels)[]).map((k, i, arr) => (
            <View
              key={k}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 9,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                borderBottomColor: p.border,
              }}
            >
              <Text style={{ flex: 1, color: p.ink, fontSize: 14.5 }}>{COMPETENCY_LABELS_RO[k]}</Text>
              <Pill kind="level">{result.levels[k]}</Pill>
            </View>
          ))}
        </Card>
        <H2>Principalele 5 probleme</H2>
        <Card>
          {result.topProblems.map((prob, i) => (
            <P key={i} style={{ marginVertical: 6 }}>
              {i + 1}. {prob}
            </P>
          ))}
        </Card>
        <H2>Planul recomandat</H2>
        <Card>
          <P>{result.recommendedPlanRo}</P>
        </Card>
        <ButtonRow>
          <Button title="Începe programul →" variant="primary" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  // ---------- Intro ----------
  if (stageIdx === -1) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="graduation" size={24} />
          <H1 style={{ marginVertical: 0 }}>Testul de nivel</H1>
        </View>
        <Muted>
          Durează 10–15 minute și are 7 etape — vorbite, nu bifate. La final primești nivelul CEFR pe 5 competențe,
          principalele 5 probleme și planul recomandat.
        </Muted>
        <Card>
          {STAGES.map((s, i) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 9,
                borderBottomWidth: i < STAGES.length - 1 ? 1 : 0,
                borderBottomColor: p.border,
              }}
            >
              <Text style={{ width: 22, textAlign: 'center', color: p.muted, fontWeight: '700' }}>{i + 1}</Text>
              <Text style={{ color: p.ink, fontSize: 14.5 }}>{s.titleRo}</Text>
            </View>
          ))}
        </Card>
        <ButtonRow>
          <Button title="Începe testul" variant="primary" onPress={startTest} disabled={!hasOpenRouterKey()} />
          <Button title="Mai târziu" variant="ghost" onPress={() => router.replace('/')} />
        </ButtonRow>
      </Screen>
    );
  }

  // ---------- Evaluare finală ----------
  if (evaluating || stageIdx >= STAGES.length) {
    return (
      <Screen>
        <H1>Se evaluează…</H1>
        {error ? (
          <Banner kind="error">{error}</Banner>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <Muted>Analizez toate etapele testului. Durează ~30 de secunde.</Muted>
          </View>
        )}
      </Screen>
    );
  }

  // ---------- Etapa de pronunție ----------
  if (stage?.id === 'pron') {
    const sentence = LEVEL_TEST_PRON_SENTENCES[pronIdx];
    const done = pronScores.length >= LEVEL_TEST_PRON_SENTENCES.length;
    return (
      <Screen>
        <StageHeader idx={stageIdx} onNext={nextStage} nextLabel={done ? 'Continuă' : 'Sari peste'} timeLeft={Math.max(0, stage.seconds - stageElapsed)} />
        <Muted>
          Repetă propozițiile cu voce tare ({pronScores.length}/{LEVEL_TEST_PRON_SENTENCES.length}):
        </Muted>
        {error ? <Banner kind="error">{error}</Banner> : null}
        {!done && (
          <Card>
            <Text style={{ fontSize: 18.5, color: p.ink, lineHeight: 27 }}>{sentence}</Text>
            <ButtonRow style={{ marginBottom: 0 }}>
              <Button title="Ascultă" icon="volume" onPress={() => void speak(sentence, 0.95)} />
              <Button
                title={recording ? 'Oprește' : pronBusy ? 'Se evaluează…' : 'Repetă'}
                variant={recording ? 'danger' : 'primary'}
                icon={pronBusy ? undefined : recording ? 'stop' : 'mic'}
                busy={pronBusy}
                onPress={pronRecord}
                disabled={pronBusy}
              />
            </ButtonRow>
          </Card>
        )}
        {pronScores.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
            {pronScores.map((s, i) => (
              <View
                key={i}
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: s >= 80 ? p.successSoft : s >= 60 ? p.warnSoft : p.dangerSoft,
                }}
              >
                <Text style={{ fontWeight: '600', fontSize: 14, color: s >= 80 ? p.success : s >= 60 ? p.warnInk : p.danger }}>
                  {i + 1}: {s}%
                </Text>
              </View>
            ))}
          </View>
        )}
        {done && <Banner kind="info">Etapa de pronunție e gata — continuă la conversația liberă.</Banner>}
        {timeUpPrompt && (
          <TimeUpModal stepTitle={stage.titleRo} nextLabel="Etapa următoare →" onStay={stayInStage} onNext={advanceFromPrompt} />
        )}
      </Screen>
    );
  }

  // ---------- Etapele conversaționale ----------
  return (
    <Screen scroll={false} style={{ width: '100%', maxWidth: 430, alignSelf: 'center' }}>
      <StageHeader
        idx={stageIdx}
        onNext={nextStage}
        nextLabel={stageIdx === STAGES.length - 1 ? 'Încheie testul' : 'Etapa următoare →'}
        timeLeft={Math.max(0, (stage?.seconds ?? 0) - stageElapsed)}
      />
      {stage?.id === 'picture' && <OfficePicture />}
      {stage?.id === 'listening' && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 13,
            paddingVertical: 11,
            paddingHorizontal: 14,
            marginVertical: 10,
            backgroundColor: p.primarySoft,
          }}
        >
          <Text style={{ flex: 1, color: p.primaryDeep, fontSize: 13.5 }}>
            Mesajul audio {listeningPlayed > 0 ? 'a fost redat' : 'se redă'} — răspunde la întrebări din ce ai auzit.
          </Text>
          <Button
            title="Reascultă"
            small
            icon="repeat"
            onPress={() => {
              void speak(LISTENING_PASSAGE.text, 0.95);
              setListeningPlayed((n) => n + 1);
            }}
          />
        </View>
      )}
      <ChatView
        turns={chat.turns}
        busy={chat.busy}
        interim={chat.interim}
        hints={[]}
        error={chat.error || error}
        onMic={chat.micPress}
        onSend={chat.sendUserText}
        showMistakeTags={false}
        handsFree={chat.handsFree}
        onToggleHandsFree={() => chat.setHandsFree(!chat.handsFree)}
        contextLabel={`Test de nivel · ${stage?.titleRo ?? 'Conversație'}`}
      />
      {timeUpPrompt && stage && (
        <TimeUpModal
          stepTitle={stage.titleRo}
          nextLabel={stageIdx === STAGES.length - 1 ? 'Încheie testul' : 'Etapa următoare →'}
          onStay={stayInStage}
          onNext={advanceFromPrompt}
        />
      )}
    </Screen>
  );
}

function StageHeader({ idx, onNext, nextLabel, timeLeft }: { idx: number; onNext: () => void; nextLabel: string; timeLeft: number }) {
  return (
    <TutorSessionHeader
      title={STAGES[idx].titleRo}
      stepLabel={`${idx + 1} din ${STAGES.length}`}
      detail="Test de nivel · evaluare adaptivă"
      timeLabel={`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
      currentStep={idx + 1}
      totalSteps={STAGES.length}
      actionLabel={nextLabel.replace(' testul', '').replace('Etapa următoare →', 'Următoarea')}
      onAction={onNext}
    />
  );
}

/** Imaginea pentru descrierea vizuală (§7.3) — scenă de birou, SVG inclus. */
function OfficePicture() {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.card, borderWidth: 1, borderColor: p.border, borderRadius: 18, padding: 8, marginVertical: 8 }}>
      <View style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Svg viewBox="0 0 400 180" width="100%" height={160}>
          <Rect width="400" height="180" fill="#eef0ff" />
          <Rect x="0" y="140" width="400" height="40" fill="#d8dcf5" />
          <Rect x="280" y="20" width="80" height="60" rx="4" fill="#bfd7ff" stroke="#8aa8e8" />
          <Circle cx="320" cy="45" r="12" fill="#ffd166" />
          <Rect x="40" y="90" width="120" height="10" fill="#a78bfa" />
          <Rect x="50" y="100" width="8" height="40" fill="#8b5cf6" />
          <Rect x="140" y="100" width="8" height="40" fill="#8b5cf6" />
          <Rect x="60" y="60" width="35" height="28" rx="3" fill="#1d2036" />
          <Rect x="100" y="60" width="35" height="28" rx="3" fill="#1d2036" />
          <Circle cx="85" cy="55" r="14" fill="#f4b183" />
          <Rect x="72" y="68" width="26" height="24" rx="6" fill="#5b5bd6" />
          <Circle cx="300" cy="95" r="12" fill="#f4b183" />
          <Rect x="288" y="106" width="24" height="30" rx="6" fill="#12b76a" />
          <Rect x="308" y="112" width="12" height="8" rx="2" fill="#fff" stroke="#b45309" />
          <Rect x="200" y="110" width="40" height="26" rx="4" fill="#9aa0b8" />
          <Rect x="205" y="102" width="30" height="8" fill="#fff" stroke="#9aa0b8" />
          <Rect x="196" y="140" width="14" height="10" fill="#fff" transform="rotate(12 196 140)" />
          <Rect x="216" y="144" width="14" height="10" fill="#fff" transform="rotate(-9 216 144)" />
          <Circle cx="368" cy="30" r="14" fill="#fff" stroke="#5a6078" />
          <Line x1="368" y1="30" x2="368" y2="21" stroke="#5a6078" strokeWidth="2" />
          <Line x1="368" y1="30" x2="375" y2="30" stroke="#5a6078" strokeWidth="2" />
          <Ellipse cx="100" cy="152" rx="26" ry="10" fill="#b08968" />
          <Circle cx="122" cy="146" r="7" fill="#b08968" />
        </Svg>
      </View>
      <Tiny style={{ textAlign: 'center', marginTop: 6 }}>Descrie ce se întâmplă în imagine.</Tiny>
    </View>
  );
}
