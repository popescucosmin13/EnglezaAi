// Onboarding (§6): 7 pași, ~5-8 minute, un pas pe ecran.

import { useState } from 'react';
import type { Profile, CorrectionMode } from '../types';
import { getProfile, saveProfile } from '../db/db';
import { ONBOARDING_OPTIONS as OPT } from '../content';
import { Icon } from '../components/Icon';

const STEPS = 7;

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [native, setNative] = useState('română');
  const [objective, setObjective] = useState('');
  const [perceived, setPerceived] = useState('');
  const [time, setTime] = useState(20);
  const [temporal, setTemporal] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>('immediate');
  const [roHelp, setRoHelp] = useState<'multa' | 'putina'>('multa');
  const [speed, setSpeed] = useState<'lent' | 'normal' | 'provocare'>('normal');

  const canNext = [
    true,
    objective !== '',
    perceived !== '',
    true,
    temporal !== '',
    interests.length > 0,
    true,
  ][step];

  async function finish() {
    const p: Profile = {
      ...(await getProfile()),
      onboarded: true,
      nativeLanguage: native,
      mainObjective: objective,
      perceivedLevel: perceived,
      dailyGoalMinutes: time,
      temporalObjective: temporal,
      interests,
      correctionMode,
      romanianHelp: roHelp,
      aiSpeed: speed,
    };
    // nivelul perceput dă punctul de pornire până la test (§6.3: nu înlocuiește testul)
    const idx = OPT.perceivedLevels.indexOf(perceived);
    p.currentLevel = idx <= 1 ? 'A1' : idx === 2 ? 'A2' : idx === 3 ? 'A2' : 'B1';
    p.targetLevel = idx >= 3 ? 'B2' : 'B1';
    await saveProfile(p);
    onDone();
  }

  const chip = (value: string, selected: boolean, onClick: () => void) => (
    <button key={value} className={`chip ${selected ? 'selected' : ''}`} onClick={onClick}>
      {value}
    </button>
  );

  return (
    <div className="onboarding">
      <div className="step-dots">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={i <= step ? 'done' : ''} />
        ))}
      </div>

      {step === 0 && (
        <>
          <h1><Icon name="user" size={24} />Bine ai venit!</h1>
          <p className="muted">Care e limba ta maternă? Explicațiile vor fi în limba ta, practica în engleză.</p>
          <div className="chip-row">{['română', 'engleză', 'spaniolă', 'italiană'].map((l) => chip(l, native === l, () => setNative(l)))}</div>
        </>
      )}
      {step === 1 && (
        <>
          <h1><Icon name="target" size={24} />Scopul tău principal</h1>
          <p className="muted">Lecțiile se construiesc din viața și obiectivele tale.</p>
          <div className="chip-row">{OPT.objectives.map((o) => chip(o, objective === o, () => setObjective(o)))}</div>
        </>
      )}
      {step === 2 && (
        <>
          <h1><Icon name="barChart" size={24} />Cum îți evaluezi engleza?</h1>
          <p className="muted">Răspunsul nu înlocuiește testul de nivel — doar ne orientează.</p>
          <div className="chip-row">{OPT.perceivedLevels.map((l) => chip(l, perceived === l, () => setPerceived(l)))}</div>
        </>
      )}
      {step === 3 && (
        <>
          <h1><Icon name="clock" size={24} />Cât timp ai pe zi?</h1>
          <div className="chip-row">{OPT.times.map((t) => chip(`${t} minute`, time === t, () => setTime(t)))}</div>
        </>
      )}
      {step === 4 && (
        <>
          <h1><Icon name="calendar" size={24} />Obiectivul tău temporal</h1>
          <div className="chip-row">{OPT.temporalObjectives.map((o) => chip(o, temporal === o, () => setTemporal(o)))}</div>
        </>
      )}
      {step === 5 && (
        <>
          <h1><Icon name="lightbulb" size={24} />Ce te interesează?</h1>
          <p className="muted">Alege oricâte — conversațiile vor fi pe aceste subiecte.</p>
          <div className="chip-row">
            {OPT.interests.map((i) =>
              chip(i, interests.includes(i), () => setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])))
            )}
          </div>
        </>
      )}
      {step === 6 && (
        <>
          <h1><Icon name="sliders" size={24} />Cum să te corectez?</h1>
          <div className="chip-row">
            {chip('corectează-mă imediat', correctionMode === 'immediate', () => setCorrectionMode('immediate'))}
            {chip('corectează-mă discret', correctionMode === 'discreet', () => setCorrectionMode('discreet'))}
            {chip('corectează-mă la final', correctionMode === 'final', () => setCorrectionMode('final'))}
          </div>
          <h3>Română în explicații?</h3>
          <div className="chip-row">
            {chip('explică-mi în română', roHelp === 'multa', () => setRoHelp('multa'))}
            {chip('cât mai puțină română', roHelp === 'putina', () => setRoHelp('putina'))}
          </div>
          <h3>Ritmul AI-ului</h3>
          <div className="chip-row">
            {chip('vorbește lent', speed === 'lent', () => setSpeed('lent'))}
            {chip('vorbește normal', speed === 'normal', () => setSpeed('normal'))}
            {chip('provoacă-mă', speed === 'provocare', () => setSpeed('provocare'))}
          </div>
        </>
      )}

      <div style={{ flex: 1 }} />
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <button className="btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← Înapoi
        </button>
        {step < STEPS - 1 ? (
          <button className="btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Continuă →
          </button>
        ) : (
          <button className="btn-primary" onClick={finish}>
            <Icon name="graduation" />Gata — mergem la testul de nivel
          </button>
        )}
      </div>
    </div>
  );
}
