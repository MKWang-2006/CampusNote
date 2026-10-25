const express = require('express');
const { requireRole } = require('../../core/auth');
const { findVisible } = require('../../core/cards');
const { isDuplicate } = require('../../core/db');
const { notFound, badRequest } = require('../../core/errors');
const { int, text, oneOf } = require('../../core/validate');
const ui = require('../../core/ui');
const queries = require('./queries');
const { aliasName, otherName, notificationText } = require('./names');

const router = express.Router();
const styles = ['/m/messages/messages.css'];
const positiveId = (value) => int(value, { min: 1, max: 4294967295 });
const reasons = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['privacy', 'Privacy'],
  ['other', 'Other'],
];

router.get('/messages', async (req, res) => {
  const [unread, rows] = await Promise.all([
    queries.countUnread(req.me.userId),
    queries.listConversations(req.me.userId),
  ]);
  res.page('messages/home', {
    title: 'Messages',
    tab: 'messages',
    styles,
    unread,
    conversations: rows.map((row) => ({ ...row, display_name: otherName(row) })),
  });
});

router.get('/messages/notifications', async (req, res) => {
  const before = int(req.query.before, { min: 1 }) ?? Number.MAX_SAFE_INTEGER;
  const rows = await queries.listNotifications(req.me.userId, req.me.universityId, before);
  const shown = rows.slice(0, 30);
  if (shown.length) await queries.markNotificationsRead(req.me.userId, shown[0].notification_id);
  // The shared render hook runs after this update and computes the badge for this response.
  res.page('messages/notifications', {
    title: 'Notifications',
    tab: 'messages',
    back: '/messages',
    styles,
    notifications: shown.map((row) => ({
      ...row,
      text: notificationText(row),
      href: row.post_available
        ? `/posts/${row.post_id}` + (row.comment_id ? `#c${row.comment_id}` : '')
        : null,
    })),
    nextUrl:
      rows.length > 30 ? '/messages/notifications?before=' + shown.at(-1).notification_id : null,
  });
});

async function recipientFor(req) {
  let userId;
  let postId = null;
  let recipientName;
  let myName = null;
  let back;
  if (req.query.post !== undefined) {
    postId = positiveId(req.query.post);
    const post = postId && (await findVisible(postId, req.me));
    if (!post) throw notFound();
    const aliasNo =
      req.query.alias === undefined ? 0 : int(req.query.alias, { min: 0, max: 4294967295 });
    if (aliasNo === null) throw notFound();
    userId = aliasNo === 0 ? post.author_id : await queries.participantByAlias(postId, aliasNo);
    if (!userId) throw notFound();
    recipientName = otherName({ post_id: postId, other_alias_no: aliasNo });
    myName = aliasName(await queries.aliasOn(postId, req.me.userId));
    back = '/posts/' + postId;
  } else {
    const handle = req.query.to;
    if (typeof handle !== 'string' || !/^[a-z0-9]{9}$/.test(handle)) throw notFound();
    const user = await queries.userByHandle(handle);
    if (!user) throw notFound();
    userId = user.user_id;
    recipientName = otherName({
      post_id: null,
      other_public_name: user.display_name || user.handle,
    });
    back = '/u/' + user.handle;
  }
  if (userId === req.me.userId) throw badRequest('You cannot message yourself');
  return { userId, postId, recipientName, myName, back };
}

function showNew(req, res, recipient, errors = {}, values = { body: '' }) {
  return res.page('messages/new', {
    title: 'New message',
    tab: 'messages',
    styles,
    back: recipient.back,
    recipientName: recipient.recipientName,
    postId: recipient.postId,
    myName: recipient.myName,
    formAction: req.originalUrl,
    errors,
    values,
  });
}

router.get('/messages/new', async (req, res) => {
  const recipient = await recipientFor(req);
  const id = await queries.findConversation(req.me.userId, recipient.userId, recipient.postId);
  if (id) return res.redirect(303, '/messages/c/' + id);
  return showNew(req, res, recipient);
});

const blockedNotice = (blocked) =>
  blocked.blocked_by_me
    ? 'You blocked this conversation. Unblock to reply.'
    : 'You can no longer reply in this conversation.';

router.post('/messages/new', async (req, res) => {
  const recipient = await recipientFor(req);
  const errors = {};
  const values = { body: typeof req.body?.body === 'string' ? req.body.body : '' };
  const body = text(req.body?.body, { max: 1000, label: 'Your message' }, errors, 'body');
  if (Object.keys(errors).length) return showNew(req, res.status(400), recipient, errors, values);
  const result = await queries.startConversation(
    req.me.userId,
    recipient.userId,
    recipient.postId,
    body,
  );
  if (result.blocked)
    return showNew(
      req,
      res.status(403),
      recipient,
      { form: blockedNotice(result.blocked) },
      values,
    );
  return res.done({ to: '/messages/c/' + result.id });
});

async function conversationFor(req) {
  const id = positiveId(req.params.id);
  const conversation =
    id && (await queries.getConversation(id, req.me.userId, req.me.universityId));
  if (!conversation) throw notFound();
  return { ...conversation, display_name: otherName(conversation) };
}

async function showConversation(req, res, conversation, errors = {}, values = { body: '' }) {
  const messages = await queries.listMessages(conversation.conversation_id, req.me.userId);
  if (req.method === 'GET' && messages.length)
    await queries.markConversationRead(
      conversation.conversation_id,
      req.me.userId,
      messages.at(-1).message_id,
    );
  return res.page('messages/conversation', {
    title: conversation.display_name,
    tab: 'messages',
    back: '/messages',
    styles,
    conversation,
    myName: aliasName(conversation.my_alias_no),
    messages,
    errors,
    values,
  });
}

router.get('/messages/c/:id', async (req, res) =>
  showConversation(req, res, await conversationFor(req)),
);

router.post('/messages/c/:id', async (req, res) => {
  const conversation = await conversationFor(req);
  const errors = {};
  const values = { body: typeof req.body?.body === 'string' ? req.body.body : '' };
  const body = text(req.body?.body, { max: 1000, label: 'Your message' }, errors, 'body');
  if (Object.keys(errors).length)
    return showConversation(req, res.status(400), conversation, errors, values);
  let result;
  try {
    result = await queries.sendMessage(conversation.conversation_id, req.me.userId, body);
  } catch (err) {
    if (err.errno === 1644) throw notFound();
    throw err;
  }
  if (result.blocked) {
    Object.assign(conversation, result.blocked);
    return showConversation(
      req,
      res.status(403),
      conversation,
      { form: blockedNotice(result.blocked) },
      values,
    );
  }
  return res.done({ to: '/messages/c/' + conversation.conversation_id });
});

async function reportTarget(req) {
  const type = oneOf(req.query.type, ['post', 'comment']);
  const id = positiveId(req.query.id);
  if (!type || !id) throw notFound();
  const target =
    type === 'post'
      ? await findVisible(id, req.me)
      : await queries.commentForReport(id, req.me.universityId);
  if (!target) throw notFound();
  if (target.author_id === req.me.userId) throw badRequest(`You cannot report your own ${type}`);
  return {
    type,
    id,
    label:
      type === 'post'
        ? `Post ${ui.postNo(target.post_id)}`
        : `${aliasName(target.alias_no)}'s comment on ${ui.postNo(target.post_id)}`,
    excerpt: target.body,
    href: `/posts/${target.post_id}` + (type === 'comment' ? `#c${id}` : ''),
  };
}

function showReport(res, target, errors = {}, values = { reason: '', details: '' }) {
  return res.page('messages/report', {
    title: 'Report',
    tab: null,
    back: target.href,
    styles,
    target,
    reasons,
    formAction: `/report?type=${target.type}&id=${target.id}`,
    errors,
    values,
  });
}

router.get('/report', async (req, res) => showReport(res, await reportTarget(req)));

router.post('/report', async (req, res) => {
  const target = await reportTarget(req);
  const errors = {};
  const reason = oneOf(
    req.body?.reason,
    reasons.map(([value]) => value),
    errors,
    'reason',
    'Pick a reason',
  );
  const details = typeof req.body?.details === 'string' ? req.body.details.trim() : '';
  if (req.body?.details != null && typeof req.body.details !== 'string')
    errors.details = 'Enter text for the report details';
  else if ([...details].length > 300)
    errors.details = 'Details is too long (at most 300 characters)';
  const values = { reason, details };
  if (Object.keys(errors).length) return showReport(res.status(400), target, errors, values);
  let flash = 'Thanks. A moderator will review it.';
  try {
    await queries.fileReport(req.me.userId, target.type, target.id, reason, details);
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    flash = 'You have already reported this';
  }
  return res.done({ to: target.href, flash });
});

function adminTarget(row) {
  return {
    ...row,
    label:
      row.target_type === 'post'
        ? `Post ${ui.postNo(row.target_id)}`
        : `Comment #${row.target_id} on ${ui.postNo(row.post_id)}`,
    href: `/posts/${row.post_id}` + (row.target_type === 'comment' ? `#c${row.target_id}` : ''),
  };
}

router.get('/admin/reports', requireRole('admin'), async (req, res) => {
  const [reports, hidden] = await Promise.all([queries.listOpenReports(), queries.listHidden()]);
  res.page('messages/reports', {
    title: 'Reports',
    tab: null,
    back: '/me',
    styles,
    reports: reports.map(adminTarget),
    hidden: hidden.map(adminTarget),
  });
});

async function resolveReport(req, res, action) {
  const id = positiveId(req.params.id);
  if (!id) throw notFound();
  const result = await queries[action](id, req.me.userId);
  if (!result) throw notFound();
  res.done({
    to: '/admin/reports',
    flash: `${action === 'hideTarget' ? 'Hidden' : 'Dismissed'}. ${ui.plural(result.resolved, 'report')} resolved.`,
  });
}

router.post('/admin/reports/:id/hide', requireRole('admin'), (req, res) =>
  resolveReport(req, res, 'hideTarget'),
);
router.post('/admin/reports/:id/dismiss', requireRole('admin'), (req, res) =>
  resolveReport(req, res, 'dismissTarget'),
);
router.post('/admin/hidden/:type/:id/restore', requireRole('admin'), async (req, res) => {
  const type = oneOf(req.params.type, ['post', 'comment']);
  const id = positiveId(req.params.id);
  if (!type || !id) throw notFound();
  await queries.restoreHidden(type, id);
  res.done({ to: '/admin/reports', flash: 'Restored.' });
});

module.exports = router;
