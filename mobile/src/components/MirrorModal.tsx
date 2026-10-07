// English Mirror (§13): Ce ai spus / Corect / Natural / Profesional
// + ascultă, repetă cu scor, salvează expresia, contestă corectarea (§32). Portat de pe web.

import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Utterance, Profile } from '../types';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { referenceHint, transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { chatJson } from '../api/openrouter';
import { buildDisputePrompt, buildVocabCardPrompt } from '../prompts';
import { addVocabItem, norm } from '../logic/engine';
import { getMistakes, deleteMistake, saveMistake, bumpActivity, addXp, getVocab } from '../db/db';
import { hasOpenRouterKey } from '../settings';
import { Icon } from './Icon';
import { Sheet, H3, Tiny, Muted, Banner, Button, ButtonRow, IconButton } from '../ui';
import { usePalette } from '../theme';

export default function MirrorModal({
  turn,
  profile,
  contextText,
  onClose,
}: {
  turn: Utterance;
  profile: Profile;
  contextText: string;
  onClose: () => void;
}) {
  const p = usePalette();
  const a = turn.analysis!;
  const [recording, setRecording] = useState(false);
  const [repeatScore, setRepeatScore] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [disputeResult, setDisputeResult] = useState('');
  const [busy, setBusy] = useState('');
  const recorder = useRef(new Recorder());

  const variants = [
    { key: 'said', label: 'Ce ai spus', text: a.original, bg: p.dangerSoft },
    { key: 'correct', label: 'Corect', text: a.corrected, bg: p.successSoft },
    { key: 'natural', label: 'Natural', text: a.naturalVersion, bg: p.primarySoft },
    ...(a.professionalVersion && a.professionalVersion !== a.naturalVersion
      ? [{ key: 'pro', label: 'Profesional', text: a.professionalVersion, bg: p.warnSoft }]
      : []),
  ];

  async function repeatNatural() {
    if (recording) {
      setRecording(false);
      setBusy('score');
      try {
        const audio = await recorder.current.stop();
        const { text } = await transcribe(audio, undefined, referenceHint(a.naturalVersion));
        await audio.dispose();
        const res = sttDiffAssessment(a.naturalVersion, text);
        setRepeatScore(res.accuracyScore);
        await bumpActivity('sentencesRepeated', 1);
        await addXp(res.accuracyScore >= 80 ? 10 : 5);
      } catch {
        setRepeatScore(null);
      }
      setBusy('');
      return;
    }
    setRepeatScore(null);
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      /* fără microfon */
    }
  }

  async function saveExpression() {
    setBusy('save');
    let card: any = {};
    // expresia e deja în vocabular (addVocabItem oricum deduplică) — fișa generată ar fi aruncată, deci nu o mai cerem
    const alreadySaved = (await getVocab()).some((v) => norm(v.word) === norm(a.naturalVersion));
    if (!alreadySaved && hasOpenRouterKey()) {
      try {
        card = await chatJson<any>([{ role: 'user', content: buildVocabCardPrompt(a.naturalVersion, a.original, profile) }], {
          tier: 'utility', feature: 'vocab_card', maxTokens: 750,
        });
      } catch {
        /* salvăm și fără fișa îmbogățită */
      }
    }
    await addVocabItem({
      word: a.naturalVersion,
      kind: 'expression',
      translation: card.translation ?? '',
      cefrLevel: card.cefrLevel,
      example: card.example ?? a.naturalVersion,
      personalExample: card.personalExample,
      synonyms: card.synonyms,
      opposite: card.opposite || undefined,
    });
    setSaved(true);
    setBusy('');
  }

  async function dispute() {
    if (!hasOpenRouterKey()) return;
    setBusy('dispute');
    try {
      const res = await chatJson<{ verdict: string; explanationRo: string }>([
        { role: 'user', content: buildDisputePrompt(a.original, a.corrected, contextText) },
      ], {
        feature: 'correction_dispute',
        // 500 trunchia uneori JSON-ul (explanationRo lung) → „JSON Parse error" în loc de verdict
        maxTokens: 900,
        validate: (v: any) => typeof v?.verdict === 'string' && typeof v?.explanationRo === 'string' && v.explanationRo.trim().length > 0,
      });
      setDisputeResult(res.explanationRo);
      if (res.verdict === 'correct_as_said') {
        // corectarea a fost greșită — scoatem greșelile asociate din hartă
        const all = await getMistakes();
        for (const m of all) {
          if (m.original === a.original) await deleteMistake(m.id);
        }
        a.errors.forEach((e) => (e.disputed = true));
      } else {
        const all = await getMistakes();
        for (const m of all) {
          if (m.original === a.original) {
            m.disputed = true;
            await saveMistake(m);
          }
        }
      }
    } catch (e: any) {
      setDisputeResult(String(e?.message ?? e));
    }
    setBusy('');
  }

  return (
    <Sheet visible onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={20} color={p.ink} />
        <H3 style={{ marginVertical: 0 }}>English Mirror</H3>
      </View>
      {variants.map((v) => (
        <View key={v.key} style={{ borderRadius: 14, paddingVertical: 10, paddingHorizontal: 13, marginVertical: 7, backgroundColor: v.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', color: p.muted }}>
              {v.label}
            </Text>
            {v.key !== 'said' && <IconButton icon="volume" size={16} color={p.primary} onPress={() => void speak(v.text, 0.95)} />}
          </View>
          <Text style={{ color: p.ink, fontSize: 15.5 }}>{v.text}</Text>
        </View>
      ))}
      {a.errors.filter((e) => !e.disputed).map((e, i) => (
        <Tiny key={i} style={{ marginVertical: 4 }}>
          ⚠ <Text style={{ fontWeight: '700' }}>{e.originalFragment}</Text> → <Text style={{ fontWeight: '700' }}>{e.correctFragment}</Text>{' '}
          — {e.explanationRo}
        </Tiny>
      ))}
      <ButtonRow>
        <Button
          title={recording ? 'Oprește' : busy === 'score' ? 'Se evaluează…' : 'Repetă varianta naturală'}
          variant={recording ? 'danger' : 'primary'}
          icon={busy === 'score' ? undefined : recording ? 'stop' : 'mic'}
          busy={busy === 'score'}
          onPress={repeatNatural}
          disabled={busy === 'score'}
        />
        <Button
          title={saved ? 'Salvată' : busy === 'save' ? 'Se salvează…' : 'Salvează expresia'}
          icon={saved ? 'check' : busy === 'save' ? undefined : 'star'}
          busy={busy === 'save'}
          onPress={saveExpression}
          disabled={saved || busy === 'save'}
        />
      </ButtonRow>
      {repeatScore != null && (
        <Muted>
          Potrivire:{' '}
          <Text style={{ fontWeight: '700', color: repeatScore >= 80 ? p.success : p.warn }}>{repeatScore}%</Text>
          {repeatScore >= 80 ? ' — excelent!' : ' — mai încearcă o dată.'}
        </Muted>
      )}
      {a.errors.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Button
            title={busy === 'dispute' ? 'Se reanalizează…' : 'Cred că această corectare este greșită'}
            variant="ghost"
            icon={busy === 'dispute' ? undefined : 'help'}
            busy={busy === 'dispute'}
            onPress={dispute}
            disabled={busy === 'dispute'}
            style={{ alignSelf: 'flex-start' }}
          />
          {disputeResult ? <Banner kind="info">{disputeResult}</Banner> : null}
        </View>
      )}
      <ButtonRow>
        <Button title="Închide" onPress={onClose} />
      </ButtonRow>
    </Sheet>
  );
}
