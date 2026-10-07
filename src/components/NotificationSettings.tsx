import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { getDueOverview, getReminderPreferences } from '../microlearning/state';
import type { DueOverview, ReminderPreferences } from '../microlearning/types';
import {
  configureReminder,
  notificationSupport,
  requestReminderPermission,
  showReminderNow,
} from '../notifications';

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState<ReminderPreferences | null>(null);
  const [due, setDue] = useState<DueOverview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const support = notificationSupport();

  useEffect(() => {
    Promise.all([getReminderPreferences(), getDueOverview()])
      .then(([saved, overview]) => { setPreferences(saved); setDue(overview); })
      .catch((error) => setMessage(String(error?.message ?? error)));
  }, []);

  async function update(next: ReminderPreferences) {
    setPreferences(next);
    setBusy(true);
    try {
      await configureReminder(next);
      setMessage(next.enabled ? 'Memento activ. Ora și numărul de elemente au fost trimise aplicației instalate.' : 'Mementourile au fost oprite.');
    } catch (error: any) {
      setMessage(String(error?.message ?? error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled() {
    if (!preferences) return;
    if (!preferences.enabled) {
      setBusy(true);
      try {
        const permission = await requestReminderPermission();
        const next = { ...preferences, enabled: permission === 'granted', permission };
        await update(next);
        if (permission !== 'granted') setMessage('Permisiunea nu a fost acordată. O poți activa din setările browserului.');
      } catch (error: any) {
        setMessage(String(error?.message ?? error));
        setBusy(false);
      }
    } else {
      await update({ ...preferences, enabled: false, permission: Notification.permission });
    }
  }

  if (!preferences) return <div className="card"><span className="spinner" /> Se verifică notificările…</div>;

  return (
    <div className="card notification-settings">
      <div className="notification-title"><Icon name="megaphone" /><div><strong>Memento inteligent</strong><small>Te trimite direct la elementele pe cale să fie uitate.</small></div></div>
      {!support.supported ? (
        <div className="info-banner">{support.reason} Pe iPhone, instalează mai întâi aplicația pe ecranul principal.</div>
      ) : (
        <>
          <label className="switch-row">
            <span>{preferences.enabled ? 'Activ' : 'Oprit'}</span>
            <input type="checkbox" checked={preferences.enabled} onChange={toggleEnabled} disabled={busy} />
          </label>
          <label className="field">
            <span>Ora preferată</span>
            <input
              type="time"
              value={`${String(preferences.hour).padStart(2, '0')}:${String(preferences.minute).padStart(2, '0')}`}
              disabled={!preferences.enabled || busy}
              onChange={(event) => {
                const [hour, minute] = event.target.value.split(':').map(Number);
                void update({ ...preferences, hour, minute });
              }}
            />
          </label>
          <p className="tiny">Mesajul actual: {due?.total ? `${due.total} ${due.total === 1 ? 'element' : 'elemente'}, aproximativ ${Math.max(1, Math.ceil(due.estimatedSeconds / 60))} min` : 'totul este la zi'}</p>
          {preferences.enabled && <button onClick={() => showReminderNow(due ?? undefined).then(() => setMessage('Notificare de test trimisă.')).catch((error) => setMessage(String(error?.message ?? error)))}><Icon name="megaphone" />Trimite un test</button>}
        </>
      )}
      {message && <p className="tiny">{message}</p>}
    </div>
  );
}
