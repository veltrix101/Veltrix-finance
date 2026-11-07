/* Browser fallbacks used by both VEYDRAVO pages. No authentication state is stored here. */
(function () {
  'use strict';
  if (window.crypto && !window.crypto.randomUUID && window.crypto.getRandomValues) {
    try { window.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      var value = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
    }; } catch (_) { /* Modern browsers already supply this method. */ }
  }
  if (window.Element && !Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (var i = 0; i < arguments.length; i++) this.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]);
    };
  }
  function openDialog(dialog) {
    if (dialog.open || dialog.hasAttribute('open')) return;
    if (typeof dialog.showModal === 'function') { try { dialog.showModal(); return; } catch (_) {} }
    dialog.setAttribute('open', ''); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('data-dialog-fallback', '');
    dialog._previousFocus = document.activeElement;
    dialog._previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  function closeDialog(dialog) {
    if (dialog.hasAttribute('data-dialog-fallback')) {
      dialog.removeAttribute('open'); dialog.removeAttribute('aria-modal'); dialog.removeAttribute('data-dialog-fallback');
      document.body.style.overflow = dialog._previousOverflow || '';
      if (dialog._previousFocus && typeof dialog._previousFocus.focus === 'function') dialog._previousFocus.focus();
    } else if (typeof dialog.close === 'function') dialog.close();
  }
  function accountFailure() {
    var status = document.getElementById('authStatus');
    if (status) status.textContent = 'The account connection could not load. Check your connection, then reload this page to try again.';
    var button = document.getElementById('homeSignIn');
    if (button) button.onclick = function () { openDialog(document.getElementById('homeAuth')); };
  }
  window.VeydravoCompat = { openDialog: openDialog, closeDialog: closeDialog, accountFailure: accountFailure };
  var dialog = document.getElementById('homeAuth');
  if (dialog) {
    function loading(event) {
      if (event) event.preventDefault();
      openDialog(dialog);
      document.getElementById('authStatus').textContent = 'Connecting to your account… If this takes too long, check your connection and reload.';
    }
    document.getElementById('homeSignIn').onclick = loading;
    document.getElementById('authForm').onsubmit = loading;
    document.getElementById('registerBtn').onclick = loading;
    document.getElementById('closeHomeAuth').onclick = function () { closeDialog(dialog); };
    dialog.addEventListener('keydown', function (event) {
      if (!dialog.hasAttribute('data-dialog-fallback')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeDialog(dialog); }
      if (event.key !== 'Tab') return;
      var controls = Array.prototype.filter.call(dialog.querySelectorAll('button,input,select,a[href],[tabindex="0"]'), function (el) { return !el.disabled && el.getClientRects().length > 0; });
      var first = controls[0], last = controls[controls.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
})();
