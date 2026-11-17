'use strict';
// Broker status always comes from the network. Show an explicit offline screen on navigation failure.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).pathname !== '/') return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo Bot offline</title><body style="background:#101c31;color:white;font:18px system-ui;padding:2em"><h1>Dashboard offline</h1><p>Reconnect to check the bot’s current status.</p><a style="color:#8be4ce" href="/">Try again</a></body>',
    {headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}}
  )));
});
