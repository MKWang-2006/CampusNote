const express = require('express');
const { findVisible } = require('../../core/cards');
const { notFound } = require('../../core/errors');
const { int, bool } = require('../../core/validate');
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
router.get('/posts/:id', async (req, res) => showPost(req, res, await visiblePost(req)));
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
module.exports = router;
