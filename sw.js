/* Keep account pages and financial responses on the network, never in a shared cache. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(function () {
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101114"><title>VEYDRAVO | Offline</title><body style="margin:0;padding:40px 24px;background:#101114;color:white;font:18px/1.6 system-ui"><main style="max-width:440px;margin:15vh auto"><h1>You’re offline</h1><p>Reconnect to open VEYDRAVO and sync your finances.</p><button onclick="location.reload()" style="padding:12px 20px;background:#426bff;color:white;border:0;border-radius:9px;font:inherit">Try again</button></main></body></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }));
});
