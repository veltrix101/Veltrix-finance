(function () {
  'use strict';
  var script = document.currentScript;
  var base = new URL('../', script.src);
  var promptEvent = null;
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js', base).href, {scope: base.pathname}).catch(function () {});
    });
  }
  if (standalone) return;
  var style = document.createElement('style');
  style.textContent = '.v-install{position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));right:16px;z-index:900;padding:11px 16px;border:1px solid #7894ff;border-radius:12px;background:#101114;color:#fff;font:600 14px system-ui;box-shadow:0 4px 24px #0007;cursor:pointer}.v-install-panel{position:fixed;inset:0;z-index:10000;background:#000b;display:flex;align-items:center;justify-content:center;padding:20px}.v-install-panel[hidden]{display:none}.v-install-card{max-width:400px;width:100%;max-height:85vh;overflow:auto;border:1px solid #426bff;border-radius:18px;background:#101114;color:#fff;padding:24px;font:16px/1.6 system-ui;box-shadow:0 16px 60px #0009}.v-install-card h2{margin:0 0 12px;font-size:24px}.v-install-card button{padding:10px 16px;border-radius:9px;border:1px solid #7894ff;background:#426bff;color:#fff;font:600 15px system-ui;cursor:pointer}.v-install-card :focus-visible,.v-install:focus-visible{outline:3px solid white;outline-offset:4px}';
  document.head.appendChild(style);
  var button = document.createElement('button');
  button.type = 'button'; button.className = 'v-install'; button.textContent = 'Install app';
  button.setAttribute('aria-haspopup', 'dialog');
  var panel = document.createElement('div');
  panel.className = 'v-install-panel'; panel.hidden = true;
  panel.innerHTML = '<section class="v-install-card" role="dialog" aria-modal="true" aria-labelledby="v-install-title"><h2 id="v-install-title">Install VEYDRAVO</h2><div id="v-install-help"></div><p>Your existing account works in the app. An internet connection is required to sign in and sync your finances.</p><button type="button">Got it</button></section>';
  document.body.appendChild(button); document.body.appendChild(panel);
  var close = panel.querySelector('button');
  function hide() { panel.hidden = true; button.focus(); }
  close.onclick = hide;
  panel.onclick = function (event) { if (event.target === panel) hide(); };
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
    if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
  });
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); promptEvent = event;
  });
  window.addEventListener('appinstalled', function () { button.hidden = true; panel.hidden = true; promptEvent = null; });
  button.onclick = async function () {
    if (promptEvent) {
      var available = promptEvent; promptEvent = null;
      try { await available.prompt(); var choice = await available.userChoice; if (choice.outcome === 'accepted') button.hidden = true; return; } catch (_) {}
    }
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var text = ios ? 'On your iPhone or iPad, open this page in Safari. Tap Share, then Add to Home Screen, then Add. If offered, keep Open as Web App enabled.' : 'Open this page in Chrome or Edge. Open the browser menu and choose Install app or Add to Home screen. On a computer, you may also see an install icon in the address bar. If the option is missing, keep using the website and try again in a supported browser.';
    panel.querySelector('#v-install-help').textContent = text;
    panel.hidden = false; close.focus();
  };
}());
