import { useEffect, useState } from 'react';
import { Check, FlaskConical, Save, Server, Volume2 } from 'lucide-react';
import { DEFAULT_SETTINGS, getSettings, loadRemoteSettings, saveSettings, type AppSettings } from '../settings';
import { chatText } from '../api/openrouter';
import { testAzureTts, testGoogleTts } from '../audio/tts';
import { apiError, apiFetch } from '../api/backend';
import { adminRequest } from './api';
import type { BackendStatus } from './types';
import { Panel } from './ui';

export const SERVICE_LABELS: Record<string, string> = { openrouter: 'OpenRouter · conversație AI', googleAi: 'Google AI · voce', azure: 'Azure · voce și pronunție', grammar: 'LanguageTool · gramatică', revenueCat: 'RevenueCat · abonamente', mailjet: 'Mailjet · emailuri', firebaseEmailLinks: 'Firebase · administrare', compatibleTts: 'TTS compatibil OpenAI' };

export default function Configuration({ status, preview }: { status: BackendStatus | null; preview: boolean }) {
  const [settings, setSettings] = useState<AppSettings>(() => preview ? { ...DEFAULT_SETTINGS } : getSettings());
  const [saved, setSaved] = useState(settings);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); setMessage(''); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (preview || busy) return;
    setBusy('save'); setMessage(''); setError('');
    try { await adminRequest('save-config', { settings }); saveSettings(settings); await loadRemoteSettings(); setSaved(settings); setMessage('Configurația a fost salvată. Se aplică tuturor utilizatorilor la următoarea deschidere a aplicației.'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }
  async function test(kind: string) {
    if (preview || busy || dirty) return;
    setBusy(kind); setMessage(''); setError('');
    try {
      if (kind === 'ai') { const result = await chatText([{ role: 'user', content: 'Reply with exactly: OK' }], { feature: 'admin_test', maxTokens: 32 }); if (!result.includes('OK')) throw new Error(`Răspuns neașteptat: ${result.slice(0, 80)}`); }
      else if (kind === 'google') await testGoogleTts();
      else if (kind === 'azure-voice') await testAzureTts();
      else { const res = await apiFetch('azure', { method: 'POST', body: JSON.stringify({ test: true }) }); if (!res.ok) throw await apiError(res, 'Azure', true); }
      setMessage('Test finalizat cu succes.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }
  const textField = (key: keyof AppSettings, label: string, caption?: string) => <label key={key}>{label}<input value={String(settings[key])} required={key !== 'freeModel'} maxLength={200} onChange={e => update(key, e.target.value.trim())} />{caption && <small>{caption}</small>}</label>;
  return <div className="admin-config-layout"><div><Panel title="Modele AI & voce" caption="Configurația globală a profesorului EnglezaAI" action={<span className={`admin-badge ${dirty ? 'amber' : 'green'}`}>{dirty ? 'Modificări nesalvate' : 'Configurație curentă'}</span>}>
    <form onSubmit={save}><fieldset disabled={Boolean(busy)}><h3>Inteligență artificială</h3><div className="admin-form-grid">{textField('chatModel', 'Model de conversație', 'Profesor, conversații și corecturi.')}{textField('utilityModel', 'Model utilitar', 'Analiză, explicații și traduceri.')}{textField('freeModel', 'Model pentru sarcini de fundal', 'Gol = dezactivat. Fallback automat pe modelul utilitar.')}{textField('sttModel', 'Model de transcriere')}</div><h3>Furnizori audio</h3><div className="admin-form-grid"><label>Speech-to-Text<select value={settings.sttProvider} onChange={e => update('sttProvider', e.target.value as AppSettings['sttProvider'])}><option value="openrouter">OpenRouter</option><option value="webspeech">Web Speech (browser)</option></select></label><label>Text-to-Speech<select value={settings.ttsProvider} onChange={e => update('ttsProvider', e.target.value as AppSettings['ttsProvider'])}><option value="browser">Vocea browserului</option><option value="google-ai">Google AI Studio</option><option value="azure">Azure Neural</option><option value="openai-compatible">API compatibil OpenAI</option></select></label>{textField('azureTtsVoiceEn', 'Voce Azure · engleză')}{textField('azureTtsVoiceRo', 'Voce Azure · română')}{settings.ttsProvider === 'google-ai' && <>{textField('googleTtsModel', 'Model Google TTS')}<label>Voce Google<select value={settings.googleTtsVoice} onChange={e => update('googleTtsVoice', e.target.value)}>{['Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat', 'Charon', 'Puck', 'Orus'].map(voice => <option key={voice}>{voice}</option>)}</select></label></>}{settings.ttsProvider === 'openai-compatible' && <>{textField('ttsModel', 'Model TTS')}{textField('ttsVoice', 'Voce TTS')}</>}</div>{settings.ttsProvider === 'google-ai' && <div className="admin-checkboxes"><label><input type="checkbox" checked={settings.googleTtsRomanianOnly} onChange={e => update('googleTtsRomanianOnly', e.target.checked)} />Pe desktop, Google doar pentru română</label><label><input type="checkbox" checked={settings.googleTtsMobileEnglish} onChange={e => update('googleTtsMobileEnglish', e.target.checked)} />Pe telefon, Google și pentru engleză</label></div>}<div className="admin-save-row"><p>Modificările afectează toți utilizatorii.</p><div className="admin-actions"><button type="button" disabled={!dirty} onClick={() => setSettings(saved)}>Renunță la modificări</button><button className="admin-primary" disabled={preview || !dirty}><Save size={16} />{busy === 'save' ? 'Se salvează…' : 'Salvează configurația'}</button></div></div></fieldset></form>
    {message && <div role="status" className="admin-notice success"><Check size={16} />{message}</div>}{error && <div role="alert" className="admin-notice error">{error}</div>}
    <div className="admin-test-section"><h3><FlaskConical size={17} /> Teste de conectivitate</h3><p>Salvează configurația înainte de testare. Testele audio redau o mostră de voce.</p><div className="admin-actions">{[['ai', 'Testează AI'], ['google', 'Voce Google'], ['azure-voice', 'Voce Azure'], ['azure', 'Pronunție Azure']].map(([key, label]) => <button key={key} type="button" disabled={preview || Boolean(busy) || dirty} onClick={() => void test(key)}>{key.includes('voice') || key === 'google' ? <Volume2 size={15} /> : <FlaskConical size={15} />}{busy === key ? 'Se testează…' : label}</button>)}</div></div>
  </Panel></div><div><Panel title="Integrări & infrastructură" caption="Starea configurării, fără verificare de uptime"><div className="admin-service-list">{Object.entries(SERVICE_LABELS).map(([key, label]) => <div key={key}><span className={`admin-dot ${status?.services[key] ? 'green' : 'amber'}`} /><span>{label}</span><small>{status ? status.services[key] ? 'Configurat' : 'Neconfigurat' : 'Necunoscut'}</small></div>)}</div></Panel><Panel title="Mediu de funcționare"><div className="admin-environment"><Server size={23} /><dl><dt>Domeniu</dt><dd>{status?.server.appUrl || '—'}</dd><dt>Proiect Firebase</dt><dd>{status?.server.firebaseProjectId || '—'}</dd><dt>Regiune Azure</dt><dd>{status?.server.azureRegion || '—'}</dd><dt>Protecție abonamente</dt><dd>{status ? status.server.subscriptionEnforcement ? 'Activată' : 'Dezactivată' : '—'}</dd><dt>Acces API</dt><dd>{status ? status.server.uidRestricted ? 'Restricționat la UID' : 'Conturi autentificate' : '—'}</dd></dl></div><p className="admin-caption">Cheile secrete sunt păstrate exclusiv pe server. Configurația se propagă la redeschiderea aplicației.</p></Panel></div></div>;
}
