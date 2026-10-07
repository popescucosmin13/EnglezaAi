// English Mirror (§13): Ce ai spus / Corect / Natural / Profesional
// + ascultă, repetă cu scor, salvează expresia, contestă corectarea (§32).

import { useRef, useState } from 'react';
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
  const a = turn.analysis!;
  const [recording, setRecording] = useState(false);
  const [repeatScore, setRepeatScore] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [disputeResult, setDisputeResult] = useState('');
  const [busy, setBusy] = useState('');
  const recorder = useRef(new Recorder());

  const variants = [
    { key: 'said', label: 'Ce ai spus', text: a.original, cls: 'mirror-said' },
    { key: 'correct', label: 'Corect', text: a.corrected, cls: 'mirror-correct' },
    { key: 'natural', label: 'Natural', text: a.naturalVersion, cls: 'mirror-natural' },
    ...(a.professionalVersion && a.professionalVersion !== a.naturalVersion
      ? [{ key: 'pro', label: 'Profesional', text: a.professionalVersion, cls: 'mirror-pro' }]
      : []),
  ];

  async function repeatNatural() {
    if (recording) {
      setRecording(false);
      setBusy('score');
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(a.naturalVersion));
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}><Icon name="sparkles" />English Mirror</h3>
        {variants.map((v) => (
          <div key={v.key} className={`mirror-row ${v.cls}`}>
            <span className="lbl">{v.label}</span>
            {v.text}
            {v.key !== 'said' && (
              <button className="btn-ghost" style={{ padding: '2px 8px', marginLeft: 6 }} onClick={() => speak(v.text, 0.95)}>
                <Icon name="volume" />
              </button>
            )}
          </div>
        ))}
        {a.errors.filter((e) => !e.disputed).map((e, i) => (
          <p key={i} className="tiny" style={{ margin: '4px 0' }}>
            <Icon name="triangleAlert" size={15} /> <strong>{e.originalFragment}</strong> → <strong>{e.correctFragment}</strong> — {e.explanationRo}
          </p>
        ))}
        <div className="btn-row">
          <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={repeatNatural} disabled={busy === 'score'}>
            {busy === 'score' ? <Icon name="loader" className="icon-spin" /> : <Icon name={recording ? 'stop' : 'mic'} />}
            {recording ? 'Oprește' : busy === 'score' ? 'Se evaluează…' : 'Repetă varianta naturală'}
          </button>
          <button onClick={saveExpression} disabled={saved || busy === 'save'}>
            <Icon name={saved ? 'check' : busy === 'save' ? 'loader' : 'star'} className={busy === 'save' ? 'icon-spin' : undefined} />
            {saved ? 'Salvată' : busy === 'save' ? 'Se salvează…' : 'Salvează expresia'}
          </button>
        </div>
        {repeatScore != null && (
          <p className="muted">
            Potrivire: <strong style={{ color: repeatScore >= 80 ? 'var(--success)' : 'var(--warn)' }}>{repeatScore}%</strong>
            {repeatScore >= 80 ? ' — excelent!' : ' — mai încearcă o dată.'}
          </p>
        )}
        {a.errors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button className="btn-ghost" onClick={dispute} disabled={busy === 'dispute'}>
              <Icon name={busy === 'dispute' ? 'loader' : 'help'} className={busy === 'dispute' ? 'icon-spin' : undefined} />
              {busy === 'dispute' ? 'Se reanalizează…' : 'Cred că această corectare este greșită'}
            </button>
            {disputeResult && <div className="info-banner">{disputeResult}</div>}
          </div>
        )}
        <div className="btn-row">
          <button onClick={onClose}>Închide</button>
        </div>
      </div>
    </div>
  );
}
