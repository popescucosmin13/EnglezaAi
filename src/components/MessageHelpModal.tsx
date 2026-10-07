import { useEffect, useState } from 'react';
import type { Profile, Microlesson } from '../types';
import { chatJson } from '../api/openrouter';
import { cacheMessageExplanation, getCachedMessageExplanation, getProfile, saveSavedLesson, newId } from '../db/db';
import { addVocabItem } from '../logic/engine';
import { speak } from '../audio/tts';
import { buildMessageHelpPrompt, buildSentenceLessonPrompt, isMicrolessonShape } from '../prompts';
import { hasOpenRouterKey } from '../settings';
import { Icon } from './Icon';

export type MessageHelpMode = 'explain' | 'translate';

interface MessageHelpResult {
  translationRo: string;
  meaningRo: string;
  corrected?: string;
  natural?: string;
  mistakes: { wrong: string; correct: string; explanationRo: string }[];
  usefulExpressions: { expression: string; meaningRo: string }[];
}

export default function MessageHelpModal({
  mode,
  role,
  text,
  nextTeacherText,
  context,
  onClose,
}: {
  mode: MessageHelpMode;
  role: 'user' | 'ai';
  text: string;
  nextTeacherText?: string;
  context: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<MessageHelpResult | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [savedExprs, setSavedExprs] = useState<Set<number>>(new Set());
  const [grammarState, setGrammarState] = useState<'idle' | 'busy' | 'saved'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile();
        const cacheParts = [mode, role, text, nextTeacherText ?? '', context, p.currentLevel, p.mainObjective];
        const cached = await getCachedMessageExplanation(cacheParts).catch(() => undefined);
        const response = (cached as unknown as MessageHelpResult | undefined) ?? await chatJson<MessageHelpResult>([
          { role: 'user', content: buildMessageHelpPrompt({ mode, role, text, nextTeacherText, context, profile: p }) },
        ], { temperature: 0.15, tier: 'utility', feature: 'message_help', maxTokens: 1400 });
        if (!cached) await cacheMessageExplanation(cacheParts, response as unknown as Record<string, unknown>).catch(() => {});
        if (!cancelled) {
          setProfile(p);
          setResult({ ...response, mistakes: response.mistakes ?? [], usefulExpressions: response.usefulExpressions ?? [] });
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      }
    })();
    return () => { cancelled = true; };
  }, [mode, role, text, nextTeacherText, context]);

  const title = mode === 'translate' ? 'Traducere în română' : role === 'user' ? 'Ce ai greșit?' : 'Explicația profesorului';

  // Propoziția corectă din care generăm lecția: varianta corectată (dacă diferă) sau textul original.
  const lessonSource = result?.corrected && result.corrected !== text ? result.corrected : text;
  const canSaveGrammar = Boolean(result && (result.mistakes.length > 0 || (result.corrected && result.corrected !== text)));

  async function saveExpression(expression: string, meaningRo: string, idx: number) {
    await addVocabItem({
      word: expression,
      kind: expression.trim().includes(' ') ? 'expression' : 'word',
      translation: meaningRo,
      example: text,
    }).catch((e) => setError(String(e?.message ?? e)));
    setSavedExprs((s) => new Set(s).add(idx));
  }

  async function saveGrammar() {
    if (!profile || !hasOpenRouterKey()) {
      setError('Lecția este temporar indisponibilă. Încearcă din nou puțin mai târziu.');
      return;
    }
    setGrammarState('busy');
    setError('');
    try {
      const lesson = await chatJson<Microlesson>(
        [{ role: 'user', content: buildSentenceLessonPrompt(profile, lessonSource) }],
        { feature: 'sentence_lesson', maxTokens: 1600, validate: isMicrolessonShape }
      );
      await saveSavedLesson({ ...lesson, id: newId(), createdAt: new Date().toISOString(), sourceEn: lessonSource });
      setGrammarState('saved');
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setGrammarState('idle');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal message-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="word-explain-head">
          <div>
            <span className="tiny">Ajutor la cerere · nivel {profile?.currentLevel ?? '…'}</span>
            <h2>{title}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose} aria-label="Închide">✕</button>
        </div>

        <div className="message-original">„{text}”</div>
        {!result && !error && <p><span className="spinner" /> Pregătesc explicația clară în română…</p>}
        {error && <div className="error-banner">{error}</div>}

        {result && (
          <>
            <div className="word-meaning-card">
              <span className="tiny">În română</span>
              <div className="message-translation">{result.translationRo}</div>
              <button className="btn-ghost" onClick={() => speak(result.translationRo, 0.9)}><Icon name="volume" />Ascultă traducerea</button>
            </div>

            {result.meaningRo && <p>{result.meaningRo}</p>}

            {result.mistakes.length > 0 && (
              <>
                <h3>Ce trebuie corectat</h3>
                {result.mistakes.map((mistake, index) => (
                  <div className="message-mistake" key={`${mistake.wrong}-${index}`}>
                    <div><span className="wrong-text">{mistake.wrong}</span> → <strong>{mistake.correct}</strong></div>
                    <p>{mistake.explanationRo}</p>
                  </div>
                ))}
              </>
            )}

            {mode === 'explain' && role === 'user' && result.mistakes.length === 0 && (
              <div className="info-banner">✓ Propoziția este acceptabilă în acest context. Nu am găsit o greșeală reală.</div>
            )}

            {result.corrected && result.corrected !== text && (
              <div className="mirror-row mirror-correct">
                <span className="lbl">Corect</span>{result.corrected}
                <button className="btn-ghost" onClick={() => speak(result.corrected!, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
            )}
            {result.natural && result.natural !== result.corrected && (
              <div className="mirror-row mirror-natural">
                <span className="lbl">Mai natural</span>{result.natural}
                <button className="btn-ghost" onClick={() => speak(result.natural!, 0.9)} aria-label="Ascultă"><Icon name="volume" /></button>
              </div>
            )}

            {result.usefulExpressions.length > 0 && (
              <>
                <h3>Expresii utile</h3>
                {result.usefulExpressions.map((item, idx) => (
                  <div className="word-example" key={item.expression}>
                    <div><strong>{item.expression}</strong><br /><span className="tiny">{item.meaningRo}</span></div>
                    <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                      <button className="btn-ghost" onClick={() => speak(item.expression, 0.88)} aria-label="Ascultă"><Icon name="volume" /></button>
                      <button
                        className="btn-ghost"
                        onClick={() => saveExpression(item.expression, item.meaningRo, idx)}
                        disabled={savedExprs.has(idx)}
                        aria-label={savedExprs.has(idx) ? 'Salvat în vocabular' : 'Salvează în vocabular'}
                        title={savedExprs.has(idx) ? 'Salvat în vocabular' : 'Salvează în vocabular'}
                      >
                        <Icon name={savedExprs.has(idx) ? 'check' : 'star'} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {canSaveGrammar && (
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn-ghost" onClick={saveGrammar} disabled={grammarState !== 'idle' || !hasOpenRouterKey()}>
                  <Icon
                    name={grammarState === 'busy' ? 'loader' : grammarState === 'saved' ? 'check' : 'book'}
                    className={grammarState === 'busy' ? 'icon-spin' : undefined}
                  />
                  {grammarState === 'busy' ? 'Se pregătește lecția…' : grammarState === 'saved' ? 'Salvat în Gramatică' : 'Salvează în Gramatică'}
                </button>
              </div>
            )}
            {grammarState === 'saved' && (
              <p className="tiny">Găsești lecția în Practică → Gramatică → „Lecțiile mele salvate".</p>
            )}

            <div className="btn-row"><button className="btn-primary" onClick={onClose}>Am înțeles</button></div>
          </>
        )}
      </div>
    </div>
  );
}
