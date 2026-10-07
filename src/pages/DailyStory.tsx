import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../types';
import { addXp, bumpActivity, getProfile, todayStr } from '../db/db';
import { Recorder } from '../audio/recorder';
import { speak } from '../audio/tts';
import { transcribe } from '../api/stt';
import { Icon } from '../components/Icon';
import { adaptEpisode, preferredStorySeries, type StorySeries } from '../microlearning/stories';
import { getStoryProgress, saveStoryProgress } from '../microlearning/state';
import type { StoryProgress } from '../microlearning/types';

type Stage = 'listen' | 'question' | 'review' | 'done';

export default function DailyStory() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [series, setSeries] = useState<StorySeries | null>(null);
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [stage, setStage] = useState<Stage>('listen');
  const [played, setPlayed] = useState(false);
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
  }, []);

  const episode = useMemo(() => {
    if (!profile || !series || !progress) return null;
    return adaptEpisode(series, progress.nextEpisode, profile.currentLevel);
  }, [profile, series, progress]);

  function playStory() {
    if (!episode) return;
    setPlayed(true);
    void speak(episode.text, profile?.currentLevel === 'A1' ? 0.82 : profile?.currentLevel === 'A2' ? 0.88 : 0.96);
    setStage('question');
  }

  function answerQuestion(option: string) {
    setSelected(option);
    setStage('review');
  }

  async function toggleSummary() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setTranscript(text);
        await bumpActivity('speakingSec', Math.max(1, Math.round((text.match(/[A-Za-z']+/g)?.length ?? 0) / 2))).catch(() => {});
      } catch (reason: any) {
        setError(`Nu am putut transcrie rezumatul: ${String(reason?.message ?? reason)}`);
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

  if (!profile || !series || !progress || !episode) return <div className="page"><p><span className="spinner" /> Se pregătește episodul…</p></div>;

  if (stage === 'done') {
    const tomorrowIndex = progress.nextEpisode % series.episodes.length;
    return (
      <div className="page story-page">
        <div className="card story-done">
          <Icon name="checkCircle" size={46} />
          <h1>Episodul de azi este gata</h1>
          <p className="muted">Ai păstrat firul poveștii și ai exersat înțelegerea în context.</p>
          <div className="story-next"><span className="tiny">MÂINE</span><strong>{series.episodes[tomorrowIndex].title}</strong></div>
          <div className="btn-row" style={{ justifyContent: 'center' }}><button onClick={() => navigate('/')}>Înapoi acasă</button><button className="btn-primary" onClick={() => navigate('/learn')}>Antrenamentul de 3 minute</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page story-page">
      <div className="micro-head"><div><h1><Icon name="book" size={24} />{series.title}</h1><p className="tiny">Episodul {progress.nextEpisode + 1}/{series.episodes.length} · {series.description}</p></div><span className="level-pill">{profile.currentLevel}</span></div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card story-card">
        <span className="badge">Episodul zilei</span>
        <h2>{episode.title}</h2>

        {stage === 'listen' && (
          <div className="story-listen">
            <div className="story-cover"><Icon name="headphones" size={54} /></div>
            <p>Ascultă prima dată fără text. Povestea este adaptată nivelului tău.</p>
            <button className="btn-primary" onClick={playStory}><Icon name="play" />Ascultă episodul</button>
          </div>
        )}

        {(stage === 'question' || stage === 'review') && (
          <>
            <button className="listen-primary" onClick={playStory}><Icon name="volume" />Ascultă din nou</button>
            <h3>{episode.question}</h3>
            <div className="micro-options">
              {episode.options.map((option) => (
                <button
                  key={option}
                  disabled={stage === 'review'}
                  className={stage === 'review' ? option === episode.answer ? 'story-answer-correct' : option === selected ? 'story-answer-wrong' : '' : ''}
                  onClick={() => answerQuestion(option)}
                >{option}</button>
              ))}
            </div>
          </>
        )}

        {stage === 'review' && (
          <div className="story-review">
            <div className={selected === episode.answer ? 'success-banner' : 'info-banner'}>{selected === episode.answer ? '✓ Ai înțeles detaliul-cheie.' : `Răspunsul corect: ${episode.answer}`}</div>
            <p className="story-text">{episode.text}</p>
            <div className="chip-row">{episode.targetPhrases.map((phrase) => <span className="chip selected" key={phrase}>{phrase}</span>)}</div>
            <h3><Icon name="mic" />{episode.speakPrompt}</h3>
            <button className={recording ? 'btn-danger mic-pulse' : ''} onClick={toggleSummary}><Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Oprește' : transcript ? 'Înregistrează din nou' : 'Răspunde vocal (opțional)'}</button>
            {transcript && <div className="voice-transcript">“{transcript}”</div>}
            <button className="btn-primary" onClick={finishEpisode}>Finalizează episodul</button>
          </div>
        )}
        {!played && stage !== 'listen' && <p className="tiny">Pornește audio-ul înainte de întrebare.</p>}
      </div>
    </div>
  );
}
