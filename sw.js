const CACHE = 'nightline-shell-v1';
const SHELL = ['./', './index.html', './style.css', './app.mjs', './model.mjs', './storage.mjs',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nightline-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(event.request, { ignoreSearch: true });
    if (saved) return saved;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return await cache.match('./index.html');
      throw error;
    }
  }));
});
