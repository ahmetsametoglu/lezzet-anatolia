/* global self, fetch, URL */
// Önbellek yok: sayfa istekleri olduğu gibi ağdan gelir, eski bir kopya hiçbir zaman sunulmaz. İşleyici yine de boş değil, çünkü
// Chrome boş `fetch` işleyicisini yok sayar ve kurulum düğmesi hiç çıkmaz.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request));
});

// Gövde sunucunun tarayıcı bildirimi sürücüsünden gelir: `{ title, body, url }`. `badge` Android'in durum çubuğu ve bildirim
// başlığındaki küçük simgedir; yalnız saydamlığı okunur, verilmezse Chrome kendi zilini koyar.
self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : null;
  if (!message) return;
  const path = message.url ? new URL(message.url, self.location.origin).pathname : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Bildirimin sayfası görünür bir pencerede açıksa gösterilmez, çünkü sayfa canlı zille zaten güncellenir.
      if (path && windows.some((window) => window.visibilityState === 'visible' && new URL(window.url).pathname === path)) return undefined;
      return self.registration.showNotification(message.title, {
        body: message.body,
        icon: '/pwa/icon-192.png',
        badge: '/pwa/badge-96.png',
        data: { url: message.url },
      });
    }),
  );
});

// Açık pencere varsa o sayfaya götürülür, yoksa yenisi açılır; kurulu uygulamada pencere uygulamanın kendisidir.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      const open = windows[0];
      if (!open) return self.clients.openWindow(url);
      return open
        .navigate(url)
        .then((client) => (client || open).focus())
        .catch(() => self.clients.openWindow(url));
    }),
  );
});
