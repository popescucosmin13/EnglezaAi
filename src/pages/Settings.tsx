// Setări pe taburi: Învățare (preferințe + profil), Date (statistici utile + export/import/ștergere §34), Cont.
// Configurația AI/voce/backend s-a mutat în Admin Center (doar admin) și se aplică global.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile, CorrectionMode, Cefr, Session, Mistake, VocabItem, PronunciationResult } from '../types';
import { SESSION_TYPE_LABELS_RO } from '../types';
import { getProfile, saveProfile, exportAll, importAll, wipeAll, getSessions, getMistakes, getVocab, getPronResults, getReports } from '../db/db';
import { isDue } from '../srs/ladder';
import { useAuth } from '../auth/AuthContext';
import { isAdminUid } from '../admin-config';
import { Icon } from '../components/Icon';
import NotificationSettings from '../components/NotificationSettings';
import { normalizeProgramDuration, PROGRAM_EXTENSION_DAYS } from '../content';

const CEFR_LEVELS: Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

type SettingsTab = 'invatare' | 'date' | 'cont';

export default function Settings({ onProfileChange }: { onProfileChange: () => void }) {
  const navigate = useNavigate();
  const { user, signOutUser, deleteAccount } = useAuth();
  const [tab, setTab] = useState<SettingsTab>('invatare');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState('');
  const [msgError, setMsgError] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  async function updProfile(patch: Partial<Profile>) {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    await saveProfile(next);
    onProfileChange();
  }

  async function doExport() {
    try {
      const json = await exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `englezaai-backup-${new Date().toISOString().slice(0, 10)}.json`;
      // Ancora trebuie să fie în DOM pe unele browsere, iar revocarea URL-ului se face DUPĂ ce
      // browserul a apucat să citească blob-ul — revocarea sincronă anula descărcarea.
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMsgError(false);
      setMsg('Backup exportat. Dacă pe iPhone se deschide în loc să se descarce, folosește „Partajează → Salvează în Fișiere".');
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Export eșuat: ${String(e?.message ?? e)}`);
    }
  }

  async function doImport(file: File) {
    try {
      await importAll(await file.text());
      setMsgError(false);
      // reîncărcăm ca datele importate să înlocuiască efectiv cache-ul în memorie (altfel UI-ul rămâne pe cele vechi)
      setMsg('Date importate. Se reîncarcă…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Import eșuat: ${String(e?.message ?? e)}`);
    }
  }

  async function doWipe() {
    if (!window.confirm('Ștergi TOATE datele (profil, sesiuni, greșeli, vocabular)? Acțiunea e ireversibilă.')) return;
    try {
      await wipeAll();
      setMsgError(false);
      setMsg('Date șterse. Se reîncarcă pentru a relua onboarding-ul…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setMsgError(true);
      setMsg(`Ștergerea a eșuat: ${String(e?.message ?? e)}`);
    }
  }

  async function doDeleteAccount() {
    if (!accountPassword) {
      setMsgError(true);
      setMsg('Introdu parola contului pentru a confirma ștergerea.');
      return;
    }
    if (!window.confirm('Ștergi definitiv contul și TOATE datele asociate? Acțiunea este ireversibilă.')) return;
    setDeletingAccount(true);
    setMsg('');
    try {
      await deleteAccount(accountPassword);
    } catch (e: any) {
      const code = String(e?.code ?? '');
      setMsgError(true);
      setMsg(code === 'auth/invalid-credential' || code === 'auth/wrong-password'
        ? 'Parola este incorectă.'
        : `Contul nu a putut fi șters: ${String(e?.message ?? e)}`);
      setDeletingAccount(false);
    }
  }

  return (
    <div className="page">
      <h1><Icon name="settings" size={24} />Setări</h1>
      {msg && <div className={msgError ? 'error-banner' : 'info-banner'}><Icon name={msgError ? 'xCircle' : 'checkCircle'} size={16} /> {msg}</div>}

      <div className="tabs">
        <button className={tab === 'invatare' ? 'active' : ''} onClick={() => setTab('invatare')}><Icon name="graduation" />Învățare</button>
        <button className={tab === 'date' ? 'active' : ''} onClick={() => setTab('date')}><Icon name="barChart" />Date</button>
        <button className={tab === 'cont' ? 'active' : ''} onClick={() => setTab('cont')}><Icon name="user" />Cont</button>
      </div>

      {tab === 'invatare' && profile && (
        <>
          <h2>Preferințe de învățare</h2>
          <div className="card">
            <label className="field">
              <span>Mod de corectare</span>
              <select value={profile.correctionMode} onChange={(e) => updProfile({ correctionMode: e.target.value as CorrectionMode })}>
                <option value="immediate">Imediată — „Small correction… please repeat"</option>
                <option value="discreet">Discretă — reformulare naturală în răspuns</option>
                <option value="final">La final — conversația nu e întreruptă</option>
              </select>
            </label>
            <label className="field">
              <span>Română în explicații</span>
              <select value={profile.romanianHelp} onChange={(e) => updProfile({ romanianHelp: e.target.value as any })}>
                <option value="multa">Explică-mi în română</option>
                <option value="putina">Cât mai puțină română</option>
              </select>
            </label>
            <label className="field">
              <span>Ritmul tutorelui</span>
              <select value={profile.aiSpeed} onChange={(e) => updProfile({ aiSpeed: e.target.value as any })}>
                <option value="lent">Vorbește lent</option>
                <option value="normal">Vorbește normal</option>
                <option value="provocare">Provoacă-mă</option>
              </select>
            </label>
            <label className="field">
              <span>Obiectiv zilnic (minute)</span>
              <select value={profile.dailyGoalMinutes} onChange={(e) => updProfile({ dailyGoalMinutes: Number(e.target.value) })}>
                {[10, 20, 30, 45, 60].map((t) => (
                  <option key={t} value={t}>{t} minute</option>
                ))}
              </select>
            </label>
          </div>

          <h2>Profil</h2>
          <div className="card">
            <label className="field">
              <span>Nivel curent (se actualizează automat pe mai multe sesiuni)</span>
              <select value={profile.currentLevel} onChange={(e) => updProfile({ currentLevel: e.target.value as Cefr })}>
                {CEFR_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Nivel țintă</span>
              <select value={profile.targetLevel} onChange={(e) => updProfile({ targetLevel: e.target.value as Cefr })}>
                {CEFR_LEVELS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Data de start a programului</span>
              <input type="date" value={profile.startDate} onChange={(e) => updProfile({ startDate: e.target.value })} />
            </label>
            <div className="field">
              <span>Durata programului</span>
              <p className="tiny">Plan activ: {normalizeProgramDuration(profile.programDurationDays)} de zile. Îl poți prelungi fără să pierzi progresul.</p>
              <button onClick={() => void updProfile({ programDurationDays: normalizeProgramDuration(profile.programDurationDays) + PROGRAM_EXTENSION_DAYS })}>
                <Icon name="calendar" />Extinde cu {PROGRAM_EXTENSION_DAYS} de zile
              </button>
            </div>
            <p className="tiny">Obiectiv: {profile.mainObjective} · interese: {profile.interests.join(', ')} · XP: {profile.xp}</p>
            <button onClick={() => navigate('/test')}><Icon name="graduation" />Refă testul de nivel</button>
          </div>

          <h2>Revenire inteligentă</h2>
          <NotificationSettings />
        </>
      )}

      {tab === 'date' && <DataTab profile={profile} onExport={doExport} onImport={doImport} onWipe={doWipe} />}

      {tab === 'cont' && (
        <>
          <h2>Cont</h2>
          <div className="card">
            <p className="tiny">Autentificat ca <strong>{user?.email}</strong>. Progresul tău este salvat în siguranță și disponibil pe toate dispozitivele tale.</p>
            <button className="btn-danger" onClick={() => signOutUser()}><Icon name="logout" />Ieși din cont</button>
          </div>
          <h2>Ștergerea contului</h2>
          <div className="card">
            <p className="tiny">Ștergerea elimină definitiv contul, profilul, sesiunile, greșelile, vocabularul și rapoartele salvate.</p>
            <label className="field">
              <span>Parola contului</span>
              <input
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button className="btn-danger" disabled={deletingAccount} onClick={doDeleteAccount}>
              <Icon name="trash" />{deletingAccount ? 'Se șterge…' : 'Șterge definitiv contul'}
            </button>
          </div>
          {isAdminUid(user?.uid) && (
            <>
              <h2>Administrare</h2>
              <div className="card">
                <p className="tiny">Doar contul tău vede această secțiune.</p>
                <button className="btn-primary" onClick={() => navigate('/admin')}><Icon name="shield" />Deschide Admin Center</button>
              </div>
            </>
          )}
          <h2>Confidențialitate</h2>
          <div className="card">
            <p className="tiny">
              Progresul tău este sincronizat în siguranță. Înregistrările audio sunt folosite numai pentru transcriere și evaluare și nu sunt păstrate.
            </p>
            <div className="btn-row">
              <a className="btn" href="/privacy.html" target="_blank" rel="noreferrer">Politica de confidențialitate</a>
              <a className="btn" href="/delete-account.html" target="_blank" rel="noreferrer">Instrucțiuni ștergere cont</a>
              <a className="btn" href="/terms.html" target="_blank" rel="noreferrer">Termeni de utilizare</a>
              <a className="btn" href="/support.html" target="_blank" rel="noreferrer">Suport</a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Tabul „Date": statistici utile + backup ----------

interface DataStats {
  sessions: Session[];
  mistakes: Mistake[];
  vocab: VocabItem[];
  pron: PronunciationResult[];
  reportsCount: number;
}

function DataTab({ profile, onExport, onImport, onWipe }: {
  profile: Profile | null;
  onExport: () => void;
  onImport: (f: File) => void;
  onWipe: () => void;
}) {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getSessions(), getMistakes(), getVocab(), getPronResults(), getReports()])
      .then(([sessions, mistakes, vocab, pron, reports]) =>
        setStats({ sessions, mistakes, vocab, pron, reportsCount: reports.length })
      )
      .catch(() => setError('Nu am putut încărca datele de progres. Încearcă din nou.'));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!stats || !profile) return <p className="tiny"><span className="spinner" /> Se încarcă statisticile…</p>;

  const { sessions, mistakes, vocab, pron } = stats;
  const totalMinutes = Math.round(sessions.reduce((a, s) => a + s.userSpeakingSec, 0) / 60);
  const totalWords = sessions.reduce((a, s) => a + s.wordCount, 0);
  const activeMistakes = mistakes.filter((m) => m.status !== 'mastered');
  const dueMistakes = activeMistakes.filter((m) => isDue(m.review));
  const masteredMistakes = mistakes.length - activeMistakes.length;
  const activeVocab = vocab.filter((v) => v.activeScore >= 60);
  const dueVocab = vocab.filter((v) => isDue(v.review));
  const recentPron = pron.slice(-30);
  const avgPron = recentPron.length ? Math.round(recentPron.reduce((a, r) => a + r.score, 0) / recentPron.length) : null;
  const last = sessions[sessions.length - 1];
  // aceeași bază de calcul ca pe Acasă/Progres (miezul nopții local), ca ziua din program să fie identică peste tot
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const programDay = Math.max(1, Math.floor((Date.now() - new Date(profile.startDate + 'T00:00:00').getTime()) / 86400000) + 1);

  return (
    <>
      <h2>Progresul tău în cifre</h2>
      <div className="stat-grid">
        <div className="stat-tile"><div className="value">{profile.currentLevel}</div><div className="label">nivel curent → {profile.targetLevel}</div></div>
        <div className="stat-tile"><div className="value">{profile.xp}</div><div className="label">XP total</div></div>
        <div className="stat-tile"><div className="value">{profile.streak}</div><div className="label">zile streak</div></div>
        <div className="stat-tile"><div className="value">{Math.min(programDay, programDuration)}</div><div className="label">ziua din programul de {programDuration}</div></div>
      </div>

      <h2>Vorbire</h2>
      <div className="card kv-rows">
        <div className="kv-row"><span className="k">Sesiuni totale</span><span className="v">{sessions.length}</span></div>
        <div className="kv-row"><span className="k">Minute vorbite (total)</span><span className="v">{totalMinutes}</span></div>
        <div className="kv-row"><span className="k">Cuvinte rostite (total)</span><span className="v">{totalWords}</span></div>
        <div className="kv-row">
          <span className="k">Ultima sesiune</span>
          <span className="v">{last ? `${last.startedAt.slice(0, 10)} · ${SESSION_TYPE_LABELS_RO[last.type]}` : '—'}</span>
        </div>
      </div>

      <h2>Memoria de învățare</h2>
      <div className="card kv-rows">
        <div className="kv-row"><span className="k">Greșeli urmărite (active)</span><span className="v">{activeMistakes.length}</span></div>
        <div className="kv-row"><span className="k">Greșeli scadente azi la repetare</span><span className="v">{dueMistakes.length}</span></div>
        <div className="kv-row"><span className="k">Greșeli stăpânite</span><span className="v">{masteredMistakes}</span></div>
        <div className="kv-row"><span className="k">Vocabular salvat</span><span className="v">{vocab.length}</span></div>
        <div className="kv-row"><span className="k">Expresii active (folosite spontan)</span><span className="v">{activeVocab.length}</span></div>
        <div className="kv-row"><span className="k">Vocabular scadent la repetare</span><span className="v">{dueVocab.length}</span></div>
        <div className="kv-row"><span className="k">Exerciții de pronunție</span><span className="v">{pron.length}</span></div>
        <div className="kv-row"><span className="k">Scor mediu pronunție (ultimele 30)</span><span className="v">{avgPron != null ? `${avgPron}%` : '—'}</span></div>
        <div className="kv-row"><span className="k">Rapoarte săptămânale</span><span className="v">{stats.reportsCount}</span></div>
      </div>

      <h2>Date și siguranță</h2>
      <div className="card">
        <p className="tiny">
          Progresul tău este păstrat în siguranță. Poți descărca o copie, restaura un backup sau șterge toate datele de învățare.
        </p>
        <div className="btn-row">
          <button onClick={onExport}><Icon name="arrowDown" />Export backup</button>
          <label className="btn" style={{ display: 'inline-block' }}>
            <Icon name="arrowUp" />Import backup
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
          <button className="btn-danger" onClick={onWipe}><Icon name="trash" />Șterge tot</button>
        </div>
      </div>
    </>
  );
}
