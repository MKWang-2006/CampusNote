// Placeholder routes for the discover module. Replace each one with the real page from
// docs/modules/discover/DEV_GUIDE.md; keep the paths (docs/team/WORK_DIVISION.md §3).
const express = require('express');
const { requireRole } = require('../../core/auth');
const { int } = require('../../core/validate');
const { byIds } = require('../../core/cards');
const queries = require('./queries');

const router = express.Router();

const placeholder = (page) => (req, res) =>
  res.page('discover/placeholder', { module: 'discover', ...page });

// A first version of the All tab, so the app shows the seed posts from day one (DS-1 replaces it).
router.get('/feed', async (req, res) => {
  const before = int(req.query.before, { min: 1 });
  const ids = await queries.feedAllIds(req.me.universityId, before);
  const cards = await byIds(ids.slice(0, 20));
  const nextUrl = ids.length > 20 ? `/feed?before=${ids[19]}` : null;
  res.page('discover/feed', { title: 'Campus Notes', tab: 'feed', cards, nextUrl });
});

router.get(
  '/search',
  placeholder({
    feature: 'DS-4',
    title: 'Search',
    tab: 'search',
    what: 'Search posts in Chinese or English, sort by relevance or newest, filter by topic; #600012 opens a post.',
  }),
);

router.get(
  '/me/posts',
  placeholder({
    feature: 'DS-5',
    title: 'My posts',
    tab: 'me',
    back: '/me',
    what: 'Your live posts, newest first.',
  }),
);

router.get(
  '/me/watching',
  placeholder({
    feature: 'DS-5',
    title: 'Watching',
    tab: 'me',
    back: '/me',
    what: 'Posts you watch (the star), latest watch first.',
  }),
);

router.get(
  '/me/likes',
  placeholder({
    feature: 'DS-5',
    title: 'Liked',
    tab: 'me',
    back: '/me',
    what: 'Posts you like (the heart), latest like first.',
  }),
);

router.get(
  '/me/history',
  placeholder({
    feature: 'DS-5',
    title: 'History',
    tab: 'me',
    back: '/me',
    what: 'Posts you opened, latest visit first, with "Clear history".',
  }),
);

router.get(
  '/admin/announcements',
  requireRole('admin'),
  placeholder({
    feature: 'DS-7',
    title: 'Announcements',
    tab: null,
    back: '/me',
    what: 'Create, edit and delete the banners at the top of the feed.',
  }),
);

module.exports = router;
