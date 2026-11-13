/* Siffer service worker — appskall, frakoblet støtte og oppdateringer */
const VERSION = '1.1.1';
const SHELL_CACHE_PREFIX = 'siffer-shell-';
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${VERSION}`;
const FONT_CACHE = 'siffer-fonts-v1';
const INDEX_URL = new URL('./index.html', self.location).href;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/maskable.svg',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-144.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(CORE_ASSETS.map(asset =>
      new Request(new URL(asset, self.location).href, { cache: 'reload' })
    ));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldShellCaches = keys.filter(key => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE);
    await Promise.all(oldShellCaches.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request, event));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, event));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidateFonts(request, event));
  }
});

async function networkFirstNavigation(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) event.waitUntil(cache.put(INDEX_URL, response.clone()));
    return response;
  } catch (error) {
    return (await cache.match(INDEX_URL)) ||
           (await cache.match(new URL('./', self.location).href)) ||
           new Response('<!doctype html><html lang="nb"><meta charset="utf-8"><title>Siffer</title><body style="font-family:system-ui;background:#0B0D10;color:#F3F5F9;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>Siffer</h1><p>Appen er ikke hurtigbufret ennå. Koble til nettet og åpne den på nytt.</p></div></body></html>', {
             status: 503,
             headers: { 'Content-Type': 'text/html; charset=utf-8' }
           });
  }
}

async function cacheFirst(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    event.waitUntil(fetch(request).then(response => {
      if (response && response.ok) return cache.put(request, response.clone());
    }).catch(() => {}));
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function staleWhileRevalidateFonts(request, event) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      await trimCache(FONT_CACHE, 40);
    }
    return response;
  }).catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  return response || new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(keys.slice(0, keys.length - maxItems).map(key => cache.delete(key)));
  }
}
