// „Nu știu cum să spun" (§P1): română → structura engleză → repetare verificată → devine țintă în conversație.

import { useRef, useState } from 'react';
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
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob, undefined, referenceHint(result.phraseEn));
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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}><Icon name="help" />Nu știu cum să spun…</h3>
        {error && <div className="error-banner">{error}</div>}
        {!result && (
          <>
            <p className="tiny">Scrie în română ce vrei să spui. Primești structura engleză, o repeți, apoi o folosești în conversație.</p>
            <textarea
              rows={3}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: vreau să spun că aștept un răspuns de la colegi până mâine…"
            />
            <div className="btn-row">
              <button className="btn-primary" onClick={ask} disabled={!query.trim() || busy}>
                {busy ? 'Se caută…' : 'Cum se spune? →'}
              </button>
              <button className="btn-ghost" onClick={onClose}>Închide</button>
            </div>
          </>
        )}
        {result && (
          <>
            <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {result.phraseEn}{' '}
              <button className="btn-ghost" style={{ padding: '0 6px' }} onClick={() => speak(result.phraseEn, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
            </p>
            <p className="muted">{result.literalRo}</p>
            <p className="tiny">{result.tipRo}</p>
            <p className="tiny" style={{ fontWeight: 700 }}>Acum repetă cu voce tare:</p>
            <div className="btn-row">
              <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={repeatMic}>
                <Icon name={recording ? 'stop' : 'mic'} />{recording ? 'Am repetat' : 'Repetă'}
              </button>
              {repeatScore != null && (
                <span className={repeatScore >= 60 ? 'ws-good' : 'ws-bad'} style={{ padding: '4px 10px', borderRadius: 10 }}>
                  {repeatScore}%
                </span>
              )}
            </div>
            {learned && (
              <div className="info-banner">
                ✓ Salvată în vocabular și adăugată ca țintă — profesorul va crea contextul să o folosești chiar acum.
              </div>
            )}
            {repeatScore != null && repeatScore < 60 && (
              <p className="tiny">Nu s-a auzit destul de aproape de model — ascultă din nou și mai încearcă.</p>
            )}
            <div className="btn-row">
              <button onClick={() => { setResult(null); setRepeatScore(null); setLearned(false); setQuery(''); }}>Altă întrebare</button>
              <button className={learned ? 'btn-primary' : 'btn-ghost'} onClick={onClose}>
                {learned ? 'Înapoi la conversație →' : 'Închide'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
