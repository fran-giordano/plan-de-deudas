/* Service worker: guarda todo el código de la app para que funcione sin conexión.
   Para publicar una versión nueva, cambiá VERSION. */
var VERSION = 'pdd-v1';
var FILES = [
  './', './index.html', './styles.css', './calc.js', './backup.js', './store.js', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.all(FILES.map(function (u) {
        return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
          if (!r.ok) throw new Error('No se pudo bajar ' + u);
          return c.put(u, r);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== VERSION && k.indexOf('pdd-') === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(function (c) {
      return c.match(r, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(r).catch(function () {
          return r.mode === 'navigate' ? c.match('./index.html') : Response.error();
        });
      });
    })
  );
});
