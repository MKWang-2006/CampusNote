// Pages and responses (ARCHITECTURE.md §6.3), and the 404 and error handlers (§4 step 10).
//
//   res.page(view, { title, tab, back, hideTabs, styles, scripts, ...yourLocals })
//     renders the view, then views/layout.ejs around it. Logged-in pages also get each module's
//     locals hook (the Messages badge) and the one-time flash message.
//   res.done({ to, json, flash })
//     ends a POST: kit.js fetch calls (Accept: application/json) receive `json`; a normal form
//     submit gets the flash stored for the next page and a 303 redirect to `to`.
const { HttpError, NOT_FOUND } = require('./errors');
const config = require('./config');

const TITLES = {
  400: 'Something is not right',
  401: 'Please log in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Already done',
  413: 'Too large',
  429: 'Slow down',
  500: 'Something went wrong',
};
const MESSAGES = {
  400: 'Something in the request is not right. Go back and try again.',
  401: 'Please log in first.',
  403: 'You do not have permission to do that.',
  404: NOT_FOUND,
  413: 'That is too large to send.',
  500: 'Something went wrong on our side. Please try again.',
};

// Names Express or EJS read from a page's locals as options: `settings` holds the views folders
// (every include then fails), `async` makes EJS return a promise, `filename` breaks includes.
// `body` is the page's own HTML inside the layout.
const RESERVED = new Set([
  'settings', 'cache', 'filename', 'async', 'client', 'strict', 'scope', 'context', 'debug',
  'compileDebug', 'delimiter', 'rmWhitespace', '_with', 'body', 'locals',
]); // prettier-ignore

// kit.js asks for JSON; browsers and plain form posts ask for HTML.
const wantsJson = (req) => req.accepts(['html', 'json']) === 'json';

function installRender(modules) {
  const hooks = modules.filter((m) => typeof m.locals === 'function');

  return function render(req, res, next) {
    res.page = function page(view, locals = {}) {
      build(req, res, view, locals).catch(next);
      return res;
    };

    res.done = function done({ to, json, flash } = {}) {
      if (wantsJson(req))
        return res.json(json ?? { ok: true, to: to ?? null, flash: flash ?? null });
      if (flash && req.session) req.session.flash = flash;
      return res.redirect(303, to || '/');
    };

    async function build(req, res, view, locals) {
      const clash = Object.keys(locals).find((key) => RESERVED.has(key));
      if (clash) {
        throw new Error(`res.page('${view}'): the local name "${clash}" is reserved; rename it`);
      }
      // Module hooks run only for pages, not for redirects and JSON, so a POST costs no extra query.
      if (req.me && !res.locals.hooksDone) {
        res.locals.hooksDone = true;
        for (const m of hooks) merge(res.locals, await m.locals(req));
      }
      // The flash is shown once: by the first page rendered after it was set.
      if (req.session && req.session.flash) {
        res.locals.flash = req.session.flash;
        delete req.session.flash;
      }
      const frame = {
        title: '',
        tab: null,
        back: null,
        hideTabs: !req.me,
        styles: [],
        scripts: [],
        ...locals,
      };
      const body = await renderAsync(res, view, frame);
      const html = await renderAsync(res, 'layout', { ...frame, body });
      res.send(html);
    }

    next();
  };
}

function renderAsync(res, view, locals) {
  return new Promise((resolve, reject) =>
    res.render(view, locals, (err, html) => (err ? reject(err) : resolve(html))),
  );
}

// One level deep, so { badges: { messages: 3 } } adds to badges instead of replacing it.
function merge(target, extra) {
  for (const [key, value] of Object.entries(extra || {})) {
    const old = target[key];
    target[key] =
      old && value && typeof old === 'object' && typeof value === 'object' && !Array.isArray(value)
        ? { ...old, ...value }
        : value;
  }
}

function notFoundHandler(req, res, next) {
  next(new HttpError(404, NOT_FOUND));
}

// Our HttpErrors carry a message for the user; anything else (a bug, a parse error) gets a
// generic message, and a 5xx is logged with its stack.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = Number(err.status || err.statusCode) || 500;
  if (status < 400 || status > 599) status = 500;
  if (status >= 500 && !config.isTest) console.error(err);
  else if (status >= 500) console.error(err.stack || err);
  const message =
    err instanceof HttpError
      ? err.message
      : MESSAGES[status] || MESSAGES[status >= 500 ? 500 : 400];

  if (res.headersSent) return req.socket.destroy();
  res.status(status);
  if (wantsJson(req) || typeof res.page !== 'function') {
    return res.json({ error: message, status });
  }
  const view = status === 404 ? 'errors/404' : 'errors/500';
  const title = TITLES[status] || (status >= 500 ? TITLES[500] : TITLES[400]);
  res.locals.hooksDone = true; // an error page never waits on a module's hook
  res.page(view, { title, status, message, back: null, tab: null, hideTabs: !req.me });
  // If even the error page fails, res.page passes that to Express's own last-resort handler.
}

module.exports = { installRender, notFoundHandler, errorHandler, wantsJson };
