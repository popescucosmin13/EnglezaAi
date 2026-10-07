// Randarea unei conversații vocale (folosită de Talk, DailySession, LevelTest).

import { useEffect, useRef, useState } from 'react';
import type { Utterance, Profile } from '../types';
import type { ChatBusy } from '../hooks/useVoiceChat';
import WordExplainModal from './WordExplainModal';
import MessageHelpModal, { type MessageHelpMode } from './MessageHelpModal';
import DontKnowModal from './DontKnowModal';
import { isAudioUnlocked, isNativeVoicePrimed, requiresNativeVoiceActivation, speak, unlockAudio } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { bumpActivity, addXp } from '../db/db';
import { Icon } from './Icon';
import DismissibleTip from './DismissibleTip';

function ClickableWords({ text, onWord }: { text: string; onWord: (word: string) => void }) {
  return <>{text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/g).map((part, i) =>
    /^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(part) ? (
      <button
        type="button"
        className="clickable-word"
        key={`${part}-${i}`}
        onClick={(e) => { e.stopPropagation(); onWord(part); }}
        title={`Explică „${part}”`}
      >
        {part}
      </button>
    ) : <span key={`${part}-${i}`}>{part}</span>
  )}</>;
}

function voiceStatus(busy: ChatBusy, tutorName: string) {
  if (busy === 'recording') return { title: 'Te ascult…', subtitle: 'Vorbește acum', presence: 'ascultă în timp real' };
  if (busy === 'transcribing') return { title: 'Îți transcriu răspunsul…', subtitle: 'Durează doar o clipă', presence: 'transcrie răspunsul' };
  if (busy === 'thinking') return { title: `${tutorName} se gândește…`, subtitle: 'Pregătește următoarea întrebare', presence: 'pregătește răspunsul' };
  if (busy === 'speaking') return { title: `${tutorName} răspunde…`, subtitle: 'Ascultă și continuă natural', presence: 'vorbește acum' };
  if (busy === 'ending') return { title: 'Pregătesc raportul…', subtitle: 'Salvez progresul conversației', presence: 'analizează sesiunea' };
  return { title: 'E rândul tău', subtitle: 'Apasă microfonul și vorbește', presence: 'gata să te asculte' };
}

export default function ChatView({
  turns,
  busy,
  interim,
  hints,
  error,
  onMic,
  onSend,
  onOpenMirror,
  analyzingTs,
  showMistakeTags,
  disabled,
  handsFree,
  onToggleHandsFree,
  profile,
  onPhraseLearned,
  tutorName = 'Emma',
  contextLabel,
  showTips = true,
  showSoundUnlock = true,
}: {
  turns: Utterance[];
  busy: ChatBusy;
  interim: string;
  hints: string[];
  error: string;
  onMic: () => void;
  onSend: (text: string) => void;
  onOpenMirror?: (turn: Utterance) => void;
  /** ts-ul turei analizate acum la cerere (Mirror) — arată un spinner discret pe acea bulă. */
  analyzingTs?: number | null;
  showMistakeTags?: boolean;
  disabled?: boolean;
  handsFree?: boolean;
  onToggleHandsFree?: () => void;
  /** Activează „Nu știu cum să spun" (§P1). */
  profile?: Profile;
  onPhraseLearned?: (phrase: string) => void;
  tutorName?: string;
  contextLabel?: string;
  showTips?: boolean;
  showSoundUnlock?: boolean;
}) {
  const [text, setText] = useState('');
  const [wordToExplain, setWordToExplain] = useState<{ word: string; sentence: string } | null>(null);
  const [messageHelp, setMessageHelp] = useState<{
    mode: MessageHelpMode;
    turn: Utterance;
    nextTeacherText?: string;
    context: string;
  } | null>(null);
  const [soundReady, setSoundReady] = useState(
    requiresNativeVoiceActivation() ? isNativeVoicePrimed() : isAudioUnlocked()
  );
  const [dontKnow, setDontKnow] = useState(false);
  // shadowing pe replica profesorului (§P1): redă + repetă aproape simultan
  const [shadowingTs, setShadowingTs] = useState<number | null>(null);
  const [shadowScores, setShadowScores] = useState<Record<number, number>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const shadowRecorder = useRef(new Recorder());
  const messagesRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function shadowTurn(t: Utterance) {
    if (shadowingTs === t.ts) {
      setShadowingTs(null);
      try {
        const blob = await shadowRecorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(t.text));
        const score = sttDiffAssessment(t.text, text).accuracyScore;
        setShadowScores((s) => ({ ...s, [t.ts]: score }));
        await bumpActivity('shadowPhrases', 1);
        await addXp(score >= 80 ? 8 : 4);
      } catch {
        /* transcriere eșuată — fără scor */
      }
      return;
    }
    try {
      await shadowRecorder.current.start();
      setShadowingTs(t.ts);
      void speak(t.text, 1); // vorbești peste model, aproape simultan
    } catch {
      /* fără microfon */
    }
  }

  useEffect(() => {
    if (turns.length <= 2) messagesRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    else endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns]);

  useEffect(() => {
    const audioReady = () => { if (!requiresNativeVoiceActivation()) setSoundReady(true); };
    const nativeReady = () => setSoundReady(true);
    window.addEventListener('engleza-audio-unlocked', audioReady);
    window.addEventListener('engleza-native-voice-primed', nativeReady);
    return () => {
      window.removeEventListener('engleza-audio-unlocked', audioReady);
      window.removeEventListener('engleza-native-voice-primed', nativeReady);
    };
  }, []);

  async function activateSound() {
    const ready = await unlockAudio(true);
    setSoundReady(ready);
    const lastTeacherMessage = [...turns].reverse().find((turn) => turn.role === 'ai');
    if (ready && lastTeacherMessage) await speak(lastTeacherMessage.text, 0.92);
  }

  async function replayTeacher(text: string) {
    await unlockAudio(false);
    setSoundReady(true);
    await speak(text, 0.92);
  }

  function sendWritten() {
    if (!text.trim() || !['idle', 'speaking'].includes(busy)) return;
    onSend(text.trim());
    setText('');
    setComposerOpen(false);
  }

  const micIcon = busy === 'recording'
    ? <Icon name="stop" size={24} />
    : busy === 'transcribing' || busy === 'thinking' || busy === 'ending'
      ? <Icon name="loader" size={24} className="icon-spin" />
      : <Icon name="mic" size={24} />;
  const micBusy = busy === 'transcribing' || busy === 'thinking' || busy === 'ending';
  const voiceCopy = voiceStatus(busy, tutorName);

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {showSoundUnlock && !soundReady && turns.some((t) => t.role === 'ai') && (
        <button type="button" className="sound-unlock-banner" onClick={activateSound}><Icon name="volume" />Activează sunetul</button>
      )}
      {showTips && turns.some((t) => t.role === 'ai') && (
        <DismissibleTip id="chat-words" className="word-help-tip">
          <Icon name="lightbulb" size={14} /> Apasă pe un cuvânt sau folosește „Explică” și „Tradu”.
        </DismissibleTip>
      )}
      {showTips && handsFree && (
        <DismissibleTip id="handsfree">
          <Icon name="car" size={15} /> Hands-free activ — vorbește după profesor; înregistrarea se oprește singură la pauză (voce pe Google TTS pentru Bluetooth).
        </DismissibleTip>
      )}
      <div className="tutor-presence">
        <div className="tutor-avatar-wrap">
          <img src="/tutor-emma.png" alt="" className="tutor-avatar" />
          <span className="tutor-online-dot" aria-hidden="true" />
        </div>
        <div className="tutor-presence-copy">
          <div><strong>{tutorName}</strong><span> · tutorele tău</span><Icon name="audio" size={18} /></div>
          <small>{contextLabel ?? voiceCopy.presence}</small>
        </div>
      </div>
      <div className="chat-messages" ref={messagesRef}>
        {turns.map((t, turnIndex) => {
          const errCount = t.analysis?.errors.filter((e) => !e.disputed).length ?? 0;
          const nextTeacherText = t.role === 'user' ? turns.slice(turnIndex + 1).find((next) => next.role === 'ai')?.text : undefined;
          const context = turns.slice(Math.max(0, turnIndex - 3), Math.min(turns.length, turnIndex + 2))
            .map((turn) => `${turn.role === 'user' ? 'Learner' : 'Teacher'}: ${turn.text}`).join('\n');
          const openMessageHelp = (mode: MessageHelpMode) => setMessageHelp({ mode, turn: t, nextTeacherText, context });
          return (
            <div key={t.ts} className={`message-group ${t.role}`}>
              <div
                className={`bubble ${t.role === 'user' ? 'user' : 'ai'} ${t.analysis ? 'has-analysis' : ''}`}
                onClick={() => t.role === 'user' && analyzingTs !== t.ts && onOpenMirror?.(t)}
                title={t.role === 'user' && onOpenMirror ? 'Apasă pentru English Mirror' : undefined}
              >
                {t.role === 'ai'
                  ? <ClickableWords text={t.text} onWord={(word) => setWordToExplain({ word, sentence: t.text })} />
                  : t.text}
                {analyzingTs === t.ts && <span className="spinner" style={{ marginLeft: 8 }} />}
              </div>
              <div className="message-actions">
                <button type="button" onClick={() => openMessageHelp('explain')}>
                  <Icon name={t.role === 'user' ? 'help' : 'lightbulb'} size={15} />{t.role === 'user' ? 'Ce am greșit?' : 'Explică'}
                </button>
                <button type="button" onClick={() => openMessageHelp('translate')}><Icon name="languages" size={15} />Tradu</button>
                {t.role === 'ai' && <button type="button" onClick={() => replayTeacher(t.text)}><Icon name="volume" size={15} />Ascultă</button>}
                {t.role === 'ai' && t.text.length <= 140 && (
                  <button type="button" className={shadowingTs === t.ts ? 'btn-danger' : ''} onClick={() => { void unlockAudio(false); void shadowTurn(t); }}>
                    <Icon name={shadowingTs === t.ts ? 'stop' : 'headphones'} size={15} />{shadowingTs === t.ts ? 'Gata' : 'Shadowing'}
                  </button>
                )}
                {shadowScores[t.ts] != null && (
                  <span className={shadowScores[t.ts] >= 80 ? 'ws-good' : 'ws-mid'} style={{ padding: '2px 8px', borderRadius: 8, fontSize: '0.75rem' }}>
                    {shadowScores[t.ts]}%
                  </span>
                )}
              </div>
              {t.role === 'user' && showMistakeTags && t.analysis && (
                <div className="mistake-tag" onClick={() => onOpenMirror?.(t)}>
                  {errCount === 0
                    ? <><Icon name="check" size={14} /> corect</>
                    : <>{errCount} {errCount === 1 ? 'greșeală' : 'greșeli'} · vezi Mirror <Icon name="arrowUpRight" size={14} /></>}
                </div>
              )}
            </div>
          );
        })}
        {hints.length > 0 && (
          <div className="hints-box">
            <Icon name="lightbulb" size={16} /> {hints.map((h, i) => (
              <div key={i}>• {h}</div>
            ))}
          </div>
        )}
        {interim && busy === 'recording' && <div className="bubble user interim">{interim}</div>}
        {busy === 'thinking' && (
          <div className="bubble ai">
            <span className="spinner" />
          </div>
        )}
        <div ref={endRef} />
      </div>
      {composerOpen ? (
        <div className="tutor-composer">
          <input
            autoFocus
            aria-label="Răspuns scris"
            placeholder="Scrie răspunsul în engleză…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendWritten(); }}
            disabled={disabled || !['idle', 'speaking'].includes(busy)}
          />
          <button type="button" className="btn-primary" onClick={sendWritten} disabled={!text.trim() || disabled || !['idle', 'speaking'].includes(busy)}>
            Trimite
          </button>
        </div>
      ) : null}

      <div className="chat-controls tutor-chat-controls">
        {profile && (
          <button
            type="button"
            className="tutor-control-button"
            onClick={() => setDontKnow(true)}
            title="Nu știu cum să spun ceva — cere structura în engleză"
            aria-label="Ajutor pentru exprimare"
          >
            <Icon name="help" size={21} />
            <span>Ajutor</span>
          </button>
        )}
        {onToggleHandsFree && (
          <button
            type="button"
            className={`tutor-control-button ${handsFree ? 'on' : ''}`}
            onClick={() => { void unlockAudio(false); onToggleHandsFree(); }}
            title="Mod mașină: vorbește fără să apeși microfonul"
            aria-pressed={handsFree}
            aria-label={handsFree ? 'Dezactivează mâini libere' : 'Activează mâini libere'}
          >
            <Icon name="car" size={21} />
            <span>Mâini libere</span>
          </button>
        )}
        <button
          className={`mic-btn ${busy === 'recording' ? 'recording' : ''} ${busy === 'transcribing' || busy === 'thinking' ? 'busy' : ''}`}
          onClick={() => { void unlockAudio(false); onMic(); }}
          disabled={disabled || busy === 'ending'}
          aria-label={busy === 'recording' ? 'Oprește înregistrarea' : micBusy ? voiceCopy.title : 'Începe să vorbești'}
        >
          {micIcon}
        </button>
        <button type="button" className={`tutor-write-button ${composerOpen ? 'active' : ''}`} onClick={() => setComposerOpen((open) => !open)}>
          <Icon name="message" size={20} />
          <span>Scrie răspunsul</span>
        </button>
      </div>
      {wordToExplain && (
        <WordExplainModal
          word={wordToExplain.word}
          sentence={wordToExplain.sentence}
          onClose={() => setWordToExplain(null)}
        />
      )}
      {messageHelp && (
        <MessageHelpModal
          mode={messageHelp.mode}
          role={messageHelp.turn.role}
          text={messageHelp.turn.text}
          nextTeacherText={messageHelp.nextTeacherText}
          context={messageHelp.context}
          onClose={() => setMessageHelp(null)}
        />
      )}
      {dontKnow && profile && (
        <DontKnowModal
          profile={profile}
          context={turns.slice(-4).map((t) => `${t.role === 'user' ? 'Learner' : 'Teacher'}: ${t.text}`).join('\n')}
          onLearned={onPhraseLearned}
          onClose={() => setDontKnow(false)}
        />
      )}
    </>
  );
}
