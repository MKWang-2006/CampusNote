// Builds the Express app (ARCHITECTURE.md §4). server.js starts it; tests use createApp() directly.
// The middleware order below is the contract every module relies on.
const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./core/config');
const ui = require('./core/ui');
const ref = require('./core/ref');
const { sessions } = require('./core/session');
const { loadUser, loginWall } = require('./core/auth');
const { csrf } = require('./core/csrf');
const { installRender, notFoundHandler, errorHandler } = require('./core/render');
const { loadModules, publicMatcher } = require('./core/modules');

function createApp() {
  const modules = loadModules();
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', [
    path.join(config.root, 'views'),
    ...modules.map((m) => path.join(m.dir, 'views')),
  ]);
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');

  // Template defaults, so even an error page rendered before a step below has what it needs.
  Object.assign(app.locals, {
    ui,
    ref,
    me: null,
    badges: {},
    flash: null,
    csrfToken: '',
    csrfField: () => '',
    csrfUrl: (p) => p,
    isDev: config.isDev,
  });

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use(installRender(modules));

  // 1. Static files
  app.use(
    '/static',
    express.static(path.join(config.root, 'public'), { maxAge: config.isProd ? '1d' : 0 }),
  );
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));
  for (const m of modules) {
    const dir = path.join(m.dir, 'public');
    if (fs.existsSync(dir)) app.use(`/m/${m.name}`, express.static(dir));
  }

  // 2. Body parsing and the session
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(sessions());

  // 3. Who is asking
  app.use(loadUser);

  // 4. CSRF token check for every POST, PUT, PATCH and DELETE
  app.use(csrf);

  // 5. Template locals (ui and the defaults are app.locals above; the flash is read by res.page)
  app.use(ref.ensureRef);

  // 6. Module locals hooks run inside res.page, for logged-in pages only (core/render.js)

  // 7. Public routes: the backbone's own, then the login wall lets identity's publicRoutes through
  app.get('/', (req, res) => res.redirect(303, req.me ? '/feed' : '/auth/login'));
  if (config.isDev) app.use(require('./core/dev'));

  // 8. The login wall
  app.use(loginWall(publicMatcher(modules)));

  // 9. Module routers, alphabetical, mounted at / with full paths
  for (const m of modules) app.use(m.router);

  // 10. Not found, then errors
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.modules = modules.map((m) => m.name);
  return app;
}

module.exports = { createApp };
