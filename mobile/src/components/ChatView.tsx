// Randarea unei conversații vocale (folosită de Talk, DailySession, LevelTest) — portat de pe web.
// Bannerul „Activează sunetul" dispare (nativ nu există autoplay policy).

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Utterance, Profile } from '../types';
import type { ChatBusy } from '../hooks/useVoiceChat';
import WordExplainModal from './WordExplainModal';
import MessageHelpModal, { type MessageHelpMode } from './MessageHelpModal';
import DontKnowModal from './DontKnowModal';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { bumpActivity, addXp } from '../db/db';
import { Icon } from './Icon';
import DismissibleTip from './DismissibleTip';
import { Banner, Spinner } from '../ui';
import { usePalette, type Palette } from '../theme';

function ClickableWords({ text, onWord, color }: { text: string; onWord: (word: string) => void; color: string }) {
  return (
    <Text style={{ color, fontSize: 15.5, lineHeight: 22 }}>
      {text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/g).map((part, i) =>
        /^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(part) ? (
          <Text key={`${part}-${i}`} onPress={() => onWord(part)} suppressHighlighting>
            {part}
          </Text>
        ) : (
          <Text key={`${part}-${i}`}>{part}</Text>
        )
      )}
    </Text>
  );
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
}) {
  const p = usePalette();
  const st = styles(p);
  const [text, setText] = useState('');
  const [wordToExplain, setWordToExplain] = useState<{ word: string; sentence: string } | null>(null);
  const [messageHelp, setMessageHelp] = useState<{
    mode: MessageHelpMode;
    turn: Utterance;
    nextTeacherText?: string;
    context: string;
  } | null>(null);
  const [dontKnow, setDontKnow] = useState(false);
  // shadowing pe replica profesorului (§P1): redă + repetă aproape simultan
  const [shadowingTs, setShadowingTs] = useState<number | null>(null);
  const [shadowScores, setShadowScores] = useState<Record<number, number>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const shadowRecorder = useRef(new Recorder());
  const scrollRef = useRef<ScrollView>(null);
  const [pulse] = useState(() => new Animated.Value(0));

  async function shadowTurn(t: Utterance) {
    if (shadowingTs === t.ts) {
      setShadowingTs(null);
      try {
        const audio = await shadowRecorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(t.text));
        await audio.dispose();
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
    const timer = setTimeout(() => {
      if (turns.length <= 2) scrollRef.current?.scrollTo({ y: 0, animated: false });
      else scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [turns]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const duration = busy === 'recording' ? 950 : busy === 'thinking' || busy === 'transcribing' ? 1250 : 2100;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [busy, pulse, reduceMotion]);

  async function replayTeacher(text: string) {
    await speak(text, 0.92);
  }

  const micBusy = busy === 'transcribing' || busy === 'thinking' || busy === 'ending';
  const voiceCopy = voiceStatus(busy, tutorName);

  return (
    <View style={{ flex: 1 }}>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {showTips && turns.some((t) => t.role === 'ai') && (
        <DismissibleTip id="chat-words">Apasă pe un cuvânt din replica profesorului sau folosește „Explică” și „Tradu”.</DismissibleTip>
      )}
      {showTips && handsFree && (
        <DismissibleTip id="handsfree">
          Hands-free activ — vorbește după profesor; înregistrarea se oprește singură la pauză.
        </DismissibleTip>
      )}

      <View style={st.tutorPresence}>
        <View>
          <Image source={require('../../assets/images/tutor-emma.png')} style={st.tutorAvatar} />
          <View style={[st.onlineDot, { backgroundColor: p.success, borderColor: p.bg }]} />
        </View>
        <View style={st.tutorCopy}>
          <View style={st.tutorNameRow}>
            <Text style={[st.tutorName, { color: p.ink }]}>{tutorName}</Text>
            <Text style={[st.tutorRole, { color: p.ink2 }]}>· tutorele tău</Text>
            <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }}>
              <Icon name="audio" size={18} color={p.success} strokeWidth={2.4} />
            </Animated.View>
          </View>
          <Text numberOfLines={1} style={[st.contextLabel, { color: p.primary }]}>
            {contextLabel || voiceCopy.presence}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={st.transcript}
        contentContainerStyle={st.transcriptContent}
        showsVerticalScrollIndicator={false}
      >
        {turns.map((t, turnIndex) => {
          const errCount = t.analysis?.errors.filter((e) => !e.disputed).length ?? 0;
          const nextTeacherText = t.role === 'user' ? turns.slice(turnIndex + 1).find((next) => next.role === 'ai')?.text : undefined;
          const context = turns
            .slice(Math.max(0, turnIndex - 3), Math.min(turns.length, turnIndex + 2))
            .map((turn) => `${turn.role === 'user' ? 'Learner' : 'Teacher'}: ${turn.text}`)
            .join('\n');
          const openMessageHelp = (mode: MessageHelpMode) => setMessageHelp({ mode, turn: t, nextTeacherText, context });
          const isUser = t.role === 'user';
          return (
            <View key={t.ts} style={[st.group, isUser ? st.groupUser : st.groupAi]}>
              <Pressable
                onPress={() => isUser && analyzingTs !== t.ts && onOpenMirror?.(t)}
                style={[st.bubble, isUser ? st.bubbleUser : st.bubbleAi]}
              >
                {t.role === 'ai' ? (
                  <ClickableWords text={t.text} color={p.ink} onWord={(word) => setWordToExplain({ word, sentence: t.text })} />
                ) : (
                  <Text style={{ color: p.ink, fontSize: 15.5, lineHeight: 22 }}>{t.text}</Text>
                )}
                {analyzingTs === t.ts && (
                  <View style={{ marginTop: 4 }}>
                    <ActivityIndicator size="small" color={isUser ? p.white : p.primary} />
                  </View>
                )}
              </Pressable>
              <View style={[st.actions, !isUser && st.actionsAi]}>
                <ActionButton
                  icon={isUser ? 'help' : 'lightbulb'}
                  label={isUser ? 'Ce am greșit?' : 'Explică'}
                  onPress={() => openMessageHelp('explain')}
                  p={p}
                  primary={!isUser}
                />
                <ActionButton icon="languages" label="Tradu" onPress={() => openMessageHelp('translate')} p={p} primary={!isUser} />
                {t.role === 'ai' && <ActionButton icon="volume" label="Ascultă" onPress={() => void replayTeacher(t.text)} p={p} primary />}
                {t.role === 'ai' && t.text.length <= 140 && (
                  <ActionButton
                    icon={shadowingTs === t.ts ? 'stop' : 'headphones'}
                    label={shadowingTs === t.ts ? 'Gata' : 'Shadowing'}
                    danger={shadowingTs === t.ts}
                    onPress={() => void shadowTurn(t)}
                    p={p}
                    primary
                  />
                )}
                {shadowScores[t.ts] != null && (
                  <View
                    style={{
                      paddingVertical: 2,
                      paddingHorizontal: 8,
                      borderRadius: 8,
                      backgroundColor: shadowScores[t.ts] >= 80 ? p.successSoft : p.warnSoft,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: shadowScores[t.ts] >= 80 ? p.success : p.warnInk }}>
                      {shadowScores[t.ts]}%
                    </Text>
                  </View>
                )}
              </View>
              {isUser && showMistakeTags && t.analysis && (
                <Pressable onPress={() => onOpenMirror?.(t)} style={[st.mistakeTag, { backgroundColor: errCount === 0 ? p.successSoft : p.dangerSoft }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: errCount === 0 ? p.success : p.danger }}>
                    {errCount === 0 ? '✓ corect' : `${errCount} ${errCount === 1 ? 'greșeală' : 'greșeli'} · vezi Mirror ↗`}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {hints.length > 0 && (
          <View style={[st.hintsBox, { backgroundColor: p.primarySoft }]}>
            {hints.map((h, i) => (
              <Text key={i} style={{ color: p.primaryDeep, fontSize: 13.5 }}>
                • {h}
              </Text>
            ))}
          </View>
        )}
        {interim && busy === 'recording' ? (
          <View style={[st.bubble, st.bubbleUser, { opacity: 0.65, alignSelf: 'flex-end' }]}>
            <Text style={{ color: p.ink, fontStyle: 'italic' }}>{interim}</Text>
          </View>
        ) : null}
        {busy === 'thinking' && (
          <View style={[st.bubble, st.bubbleAi, { alignSelf: 'flex-start' }]}>
            <View style={st.thinkingRow}>
              <Spinner />
              <Text style={[st.thinkingText, { color: p.ink2 }]}>{tutorName} pregătește răspunsul…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {composerOpen ? (
        <View style={st.composerRow}>
          <TextInput
            autoFocus
            placeholder="Scrie răspunsul în engleză…"
            placeholderTextColor={p.muted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => {
              if (text.trim() && (busy === 'idle' || busy === 'speaking')) {
                onSend(text.trim());
                setText('');
                setComposerOpen(false);
              }
            }}
            editable={!disabled && ['idle', 'speaking'].includes(busy)}
            style={[st.input, { backgroundColor: p.card, borderColor: p.borderStrong, color: p.ink }]}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trimite răspunsul"
            disabled={!text.trim() || disabled || !['idle', 'speaking'].includes(busy)}
            onPress={() => {
              if (!text.trim()) return;
              onSend(text.trim());
              setText('');
              setComposerOpen(false);
            }}
            style={({ pressed }) => [
              st.sendButton,
              { backgroundColor: p.primary },
              pressed && { opacity: 0.75 },
              (!text.trim() || disabled || !['idle', 'speaking'].includes(busy)) && { opacity: 0.4 },
            ]}
          >
            <Text style={st.sendButtonText}>Trimite</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={st.controls}>
        {profile && (
          <Pressable accessibilityRole="button" accessibilityLabel="Ajutor pentru exprimare" onPress={() => setDontKnow(true)} style={st.roundBtn}>
            <Icon name="help" size={21} color={p.ink2} />
            <Text style={[st.controlLabel, { color: p.muted }]}>Ajutor</Text>
          </Pressable>
        )}
        {onToggleHandsFree && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={handsFree ? 'Dezactivează mâini libere' : 'Activează mâini libere'}
            onPress={onToggleHandsFree}
            style={[st.roundBtn, handsFree && { backgroundColor: p.primarySoft, borderColor: p.primary, opacity: 1 }]}
          >
            <Icon name="car" size={21} color={handsFree ? p.primaryDeep : p.ink2} />
            <Text style={[st.controlLabel, { color: handsFree ? p.primaryDeep : p.muted }]}>Mâini libere</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={busy === 'recording' ? 'Oprește înregistrarea' : 'Începe să vorbești'}
          onPress={onMic}
          disabled={disabled || busy === 'ending'}
          style={[
            st.micBtn,
            { borderColor: busy === 'recording' ? p.danger : p.primary },
            micBusy && { opacity: 0.55 },
            (disabled || busy === 'ending') && { opacity: 0.4 },
          ]}
        >
          <LinearGradient
            colors={busy === 'recording' ? [p.danger, '#fb7185'] : [p.primary, p.violet]}
            style={st.micGradient}
          >
            {micBusy ? <ActivityIndicator color={p.white} /> : <Icon name={busy === 'recording' ? 'stop' : 'mic'} size={27} color={p.white} />}
          </LinearGradient>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={composerOpen ? 'Închide răspunsul scris' : 'Scrie răspunsul'}
          onPress={() => setComposerOpen((open) => !open)}
          style={[st.writeButton, { backgroundColor: p.card, borderColor: p.border }]}
        >
          <Icon name="message" size={20} color={p.primary} />
          <Text numberOfLines={1} style={[st.writeButtonText, { color: p.ink }]}>{composerOpen ? 'Închide' : 'Scrie răspunsul'}</Text>
        </Pressable>
      </View>
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
    </View>
  );
}

function voiceStatus(busy: ChatBusy, tutorName: string): { title: string; subtitle: string; presence: string } {
  if (busy === 'recording') return { title: 'Te ascult…', subtitle: 'Vorbește acum', presence: 'ascultă în timp real' };
  if (busy === 'transcribing') return { title: 'Îți transcriu răspunsul…', subtitle: 'Durează doar o clipă', presence: 'transcrie răspunsul' };
  if (busy === 'thinking') return { title: `${tutorName} se gândește…`, subtitle: 'Pregătește următoarea întrebare', presence: 'pregătește răspunsul' };
  if (busy === 'speaking') return { title: `${tutorName} răspunde…`, subtitle: 'Ascultă și continuă natural', presence: 'vorbește acum' };
  if (busy === 'ending') return { title: 'Pregătesc raportul…', subtitle: 'Salvez progresul conversației', presence: 'analizează sesiunea' };
  return { title: 'E rândul tău', subtitle: 'Apasă microfonul și vorbește', presence: 'gata să te asculte' };
}

function ActionButton({
  icon,
  label,
  onPress,
  danger,
  primary,
  p,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
  primary?: boolean;
  p: Palette;
}) {
  const color = danger ? p.danger : primary ? p.primary : p.ink2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 6 }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={14} color={color} />
      <Text style={{ fontSize: 11.5, color, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    tutorPresence: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 6, paddingBottom: 8 },
    tutorAvatar: { width: 56, height: 56, borderRadius: 28, opacity: 1 },
    onlineDot: { position: 'absolute', right: -1, bottom: 1, width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
    tutorCopy: { flex: 1, minWidth: 0 },
    tutorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tutorName: { fontSize: 18, lineHeight: 24, fontWeight: '800', letterSpacing: -0.25 },
    tutorRole: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '500' },
    contextLabel: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    transcript: { flex: 1 },
    transcriptContent: { paddingVertical: 8, paddingBottom: 12, gap: 12 },
    group: { maxWidth: '91%', gap: 3 },
    groupUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    groupAi: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    bubble: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 22 },
    bubbleUser: { backgroundColor: p.primarySoft, borderBottomRightRadius: 7 },
    bubbleAi: {
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.border,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomWidth: 0,
      shadowColor: '#7776b8',
      shadowOpacity: 0.09,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, paddingHorizontal: 5, opacity: 0.9 },
    actionsAi: { alignSelf: 'stretch', justifyContent: 'space-around', marginTop: -4, paddingVertical: 3, backgroundColor: p.card, borderWidth: 1, borderTopWidth: 1, borderColor: p.border, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
    mistakeTag: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 10, marginTop: -2 },
    hintsBox: { alignSelf: 'flex-start', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, maxWidth: '86%', gap: 2 },
    thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    thinkingText: { fontSize: 13.5, lineHeight: 18, fontWeight: '600' },
    composerRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 5 },
    sendButton: { minHeight: 46, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    sendButtonText: { color: '#ffffff', fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 7, paddingBottom: 2 },
    roundBtn: {
      width: 62,
      minHeight: 54,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      opacity: 0.75,
    },
    controlLabel: { fontSize: 9.5, lineHeight: 12, fontWeight: '700' },
    micBtn: {
      width: 66,
      height: 66,
      borderRadius: 33,
      borderWidth: 3,
      padding: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micGradient: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    writeButton: { flex: 1, minWidth: 106, minHeight: 52, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    writeButtonText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    input: {
      flex: 1,
      fontSize: 15,
      borderWidth: 1.5,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 13,
      minHeight: 46,
    },
  });
