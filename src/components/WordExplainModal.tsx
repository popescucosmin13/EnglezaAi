import { useEffect, useState } from 'react';
import type { Cefr, Profile } from '../types';
import { chatJson } from '../api/openrouter';
import { speak } from '../audio/tts';
import { getProfile, getCachedWordExplanation, cacheWordExplanation } from '../db/db';
import { addVocabItem } from '../logic/engine';
import { buildWordExplanationPrompt } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import { Icon } from './Icon';

interface WordExplanation {
  word: string;
  baseForm: string;
  pronunciation: string;
  partOfSpeechRo: string;
  translationRo: string;
  meaningInContextRo: string;
  simpleEnglish: string;
  whyThisFormRo?: string;
  otherMeaningsRo?: string[];
  examples: { en: string; ro: string }[];
  collocations?: string[];
  memoryTipRo?: string;
  cefrLevel?: Cefr;
}

export default function WordExplainModal({ word, sentence, onClose }: { word: string; sentence: string; onClose: () => void }) {
  const [result, setResult] = useState<WordExplanation | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasOpenRouterKey()) {
        setError('Explicația este temporar indisponibilă. Încearcă din nou puțin mai târziu.');
        return;
      }
      try {
        const p = await getProfile();
        // potrivire exactă cuvânt+propoziție (ex. exemple din microlecții deja cache-uite, care revin identice)
        const cached = await getCachedWordExplanation(word, sentence).catch(() => undefined);
        const explanation = (cached as WordExplanation | undefined) ?? await chatJson<WordExplanation>([
          { role: 'user', content: buildWordExplanationPrompt(word, sentence, p) },
        ], { temperature: 0.2, tier: 'utility', feature: 'word_explanation', maxTokens: 1600 });
        if (!cached) await cacheWordExplanation(word, sentence, explanation as unknown as Record<string, unknown>).catch(() => {});
        if (!cancelled) {
          setProfile(p);
          setResult(explanation);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    })();
    return () => { cancelled = true; };
  }, [word, sentence]);

  async function saveWord() {
    if (!result || !profile) return;
    const expression = result.baseForm || result.word || word;
    await addVocabItem({
      word: expression,
      kind: expression.includes(' ') ? 'expression' : 'word',
      translation: result.translationRo,
      cefrLevel: result.cefrLevel,
      example: result.examples?.[0]?.en ?? sentence,
      personalExample: result.examples?.[1]?.en,
    });
    setSaved(true);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal word-explain-modal" onClick={(e) => e.stopPropagation()}>
        <div className="word-explain-head">
          <div>
            <span className="tiny">Cuvânt din conversație</span>
            <h2>{result?.baseForm || word}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Închide">✕</button>
        </div>

        {!result && !error && <p><span className="spinner" /> Îți explic sensul din această propoziție…</p>}
        {error && <div className="error-banner">{error}</div>}

        {result && (
          <>
            <div className="word-meaning-card">
              <div className="word-translation">{result.translationRo}</div>
              <div className="tiny">{result.partOfSpeechRo} · {result.cefrLevel ?? 'nivel necunoscut'}</div>
              <button className="btn-ghost" onClick={() => speak(result.baseForm || result.word, 0.82)}>
                <Icon name="volume" />{result.pronunciation || 'Ascultă'}
              </button>
            </div>

            <h3>Ce înseamnă aici</h3>
            <p>{result.meaningInContextRo}</p>
            <button className="btn-ghost" onClick={() => speak(`${result.translationRo}. ${result.meaningInContextRo}`, 0.9)}>
              <Icon name="volume" />Ascultă explicația în română
            </button>
            <div className="info-banner"><strong>În engleză simplă:</strong> {result.simpleEnglish}</div>
            {result.whyThisFormRo && <p><strong>De ce apare așa:</strong> {result.whyThisFormRo}</p>}

            <h3>Exemple</h3>
            {(result.examples ?? []).map((ex, i) => (
              <div className="word-example" key={`${ex.en}-${i}`}>
                <div><strong>{ex.en}</strong><br /><span className="tiny">{ex.ro}</span></div>
                <button className="btn-ghost" onClick={() => speak(ex.en, 0.88)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
            ))}

            {(result.collocations?.length ?? 0) > 0 && (
              <>
                <h3>Combinații utile</h3>
                <div className="chip-row">{result.collocations!.map((c) => <span className="chip" key={c}>{c}</span>)}</div>
              </>
            )}
            {(result.otherMeaningsRo?.length ?? 0) > 0 && (
              <details>
                <summary>Alte sensuri frecvente</summary>
                <ul>{result.otherMeaningsRo!.map((m) => <li key={m}>{m}</li>)}</ul>
              </details>
            )}
            {result.memoryTipRo && <p className="memory-tip"><Icon name="lightbulb" size={16} /> <strong>Ține minte:</strong> {result.memoryTipRo}</p>}

            <div className="btn-row">
              <button className="btn-primary" onClick={saveWord} disabled={saved}>
                <Icon name={saved ? 'check' : 'star'} />{saved ? 'Salvat în vocabular' : 'Salvează în vocabular'}
              </button>
              <button onClick={onClose}>Am înțeles</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
