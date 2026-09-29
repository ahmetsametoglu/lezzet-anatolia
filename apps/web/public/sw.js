/* global self, fetch */
// Önbellek yok: sayfa istekleri olduğu gibi ağdan gelir, eski bir kopya hiçbir zaman sunulmaz. İşleyici yine de boş değil, çünkü
// Chrome boş `fetch` işleyicisini yok sayar ve kurulum düğmesi hiç çıkmaz.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request));
});
