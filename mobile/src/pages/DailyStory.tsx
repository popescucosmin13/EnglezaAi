import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Profile } from '../types';
import { addXp, bumpActivity, getProfile, todayStr } from '../db/db';
import { Recorder } from '../audio/recorder';
import { speak } from '../audio/tts';
import { transcribe } from '../api/stt';
import { Icon } from '../components/Icon';
import { adaptEpisode, preferredStorySeries, type StorySeries } from '../microlearning/stories';
import { getStoryProgress, saveStoryProgress } from '../microlearning/state';
import type { StoryProgress } from '../microlearning/types';
import { Banner, Button, ButtonRow, Card, Chip, ChipRow, H1, H2, H3, Muted, Pill, P, Screen, Spinner, Tiny } from '../ui';
import { usePalette } from '../theme';

type Stage = 'listen' | 'question' | 'review' | 'done';

export default function DailyStory() {
  const p = usePalette();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [series, setSeries] = useState<StorySeries | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [stage, setStage] = useState<Stage>('listen');
  const [selected, setSelected] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const recorder = useRef(new Recorder());

  useEffect(() => {
    getProfile().then(async (nextProfile) => {
      const nextSeries = preferredStorySeries(nextProfile);
      const nextProgress = await getStoryProgress(nextSeries.id);
      setProfile(nextProfile);
      setSeries(nextSeries);
      setProgress(nextProgress);
      if (nextProgress.lastCompletedDate === todayStr()) setStage('done');
    }).catch((reason) => setError(String(reason?.message ?? reason)));
    return () => recorder.current.cancel();
  }, []);

  const episode = useMemo(() => {
    if (!profile || !series || !progress) return null;
    return adaptEpisode(series, progress.nextEpisode, profile.currentLevel);
  }, [profile, series, progress]);

  function playStory() {
    if (!episode) return;
    void speak(episode.text, profile?.currentLevel === 'A1' ? 0.82 : profile?.currentLevel === 'A2' ? 0.88 : 0.96);
    setStage('question');
  }

  async function toggleSummary() {
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        try {
          const { text } = await transcribe(audio);
          setTranscript(text);
          await bumpActivity('speakingSec', Math.max(1, Math.round((text.match(/[A-Za-z']+/g)?.length ?? 0) / 2))).catch(() => {});
        } finally {
          await audio.dispose();
        }
      } catch (reason: any) {
        setError(`Nu am putut transcrie rezumatul: ${String(reason?.message ?? reason)}`);
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setError('Nu am acces la microfon. Verifică permisiunea aplicației.');
    }
  }

  async function finishEpisode() {
    if (!episode || !progress || !series) return;
    const next: StoryProgress = {
      ...progress,
      nextEpisode: (progress.nextEpisode + 1) % series.episodes.length,
      lastCompletedDate: todayStr(),
      completed: [...progress.completed.filter((id) => id !== episode.id), episode.id].slice(-50),
      correctAnswers: progress.correctAnswers + (selected === episode.answer ? 1 : 0),
      spokenSummaries: progress.spokenSummaries + (transcript ? 1 : 0),
    };
    await saveStoryProgress(next);
    await addXp(selected === episode.answer ? (transcript ? 15 : 10) : (transcript ? 10 : 5)).catch(() => {});
    setProgress(next);
    setStage('done');
  }

  if (!profile || !series || !progress || !episode) {
    return <Screen><View style={{ minHeight: 360, alignItems: 'center', justifyContent: 'center' }}>{error ? <Banner kind="error">{error}</Banner> : <Spinner size="large" />}</View></Screen>;
  }

  if (stage === 'done') {
    const tomorrowIndex = progress.nextEpisode % series.episodes.length;
    return (
      <Screen>
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: p.successSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkCircle" size={44} color={p.success} />
          </View>
          <H1 style={{ textAlign: 'center', marginTop: 16 }}>Episodul de azi este gata</H1>
          <Muted style={{ textAlign: 'center' }}>Ai păstrat firul poveștii și ai exersat înțelegerea în context.</Muted>
          <View style={{ width: '100%', backgroundColor: p.primarySoft, borderRadius: 16, padding: 16, marginTop: 20 }}>
            <Tiny>MÂINE</Tiny>
            <Text style={{ color: p.primaryDeep, fontWeight: '800', fontSize: 17, marginTop: 4 }}>{series.episodes[tomorrowIndex].title}</Text>
          </View>
          <ButtonRow style={{ justifyContent: 'center' }}>
            <Button title="Înapoi acasă" onPress={() => router.replace('/')} />
            <Button title="Antrenamentul de 3 minute" variant="primary" onPress={() => router.replace('/learn')} />
          </ButtonRow>
        </Card>
      </Screen>
    );
  }

  const isCorrect = selected === episode.answer;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <H1>{series.title}</H1>
          <Tiny>Episodul {progress.nextEpisode + 1}/{series.episodes.length} · {series.description}</Tiny>
        </View>
        <Pill kind="level">{profile.currentLevel}</Pill>
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Card style={{ padding: 20 }}>
        <Pill kind="badge">Episodul zilei</Pill>
        <H2>{episode.title}</H2>
        {stage === 'listen' ? (
          <View style={{ alignItems: 'center', paddingVertical: 18 }}>
            <View style={{ width: 126, height: 126, borderRadius: 32, backgroundColor: p.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="headphones" size={58} color={p.primaryDeep} />
            </View>
            <P style={{ textAlign: 'center', marginVertical: 18 }}>Ascultă prima dată fără text. Povestea este adaptată nivelului tău.</P>
            <Button title="Ascultă episodul" icon="play" variant="primary" onPress={playStory} />
          </View>
        ) : null}

        {(stage === 'question' || stage === 'review') ? (
          <>
            <Button title="Ascultă din nou" icon="volume" onPress={playStory} />
            <H3>{episode.question}</H3>
            <View style={{ gap: 8, marginTop: 8 }}>
              {episode.options.map((option) => {
                const reviewed = stage === 'review';
                const right = reviewed && option === episode.answer;
                const wrong = reviewed && option === selected && !right;
                return (
                  <Button
                    key={option}
                    title={option}
                    disabled={reviewed}
                    variant={right ? 'success' : wrong ? 'danger' : 'default'}
                    onPress={() => { setSelected(option); setStage('review'); }}
                    style={{ justifyContent: 'flex-start' }}
                  />
                );
              })}
            </View>
          </>
        ) : null}

        {stage === 'review' ? (
          <View style={{ marginTop: 14 }}>
            <Banner kind={isCorrect ? 'success' : 'info'}>{isCorrect ? 'Ai înțeles detaliul-cheie.' : `Răspunsul corect: ${episode.answer}`}</Banner>
            <View style={{ backgroundColor: p.bgSoft, borderRadius: 16, padding: 16 }}><P>{episode.text}</P></View>
            <ChipRow>{episode.targetPhrases.map((phrase) => <Chip key={phrase} label={phrase} selected />)}</ChipRow>
            <H3>{episode.speakPrompt}</H3>
            <Button title={recording ? 'Oprește' : transcript ? 'Înregistrează din nou' : 'Răspunde vocal (opțional)'} icon={recording ? 'stop' : 'mic'} variant={recording ? 'danger' : 'default'} onPress={toggleSummary} />
            {transcript ? <View style={{ borderLeftWidth: 3, borderLeftColor: p.primary, paddingLeft: 12, marginTop: 12 }}><Muted>„{transcript}”</Muted></View> : null}
            <Button title="Finalizează episodul" variant="primary" onPress={finishEpisode} style={{ marginTop: 16 }} />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
