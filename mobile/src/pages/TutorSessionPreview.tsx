import { useState } from 'react';
import type { Utterance } from '../types';
import type { ChatBusy } from '../hooks/useVoiceChat';
import { defaultProfile } from '../db/db';
import ChatView from '../components/ChatView';
import TutorSessionHeader from '../components/TutorSessionHeader';
import { Screen } from '../ui';
import { usePalette } from '../theme';

const INITIAL_TURNS: Utterance[] = [
  {
    role: 'ai',
    text: 'Hi Alex — what are your top priorities for today?',
    ts: 1,
  },
  {
    role: 'user',
    text: 'I’m preparing the launch and reviewing the final details.',
    ts: 2,
  },
];

export default function TutorSessionPreview() {
  const p = usePalette();
  const [busy, setBusy] = useState<ChatBusy>('recording');
  const [turns, setTurns] = useState<Utterance[]>(INITIAL_TURNS);
  const [handsFree, setHandsFree] = useState(false);

  return (
    <Screen
      scroll={false}
      padBottom={8}
      style={{ width: '100%', maxWidth: 390, minHeight: 844, alignSelf: 'center', backgroundColor: p.bg }}
    >
      <TutorSessionHeader
        title="Conversația principală"
        stepLabel="3 din 6"
        detail="Present Perfect · Stand-up update"
        timeLabel="06:42"
        currentStep={3}
        totalSteps={6}
        actionLabel="Încheie"
        onAction={() => setBusy('ending')}
        onBack={() => setBusy('idle')}
      />
      <ChatView
        turns={turns}
        busy={busy}
        interim=""
        hints={[]}
        error=""
        onMic={() => setBusy((current) => current === 'recording' ? 'idle' : 'recording')}
        onSend={(text) => {
          setTurns((current) => [...current, { role: 'user', text, ts: Date.now() }]);
          setBusy('thinking');
          setTimeout(() => setBusy('idle'), 900);
        }}
        showMistakeTags={false}
        handsFree={handsFree}
        onToggleHandsFree={() => setHandsFree((current) => !current)}
        profile={{ ...defaultProfile(), onboarded: true, testDone: true }}
        contextLabel="Stand-up update"
        showTips={false}
      />
    </Screen>
  );
}
