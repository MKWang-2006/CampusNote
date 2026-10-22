const express = require('express');
const { randomInt } = require('node:crypto');
const uploads = require('../../core/uploads');
const ref = require('../../core/ref');
const ui = require('../../core/ui');
const { findVisible } = require('../../core/cards');
const { notFound } = require('../../core/errors');
const { int, bool, text, oneOf } = require('../../core/validate');
const queries = require('./queries');
const router = express.Router();
const styles = ['/m/content/content.css'];
const positiveId = (value) => int(value, { min: 1, max: 4294967295 });

async function visiblePost(req) {
  const id = positiveId(req.params.id);
  const card = id && (await findVisible(id, req.me));
  if (!card) throw notFound();
  return card;
}

function showCompose(
  req,
  res,
  errors = {},
  values = {
    show_handle: !req.me.defaultAnonymous,
    all_universities: req.me.defaultVisibility === 'all',
  },
) {
  return res.page('content/compose', {
    title: 'New post',
    tab: 'compose',
    back: '/feed',
    hideTabs: true,
    styles,
    errors,
    values: {
      ...values,
      body: typeof values.body === 'string' ? values.body : '',
      topic: typeof values.topic === 'string' ? values.topic : '',
      show_handle: bool(values.show_handle),
      all_universities: bool(values.all_universities),
    },
  });
}

async function showPost(req, res, card, errors = {}, values = {}, replyId = req.query.reply) {
  const id = card.post_id;
  const [images, state, thread] = await Promise.all([
    queries.listImages(id),
    queries.viewerState(id, req.me.userId),
    queries.listThread(id, req.me.userId),
  ]);
  const replyTo =
    thread.find((c) => c.comment_id === positiveId(replyId) && c.body !== null) || null;
  return res.page('content/post', {
    title: '#' + id,
    tab: null,
    back: '/feed',
    styles,
    card,
    images,
    state,
    thread,
    isMine: card.author_id === req.me.userId,
    replyTo,
    errors,
    values,
  });
}

router.get('/compose', (req, res) => showCompose(req, res));
router.get('/posts/:id', async (req, res) => {
  const card = await visiblePost(req);
  await queries.recordView(req.me.userId, card.post_id);
  return showPost(req, res, card);
});
router.get('/me/comments', async (req, res) => {
  const items = await queries.listMyComments(
    req.me.userId,
    req.me.universityId,
    positiveId(req.query.before) || 4294967295,
  );
  res.page('content/my-comments', {
    title: 'My comments',
    tab: 'me',
    back: '/me',
    styles,
    items,
    nextUrl: items.length === 20 ? '/me/comments?before=' + items.at(-1).comment_id : null,
  });
});
router.post('/compose', uploads.images({ field: 'images', max: 6 }), async (req, res) => {
  const values = req.body || {};
  const errors = {};
  const paths = (req.files || []).map((f) => f.publicPath);
  if (req.uploadError) errors.images = req.uploadError;
  const body = text(values.body, { max: 750, label: 'Your post' }, errors, 'body');
  const topic = oneOf(
    values.topic,
    ref.topics.map((t) => t.code),
    errors,
    'topic',
    'Pick a topic',
  );
  if (Object.keys(errors).length) {
    uploads.remove(paths);
    if (paths.length && !errors.images) errors.images = 'Please add your images again.';
    return showCompose(req, res.status(400), errors, values);
  }
  let id;
  try {
    id = await queries.createPost(req.me.userId, {
      topicId: ref.topic(topic).topic_id,
      body,
      isAnonymous: !bool(values.show_handle),
      visibility: bool(values.all_universities) ? 'all' : 'university',
      avatarCode: ui.avatars[randomInt(ui.avatars.length)],
      imagePaths: paths,
    });
  } catch (err) {
    uploads.remove(paths);
    throw err;
  }
  return res.done({ to: '/posts/' + id, flash: 'Posted' });
});

router.post('/posts/:id/comments', async (req, res) => {
  const card = await visiblePost(req);
  const values = { body: typeof req.body?.body === 'string' ? req.body.body : '' };
  const errors = {};
  const body = text(values.body, { max: 500, label: 'Your comment' }, errors, 'body');
  const rawReply = req.body?.reply_to;
  const replyTo = positiveId(rawReply);
  if (rawReply != null && rawReply !== '' && replyTo === null)
    errors.reply_to = 'You can only reply to a visible comment';
  if (Object.keys(errors).length)
    return showPost(req, res.status(400), card, errors, values, rawReply);
  const result = await queries.addComment(card.post_id, req.me.userId, body, replyTo);
  if (!result.ok) {
    if (result.reason === 'not_found') throw notFound();
    errors.reply_to = 'You can only reply to a visible comment';
    return showPost(req, res.status(400), card, errors, values, rawReply);
  }
  res.done({ to: '/posts/' + card.post_id + '#c' + result.commentId });
});
router.post('/posts/:id/delete', async (req, res) => {
  const card = await visiblePost(req);
  if (!(await queries.deletePost(card.post_id, req.me.userId))) throw notFound();
  res.done({ to: '/feed', flash: 'Post deleted' });
});
router.post('/comments/:id/delete', async (req, res) => {
  const id = positiveId(req.params.id);
  const postId = id && (await queries.deleteComment(id, req.me.userId));
  if (!postId) throw notFound();
  res.done({ to: '/posts/' + postId + '#c' + id, flash: 'Comment deleted' });
});
router.post('/posts/:id/like', async (req, res) => {
  const card = await visiblePost(req);
  const on = bool(req.body?.like);
  await queries.setLike(req.me.userId, card.post_id, on);
  const counts = await queries.postCounts(card.post_id);
  if (!counts) throw notFound();
  res.done({ to: '/posts/' + card.post_id, json: { liked: on, likeCount: counts.like_count } });
});
router.post('/posts/:id/watch', async (req, res) => {
  const card = await visiblePost(req);
  const on = bool(req.body?.watch);
  await queries.setWatch(req.me.userId, card.post_id, on);
  const counts = await queries.postCounts(card.post_id);
  if (!counts) throw notFound();
  res.done({ to: '/posts/' + card.post_id, json: { watched: on, watchCount: counts.watch_count } });
});
router.post('/me/history/clear', async (req, res) => {
  await queries.clearHistory(req.me.userId);
  res.done({ to: '/me/history', flash: 'History cleared' });
});
module.exports = router;
