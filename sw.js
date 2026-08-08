const CACHE_NAME = 'dj-academy-cache-v1';
const assets = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/mockData.js',
  '/logo.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(assets);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    }).catch(() => {
      return caches.match('/index.html');
    })
  );
});
