// Service worker: makes the site work offline after the first visit.
//
// - Site files (including the self-hosted libraries in vendor/): network
//   first, so online visitors always get the latest deploy; the cached copy
//   is the offline fallback.
// - Everything else (Google Tag Manager, Buy Me a Coffee): not handled.
//
// test.js checks that SHELL_FILES covers every deployed file the app needs.
// Bump CACHE_NAME to drop old caches after a change to this file. For an
// emergency rollback see sw-kill-switch.js.

const CACHE_NAME = 'dblqr-v3';

const SHELL_FILES = [
    './',
    'index.html',
    'ja/',
    'es/',
    'pt-br/',
    'styles.css',
    'analytics.js',
    'i18n.js',
    'timestamp.js',
    'daily.js',
    'scanner.js',
    'app.js',
    'vendor/qrcode.min.js',
    'vendor/html5-qrcode.min.js',
    'favicon.ico',
    'manifest.webmanifest',
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL_FILES);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true })
            || (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
        if (cached) return cached;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request));
    }
});
