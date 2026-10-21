// Development tools (BB-5). Mounted only when NODE_ENV is development, before the login wall.
//   GET /dev/login-as/:handle   log in as any account (the login page lists the seed personas)
//   GET /dev/mailbox            every e-mail the app "sent" (the outbox table), newest first
const express = require('express');
const { q } = require('./db');
const { login } = require('./auth');
const { notFound, forbidden } = require('./errors');

const router = express.Router();

router.get('/dev/login-as/:handle', async (req, res) => {
  const user = await q.one('SELECT user_id, status FROM users WHERE handle = ?', [
    req.params.handle,
  ]);
  if (!user) throw notFound('No account has that handle');
  if (user.status === 'banned') throw forbidden('This account is suspended.');
  await login(req, user.user_id);
  const next =
    typeof req.query.next === 'string' && /^\/(?![/\\])/.test(req.query.next)
      ? req.query.next
      : '/feed';
  res.redirect(303, next);
});

router.get('/dev/mailbox', async (req, res) => {
  const to = typeof req.query.to === 'string' ? req.query.to.trim().toLowerCase() : '';
  const mails = to
    ? await q('SELECT * FROM outbox WHERE to_email = ? ORDER BY mail_id DESC LIMIT 50', [to])
    : await q('SELECT * FROM outbox ORDER BY mail_id DESC LIMIT 50');
  res.page('dev/mailbox', {
    title: 'Dev mailbox',
    back: req.me ? '/me' : '/auth/login',
    to,
    mails,
  });
});

module.exports = router;
