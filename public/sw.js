// Ștampilat automat la fiecare `npm run build` (scripts/stamp-sw.mjs) cu hash-ul commit-ului,
// ca fiecare deploy să aibă un sw.js diferit — altfel browserul nu-l vede ca „nou" și cache-ul
// vechi nu se mai curăță niciodată. Valoarea de mai jos e doar fallback-ul pentru dev local.
const CACHE = 'englezaai-v4';
const REMINDER_CACHE = 'englezaai-reminder-v1';
const REMINDER_KEY = '/__engleza_reminder_data__';
// Doar asset-urile cu hash în nume + staticele cunoscute intră în cache;
// orice altceva vine mereu de pe rețea, ca aplicația să nu rămână blocată pe o versiune veche.
const CACHEABLE = /^\/(assets\/|icon\.svg$|manifest\.webmanifest$)/;

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first pentru navigare (cu fallback offline), cache-first doar pentru assets hash-uite.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  if (!CACHEABLE.test(url.pathname)) return; // dev modules, /api etc. — mereu de pe rețea
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
    )
  );
});

// Configurația mementoului este oglindită local în service worker. Astfel, acolo unde
// browserul oferă Periodic Background Sync, notificarea poate apărea și cu aplicația închisă.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SCHEDULE_REMINDER') return;
  event.waitUntil(
    caches.open(REMINDER_CACHE).then((cache) => cache.put(
      REMINDER_KEY,
      new Response(JSON.stringify(event.data.payload), { headers: { 'Content-Type': 'application/json' } })
    ))
  );
});

async function readReminder() {
  const cache = await caches.open(REMINDER_CACHE);
  const response = await cache.match(REMINDER_KEY);
  return response ? response.json() : null;
}

async function writeReminder(value) {
  const cache = await caches.open(REMINDER_CACHE);
  await cache.put(REMINDER_KEY, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'engleza-smart-reminder') return;
  event.waitUntil((async () => {
    const reminder = await readReminder();
    if (!reminder?.enabled || reminder.permission !== 'granted') return;
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const reachedTime = now.getHours() > reminder.hour || (now.getHours() === reminder.hour && now.getMinutes() >= reminder.minute);
    if (!reachedTime || reminder.lastShownDate === date) return;
    await self.registration.showNotification(reminder.message.title, {
      body: reminder.message.body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'engleza-smart-reminder',
      data: { url: '/#/learn?mode=rescue' },
    });
    await writeReminder({ ...reminder, lastShownDate: date });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/#/learn?mode=rescue', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(targetUrl);
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});
