// Sesiune rapidă de 5 minute (§P1): drill cronometrat construit exclusiv din elementele
// scadente azi — greșeli de corectat, vocabular de reactivat, fraze pe sunetele slabe.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Mistake, VocabItem, PronunciationResult } from '../types';
import { getMistakes, getVocab, saveVocab, savePronResult, getProfile, newId, todayStr, bumpActivity, updateActivity, addXp } from '../db/db';
import { isDue, applyReview } from '../srs/ladder';
import { reviewMistake, prioritizeMistakes, dedupeMistakes, markMistakePipeline, containsExpression, ensureMistakePromptRo, evaluateReviewAnswer } from '../logic/engine';
import { getPersonalizedPhrases, type PronPhrase } from '../logic/pron';
import { hasOpenRouterKey } from '../settings';
import { speak } from '../audio/tts';
import { Recorder } from '../audio/recorder';
import { transcribe } from '../api/stt';
import { sttDiffAssessment } from '../api/azure';
import { Icon } from '../components/Icon';

const TOTAL_SEC = 5 * 60;

type Item =
  | { kind: 'mistake'; mistake: Mistake }
  | { kind: 'vocab'; vocab: VocabItem }
  | { kind: 'pron'; phrase: PronPhrase };

function interleave(...lists: Item[][]): Item[] {
  const out: Item[] = [];
  const max = Math.max(...lists.map((l) => l.length), 0);
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export default function QuickSession() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(TOTAL_SEC);
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [stats, setStats] = useState({ done: 0, ok: 0 });
  const [finished, setFinished] = useState(false);
  const [loadError, setLoadError] = useState('');
  const recorder = useRef(new Recorder());

  async function load() {
    setLoadError('');
    try {
      const [mistakes, vocab, phrases] = await Promise.all([
        getMistakes(),
        getVocab(),
        getPersonalizedPhrases().catch(() => [] as PronPhrase[]),
      ]);
      const dueMistakes = prioritizeMistakes(dedupeMistakes(mistakes).filter((m) => isDue(m.review) && m.status !== 'mastered')).slice(0, 8);
      const dueVocab = vocab.filter((v) => isDue(v.review) && v.translation).slice(0, 8);
      setItems(
        interleave(
          dueMistakes.map((m) => ({ kind: 'mistake', mistake: m }) as Item),
          dueVocab.map((v) => ({ kind: 'vocab', vocab: v }) as Item),
          phrases.slice(0, 6).map((p) => ({ kind: 'pron', phrase: p }) as Item)
        )
      );
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }
  useEffect(() => {
    void load();
  }, []);

  // cronometrul global de 5 minute
  useEffect(() => {
    if (finished || !items) return;
    if (left <= 0) {
      void finish();
      return;
    }
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') setLeft((s) => s - 1);
      else setLeft((s) => s); // în fundal timpul stă pe loc
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, items, finished]);

  const item = items && items.length > 0 ? items[idx % items.length] : null;

  // Sarcina în română pentru cardurile „Corectează" — traduci, nu ghicești contextul de atunci.
  const [promptRo, setPromptRo] = useState<string | null>(null);
  useEffect(() => {
    setPromptRo(null);
    if (!item || item.kind !== 'mistake') return;
    let cancelled = false;
    ensureMistakePromptRo(item.mistake).then((p) => { if (!cancelled && p) setPromptRo(p); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.kind === 'mistake' ? item.mistake.id : null]);

  async function finish() {
    setFinished(true);
    if (stats.done > 0) {
      await updateActivity({ lessonDone: true }).catch(() => {});
      await addXp(10).catch(() => {});
    }
  }

  function next() {
    setAnswer('');
    setFeedback(null);
    setIdx((i) => i + 1);
  }

  async function submit(text: string) {
    if (!item || !text.trim() || checking) return;
    setChecking(true);
    let ok = false;
    let detail = '';
    let otherErrsText = '';
    if (item.kind === 'mistake') {
      const m = item.mistake;
      // Corect DOAR dacă întreaga propoziție e curată — nu e destul să apară fragmentul corectat.
      // (sttDiffAssessment măsoară doar dacă apar cuvintele-referință, deci propoziția „fragment corect
      //  + rest greșit" trecea fals ca 100%.) Aliniat cu verificarea din Practică → Harta greșelilor.
      const normalize = (s: string) => s.toLowerCase().replace(/[.,!?;:"']/g, '').replace(/\s+/g, ' ').trim();
      const targets = [m.correctFragment, m.corrected].filter((t): t is string => Boolean(t));
      const frag = m.correctFragment ? normalize(m.correctFragment) : '';
      const a = normalize(text);
      const cheapPass = targets.some((t) => a === normalize(t)) || (frag.length > 0 && a.includes(frag));
      detail = m.corrected;
      if (!cheapPass || !hasOpenRouterKey()) {
        ok = cheapPass;
      } else {
        const profile = await getProfile();
        const ev = await evaluateReviewAnswer(profile, m, text, cheapPass);
        ok = ev.verdict;
        if (!ok && ev.otherErrors.length > 0) {
          otherErrsText = ev.otherErrors.map((e) => `${e.wrong} → ${e.correct}`).join(', ');
        }
      }
      await reviewMistake(m, ok ? 'good' : 'fail').catch(() => {});
      if (ok) await markMistakePipeline(m, 'repeatedOk').catch(() => {});
    } else if (item.kind === 'vocab') {
      ok = containsExpression(text, item.vocab.word);
      detail = item.vocab.word;
      const v = item.vocab;
      v.review = applyReview(v.review, ok ? 'good' : 'fail');
      if (ok) v.passiveScore = Math.min(100, v.passiveScore + 10);
      await saveVocab(v).catch(() => {});
      await bumpActivity('vocabReviews', 1).catch(() => {});
    } else {
      const score = sttDiffAssessment(item.phrase.text, text).accuracyScore;
      ok = score >= 70;
      detail = item.phrase.text;
      const rec: PronunciationResult = {
        id: newId(),
        date: todayStr(),
        exercise: 'personalized',
        phrase: item.phrase.text,
        targets: item.phrase.targets,
        score,
        wordScores: sttDiffAssessment(item.phrase.text, text).words,
        source: 'stt-diff',
      };
      await savePronResult(rec).catch(() => {});
      await bumpActivity('pronPhrases', 1).catch(() => {});
    }
    await addXp(ok ? 5 : 1).catch(() => {});
    setStats((s) => ({ done: s.done + 1, ok: s.ok + (ok ? 1 : 0) }));
    const failText = otherErrsText
      ? `✗ Fragmentul e bun, dar restul propoziției are greșeli: ${otherErrsText}. Corect: ${detail}`
      : `✗ Răspunsul căutat: ${detail}`;
    setFeedback({ ok, text: ok ? '✓ Corect!' : failText });
    setChecking(false);
  }

  async function mic() {
    if (recording) {
      setRecording(false);
      try {
        const blob = await recorder.current.stop();
        const { text } = await transcribe(blob);
        setAnswer(text);
        await submit(text);
      } catch {
        setFeedback({ ok: false, text: 'Nu am putut transcrie — mai încearcă.' });
      }
      return;
    }
    try {
      await recorder.current.start();
      setRecording(true);
    } catch {
      setFeedback({ ok: false, text: 'Nu am acces la microfon.' });
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <div className="error-banner">
          Nu am putut pregăti sesiunea rapidă: {loadError}
          <div className="btn-row"><button onClick={load}>Reîncearcă</button></div>
        </div>
      </div>
    );
  }
  if (!items) return <div className="page"><p><span className="spinner" /> Se pregătesc elementele scadente…</p></div>;

  if (items.length === 0) {
    return (
      <div className="page">
        <h1><Icon name="zap" size={24} />Sesiune rapidă</h1>
        <div className="card"><p className="muted">Nimic scadent chiar acum — totul e la zi. Revino după următoarea conversație.</p></div>
        <div className="btn-row"><button className="btn-primary" onClick={() => navigate('/')}>Înapoi acasă</button></div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="page">
        <h1><Icon name="checkCircle" size={24} />Gata!</h1>
        <div className="stat-grid">
          <div className="stat-tile"><div className="value">{stats.done}</div><div className="label">elemente exersate</div></div>
          <div className="stat-tile"><div className="value">{stats.done > 0 ? Math.round((stats.ok / stats.done) * 100) : 0}%</div><div className="label">corecte</div></div>
        </div>
        <p className="muted">Elementele greșite revin mai repede în repetare — exact asta e ideea.</p>
        <div className="btn-row">
          <button className="btn-primary" onClick={() => navigate('/')}>Înapoi acasă</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}><Icon name="zap" size={24} />Sesiune rapidă</h1>
        <strong><Icon name="clock" size={16} /> {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</strong>
      </div>
      <div className="bar" style={{ margin: '8px 0' }}>
        <div style={{ width: `${(1 - left / TOTAL_SEC) * 100}%` }} />
      </div>
      <p className="tiny">{stats.done} exersate · {stats.ok} corecte · doar elemente scadente azi</p>

      {item && (
        <div className="card">
          {item.kind === 'mistake' && (
            <>
              <span className="badge">Corectează</span>
              {promptRo ? (
                <>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>„{promptRo}"</p>
                  <p className="tiny" style={{ color: 'var(--danger)' }}>Atunci ai spus: „{item.mistake.originalFragment ?? item.mistake.original}"</p>
                  <p className="tiny">Spune corect în engleză:</p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '1.1rem', color: 'var(--danger)' }}>„{item.mistake.originalFragment ?? item.mistake.original}"</p>
                  <p className="tiny">Spune varianta corectă:</p>
                </>
              )}
            </>
          )}
          {item.kind === 'vocab' && (
            <>
              <span className="badge">Vocabular</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 700 }}>{item.vocab.translation}</p>
              <p className="tiny">Spune cuvântul/expresia în engleză (poți face o propoziție cu el):</p>
            </>
          )}
          {item.kind === 'pron' && (
            <>
              <span className="badge">Pronunție</span>
              <p style={{ fontSize: '1.1rem' }}>{item.phrase.text}</p>
              <div className="btn-row">
                <button className="btn-ghost" onClick={() => speak(item.phrase.text, 0.95)}><Icon name="volume" />Ascultă</button>
              </div>
            </>
          )}
          {!feedback ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={checking} placeholder="…sau scrie aici" onKeyDown={(e) => e.key === 'Enter' && submit(answer)} />
                <button className={recording ? 'btn-danger' : 'btn-primary'} onClick={mic} disabled={checking} aria-label={recording ? 'Oprește' : 'Înregistrează'}><Icon name={recording ? 'stop' : 'mic'} /></button>
              </div>
              <div className="btn-row">
                <button onClick={() => submit(answer)} disabled={!answer.trim() || checking}>
                  {checking ? <><span className="spinner" /> Se verifică…</> : 'Verifică'}
                </button>
                <button className="btn-ghost" onClick={next} disabled={checking}>Sari peste →</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: feedback.ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{feedback.text}</p>
              <div className="btn-row">
                <button className="btn-primary" onClick={next}>Următorul →</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="btn-row">
        <button className="btn-ghost" onClick={finish}>Încheie mai devreme</button>
      </div>
    </div>
  );
}
