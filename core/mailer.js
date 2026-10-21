// E-mail (ARCHITECTURE.md §6.7). Every message is stored in `outbox`, which /dev/mailbox shows,
// so the demo needs no mail server. With SMTP_URL set (smtp://user:pass@host:587) it is sent
// instead, and the outbox keeps only the recipient and subject: the text holds one-time codes,
// which the database otherwise stores only as hashes.
const config = require('./config');
const { q } = require('./db');

const SENT_BY_SMTP = '(sent by e-mail; the text is not kept)';

let transport = null;

function smtp() {
  if (!transport) {
    const nodemailer = require('nodemailer'); // loaded only when SMTP is configured
    transport = nodemailer.createTransport(config.smtpUrl);
  }
  return transport;
}

async function send({ to, subject, text }) {
  const viaSmtp = Boolean(config.smtpUrl) && !config.isTest;
  const res = await q('INSERT INTO outbox (to_email, subject, body_text) VALUES (?, ?, ?)', [
    to,
    subject,
    viaSmtp ? SENT_BY_SMTP : text,
  ]);
  if (viaSmtp) await smtp().sendMail({ from: config.mailFrom, to, subject, text });
  return res.insertId;
}

module.exports = { send };
