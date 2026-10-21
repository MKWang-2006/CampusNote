/* Campus Notes kit.js: progressive enhancement (docs/architecture/UI_KIT.md §5).
   Every page works without this file; it only makes forms nicer. No dependencies.

   <form data-ajax>              submit with fetch, then apply the JSON reply:
                                   data-bind="key"          input value / element text = json[key]
                                   data-bind-pressed="key"  aria-pressed = json[key]
                                   data-bind-not="key"      input value = json[key] ? 0 : 1
   data-confirm="Text?"          on a form or a submit button: ask first (data-confirm-ok names the button)
   <form data-leave-guard>       leaving with unsaved changes asks "Leave and discard this draft?"
   <textarea data-max="750">     live "750 characters left" counter
   data-countdown="<ISO time>"   live hh:mm:ss; at zero adds .is-open and fires countdown:done
   <select data-autosubmit>      submits its form on change
   <input type="file" data-preview="images" data-max-files="6">   thumbnails and the image limit
*/
(function () {
  'use strict';

  var token = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  // ------------------------------------------------------------ confirm dialog
  var dialog = null;

  function ask(text, okLabel, cancelLabel) {
    if (!dialog) {
      dialog = document.getElementById('confirm-dialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.className = 'confirm';
        dialog.innerHTML =
          '<p class="confirm-text"></p><div class="confirm-actions">' +
          '<button type="button" class="cancel"></button><button type="button" class="ok"></button></div>';
        document.body.appendChild(dialog);
      }
    }
    if (typeof dialog.showModal !== 'function') return Promise.resolve(window.confirm(text));
    dialog.querySelector('.confirm-text').textContent = text;
    dialog.querySelector('.ok').textContent = okLabel || 'OK';
    dialog.querySelector('.cancel').textContent = cancelLabel || 'Cancel';
    dialog.querySelector('.cancel').hidden = cancelLabel === null; // null: a notice with OK only
    return new Promise(function (resolve) {
      function finish(answer) {
        dialog.querySelector('.ok').onclick = null;
        dialog.querySelector('.cancel').onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(answer);
      }
      dialog.querySelector('.ok').onclick = function () {
        finish(true);
      };
      dialog.querySelector('.cancel').onclick = function () {
        finish(false);
      };
      dialog.onclose = function () {
        finish(false);
      };
      dialog.showModal();
      dialog.querySelector(cancelLabel === null ? '.ok' : '.cancel').focus();
    });
  }

  // ------------------------------------------------------------ submitting
  var confirmed = new WeakSet();

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      var button = event.submitter;
      var question =
        (button && button.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
      if (question && !confirmed.has(form)) {
        event.preventDefault();
        var okLabel =
          (button && button.getAttribute('data-confirm-ok')) ||
          form.getAttribute('data-confirm-ok');
        ask(question, okLabel).then(function (yes) {
          if (!yes) return;
          confirmed.add(form);
          if (form.requestSubmit) form.requestSubmit(button || undefined);
          else form.submit();
          confirmed.delete(form);
        });
        return;
      }
      if (form.hasAttribute('data-leave-guard')) form.dataset.submitting = '1';
      if (form.hasAttribute('data-ajax')) {
        event.preventDefault();
        ajax(form, button);
      }
    },
    false,
  );

  function ajax(form, button) {
    var data = new FormData(form);
    if (button && button.name) data.append(button.name, button.value);
    var body = new URLSearchParams();
    data.forEach(function (value, key) {
      if (typeof value === 'string') body.append(key, value);
    });
    var buttons = form.querySelectorAll('button, input[type="submit"]');
    buttons.forEach(function (b) {
      b.disabled = true;
    });
    fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-CSRF-Token': token },
      body: body,
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(
          function (json) {
            return { ok: res.ok, json: json };
          },
          function () {
            return { ok: false, json: {} };
          },
        );
      })
      .then(function (reply) {
        if (!reply.ok) {
          ask(reply.json.error || 'Something went wrong. Please try again.', 'OK', null);
          return;
        }
        if (!apply(form, reply.json) && reply.json.to) window.location.assign(reply.json.to);
      })
      .catch(function () {
        form.removeAttribute('data-ajax'); // offline or a crash: fall back to a normal submit
        form.submit();
      })
      .finally(function () {
        buttons.forEach(function (b) {
          b.disabled = false;
        });
      });
  }

  // Returns true when the reply updated something in the form.
  function apply(form, json) {
    var touched = false;
    form.querySelectorAll('[data-bind]').forEach(function (el) {
      var key = el.getAttribute('data-bind');
      if (!(key in json)) return;
      if ('value' in el && el.tagName !== 'BUTTON') el.value = json[key];
      else el.textContent = json[key];
      touched = true;
    });
    form.querySelectorAll('[data-bind-pressed]').forEach(function (el) {
      var key = el.getAttribute('data-bind-pressed');
      if (!(key in json)) return;
      el.setAttribute('aria-pressed', json[key] ? 'true' : 'false');
      touched = true;
    });
    form.querySelectorAll('[data-bind-not]').forEach(function (el) {
      var key = el.getAttribute('data-bind-not');
      if (!(key in json)) return;
      el.value = json[key] ? '0' : '1';
      touched = true;
    });
    return touched;
  }

  // ------------------------------------------------------------ leave guard
  function dirtyGuard() {
    return Array.prototype.find.call(
      document.querySelectorAll('form[data-leave-guard]'),
      function (f) {
        return f.dataset.dirty === '1' && f.dataset.submitting !== '1';
      },
    );
  }

  document.addEventListener('input', function (event) {
    var form = event.target.form;
    if (form && form.hasAttribute('data-leave-guard')) form.dataset.dirty = '1';
  });
  document.addEventListener('change', function (event) {
    var form = event.target.form;
    if (form && form.hasAttribute('data-leave-guard')) form.dataset.dirty = '1';
  });

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || event.defaultPrevented || link.target === '_blank') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    var form = dirtyGuard();
    if (!form || form.contains(link)) return;
    event.preventDefault();
    ask('Leave and discard this draft?', 'Leave', 'Keep editing').then(function (yes) {
      if (!yes) return;
      form.dataset.dirty = '0';
      window.location.assign(link.href);
    });
  });

  window.addEventListener('beforeunload', function (event) {
    if (dirtyGuard()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // ------------------------------------------------------------ counters
  function length(text) {
    return Array.from(text).length; // characters, as the server counts them
  }

  function setupCounter(el) {
    var max = Number(el.getAttribute('data-max'));
    if (!max) return;
    var counter = el.id && document.querySelector('[data-counter-for="' + el.id + '"]');
    if (!counter) {
      counter = document.createElement('span');
      counter.className = 'counter';
      el.insertAdjacentElement('afterend', counter);
    }
    counter.setAttribute('aria-live', 'polite');
    function update() {
      var left = max - length(el.value);
      counter.textContent =
        left >= 0
          ? left + (left === 1 ? ' character left' : ' characters left')
          : -left + (left === -1 ? ' character too many' : ' characters too many');
      counter.classList.toggle('is-over', left < 0);
    }
    el.addEventListener('input', update);
    update();
  }

  // ------------------------------------------------------------ countdowns
  var countdowns = [];

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function tick() {
    var now = Date.now();
    countdowns = countdowns.filter(function (item) {
      var left = Math.max(0, Math.round((item.at - now) / 1000));
      item.el.textContent =
        pad(Math.floor(left / 3600)) +
        ':' +
        pad(Math.floor((left % 3600) / 60)) +
        ':' +
        pad(left % 60);
      if (left > 0) return true;
      item.el.classList.add('is-open');
      item.el.dispatchEvent(new CustomEvent('countdown:done', { bubbles: true }));
      return false;
    });
    if (countdowns.length) window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }

  // ------------------------------------------------------------ image previews
  var TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  function setupPreview(input) {
    var max = Number(input.getAttribute('data-max-files')) || 6;
    var box = document.createElement('div');
    box.className = 'previews';
    var error = document.createElement('p');
    error.className = 'error';
    error.hidden = true;
    input.insertAdjacentElement('afterend', box);
    box.insertAdjacentElement('afterend', error);
    input.addEventListener('change', function () {
      box.innerHTML = '';
      error.hidden = true;
      var files = Array.from(input.files || []);
      var bad =
        files.length > max ||
        files.some(function (f) {
          return TYPES.indexOf(f.type) < 0 || f.size > 5 * 1024 * 1024;
        });
      if (bad) {
        input.value = '';
        error.textContent =
          max === 1
            ? 'One image only: JPEG, PNG, WebP or GIF, at most 5 MB.'
            : 'Up to ' + max + ' images, JPEG, PNG, WebP or GIF, 5 MB each.';
        error.hidden = false;
        return;
      }
      files.forEach(function (file) {
        var img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        img.onload = function () {
          URL.revokeObjectURL(img.src);
        };
        box.appendChild(img);
      });
    });
  }

  // ------------------------------------------------------------ start
  function start() {
    document.querySelectorAll('[data-max]').forEach(setupCounter);
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
      var at = Date.parse(el.getAttribute('data-countdown'));
      if (!isNaN(at)) countdowns.push({ el: el, at: at });
    });
    if (countdowns.length) tick();
    document.querySelectorAll('select[data-autosubmit]').forEach(function (select) {
      select.addEventListener('change', function () {
        if (select.form.requestSubmit) select.form.requestSubmit();
        else select.form.submit();
      });
    });
    document.querySelectorAll('input[type="file"][data-preview="images"]').forEach(setupPreview);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
