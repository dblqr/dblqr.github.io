// Emergency kill switch for the offline app (OWASP: have a recovery process
// for a broken or compromised service worker).
//
// NOT deployed normally. To use it: replace sw.js with this file (keep the
// name sw.js), deploy, and every visitor's browser will, on its next visit or
// update check, delete all of this site's caches, unregister the service
// worker, and reload open tabs from the network. Restore the real sw.js in a
// later deploy once the problem is fixed.
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
        await self.registration.unregister();
        const windows = await self.clients.matchAll({ type: 'window' });
        await Promise.all(windows.map((client) => client.navigate(client.url)));
    })());
});
