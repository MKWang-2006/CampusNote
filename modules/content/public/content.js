/* CT-8: progressive image viewer. Original-file anchors work without this script. */
(function () {
  'use strict';
  const links = Array.from(document.querySelectorAll('[data-content-image]'));
  const dialog = document.querySelector('.content-viewer');
  if (!links.length || !dialog || typeof dialog.showModal !== 'function') return;
  const picture = dialog.querySelector('[data-viewer-image]');
  const counter = dialog.querySelector('[data-viewer-count]');
  const previous = dialog.querySelector('[data-viewer-previous]');
  const next = dialog.querySelector('[data-viewer-next]');
  const close = dialog.querySelector('[data-viewer-close]');
  const original = dialog.querySelector('[data-viewer-original]');
  const error = dialog.querySelector('[data-viewer-error]');
  const stage = dialog.querySelector('[data-viewer-stage]');
  let index = 0;
  let opener = null;
  let position = null;
  let oldOverflow = '';
  let touch = null;

  function show(i) {
    index = Math.max(0, Math.min(links.length - 1, i));
    error.hidden = true;
    picture.alt = links[index].querySelector('img').alt;
    picture.src = links[index].href;
    original.href = links[index].href;
    counter.textContent = 'Image ' + (index + 1) + ' of ' + links.length;
    previous.disabled = index === 0;
    next.disabled = index === links.length - 1;
  }
  links.forEach(function (link, i) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', function (event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      opener = link;
      position = { x: window.scrollX, y: window.scrollY };
      oldOverflow = document.documentElement.style.overflow;
      show(i);
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
      close.focus();
    });
  });
  close.addEventListener('click', function () {
    dialog.close();
  });
  previous.addEventListener('click', function () {
    show(index - 1);
  });
  next.addEventListener('click', function () {
    show(index + 1);
  });
  dialog.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll('button:not(:disabled), a[href]'));
      const current = controls.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      const target =
        current < 0
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (current + step + controls.length) % controls.length;
      // Move explicitly: Safari's keyboard preference can skip buttons in native Tab order.
      event.preventDefault();
      controls[target].focus();
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  // The native dialog handles Escape; explicit Tab order also avoids browser-chrome focus.
  dialog.addEventListener('close', function () {
    document.documentElement.style.overflow = oldOverflow;
    touch = null;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    if (position) window.scrollTo(position.x, position.y);
  });
  picture.addEventListener('error', function () {
    error.hidden = false;
  });
  picture.addEventListener('load', function () {
    error.hidden = true;
  });
  stage.addEventListener('pointerdown', function (event) {
    if (event.pointerType !== 'touch' || !event.isPrimary) {
      touch = null;
      return;
    }
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener('pointercancel', function () {
    touch = null;
  });
  stage.addEventListener('pointerup', function (event) {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
  });
})();
