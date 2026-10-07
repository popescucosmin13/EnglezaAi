// „Nu știu cum să spun" (§P1): română → structura engleză → repetare verificată → devine țintă
// în conversație. Portat de pe web pe Sheet nativ.

import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Profile } from '../types';
import { chatJson } from '../api/openrouter';
import { buildDontKnowPrompt } from '../prompts';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { addVocabItem } from '../logic/engine';
import { addXp } from '../db/db';
import { Icon } from './Icon';
import { Sheet, H3, Tiny, Muted, Banner, Button, ButtonRow, Field, IconButton } from '../ui';
import { usePalette } from '../theme';

interface DontKnowResult {
  phraseEn: string;
  literalRo: string;
  tipRo: string;
}

export default function DontKnowModal({
  profile,
  context,
  onLearned,
  onClose,
}: {
  profile: Profile;
  context: string;
  onLearned?: (phrase: string) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DontKnowResult | null>(null);
  const [recording, setRecording] = useState(false);
  const [repeatScore, setRepeatScore] = useState<number | null>(null);
  const [learned, setLearned] = useState(false);
  const [error, setError] = useState('');
  const recorder = useRef(new Recorder());

  async function ask() {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await chatJson<DontKnowResult>(
        [
          { role: 'system', content: buildDontKnowPrompt(profile, context) },
          { role: 'user', content: query.trim() },
        ],
        {
          tier: 'utility',
          feature: 'dont_know_help',
          maxTokens: 650,
          validate: (v: any) => typeof v?.phraseEn === 'string' && v.phraseEn.trim().length > 0 && typeof v?.literalRo === 'string',
        }
      );
      setResult(res);
      await speak(res.phraseEn, 0.9);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    setBusy(false);
  }

  /** Pasul de repetare: învățarea se confirmă doar după ce utilizatorul rostește structura. */
  async function repeatMic() {
    if (!result) return;
    if (recording) {
      setRecording(false);
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(result.phraseEn));
        await audio.dispose();
        const score = sttDiffAssessment(result.phraseEn, text).accuracyScore;
        setRepeatScore(score);
        if (score >= 60 && !learned) {
          setLearned(true);
          await addVocabItem({ word: result.phraseEn, translation: result.literalRo, kind: 'expression', example: result.phraseEn });
          await addXp(6);
          onLearned?.(result.phraseEn);
        }
      } catch {
        setError('Nu am putut transcrie — mai încearcă.');
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
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="help" size={20} color={p.ink} />
        <H3 style={{ marginVertical: 0 }}>Nu știu cum să spun…</H3>
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!result && (
        <>
          <Tiny style={{ marginTop: 6 }}>
            Scrie în română ce vrei să spui. Primești structura engleză, o repeți, apoi o folosești în conversație.
          </Tiny>
          <Field
            value={query}
            onChange={setQuery}
            multiline
            placeholder="Ex: vreau să spun că aștept un răspuns de la colegi până mâine…"
          />
          <ButtonRow>
            <Button title={busy ? 'Se caută…' : 'Cum se spune? →'} variant="primary" busy={busy} onPress={ask} disabled={!query.trim() || busy} />
            <Button title="Închide" variant="ghost" onPress={onClose} />
          </ButtonRow>
        </>
      )}
      {result && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: p.ink, flexShrink: 1 }}>{result.phraseEn}</Text>
            <IconButton icon="volume" color={p.primary} onPress={() => void speak(result.phraseEn, 0.9)} />
          </View>
          <Muted>{result.literalRo}</Muted>
          <Tiny style={{ marginTop: 4 }}>{result.tipRo}</Tiny>
          <Tiny style={{ fontWeight: '700', marginTop: 10 }}>Acum repetă cu voce tare:</Tiny>
          <ButtonRow>
            <Button
              title={recording ? 'Am repetat' : 'Repetă'}
              variant={recording ? 'danger' : 'primary'}
              icon={recording ? 'stop' : 'mic'}
              onPress={repeatMic}
            />
            {repeatScore != null && (
              <View
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: repeatScore >= 60 ? p.successSoft : p.dangerSoft,
                }}
              >
                <Text style={{ color: repeatScore >= 60 ? p.success : p.danger, fontWeight: '700' }}>{repeatScore}%</Text>
              </View>
            )}
          </ButtonRow>
          {learned && (
            <Banner kind="info">
              ✓ Salvată în vocabular și adăugată ca țintă — profesorul va crea contextul să o folosești chiar acum.
            </Banner>
          )}
          {repeatScore != null && repeatScore < 60 && (
            <Tiny>Nu s-a auzit destul de aproape de model — ascultă din nou și mai încearcă.</Tiny>
          )}
          <ButtonRow>
            <Button
              title="Altă întrebare"
              onPress={() => {
                setResult(null);
                setRepeatScore(null);
                setLearned(false);
                setQuery('');
              }}
            />
            <Button title={learned ? 'Înapoi la conversație →' : 'Închide'} variant={learned ? 'primary' : 'ghost'} onPress={onClose} />
          </ButtonRow>
        </>
      )}
    </Sheet>
  );
}
