/* global self, fetch */
// Önbellek yok: sayfa istekleri olduğu gibi ağdan gelir, eski bir kopya hiçbir zaman sunulmaz. İşleyici yine de boş değil, çünkü
// Chrome boş `fetch` işleyicisini yok sayar ve kurulum düğmesi hiç çıkmaz.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request));
});

// Gövde sunucunun tarayıcı bildirimi sürücüsünden gelir: `{ title, body, url }`.
self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : null;
  if (!message) return;
  event.waitUntil(
    self.registration.showNotification(message.title, { body: message.body, icon: '/pwa/icon-192.png', data: { url: message.url } }),
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
