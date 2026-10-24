// Placeholder routes for the discover module. Replace each one with the real page from
// docs/modules/discover/DEV_GUIDE.md; keep the paths (docs/team/WORK_DIVISION.md §3).
const express = require('express');
const { requireRole } = require('../../core/auth');
const { int, oneOf } = require('../../core/validate');
const { byIds } = require('../../core/cards');
const ref = require('../../core/ref');
const queries = require('./queries');

const router = express.Router();

const placeholder = (page) => (req, res) =>
  res.page('discover/placeholder', { module: 'discover', ...page });

// CP1: read-only All, university and topic feeds. Hot and Watching follow at CP2.
router.get('/feed', async (req, res) => {
  const choices = [
    { code: 'all', label: 'All' },
    { code: 'uni', label: req.me.universityCode },
    ...ref.topics.map((topic) => ({ code: topic.code, label: topic.name_en })),
  ];
  const selected =
    oneOf(
      req.query.tab,
      choices.map((choice) => choice.code),
    ) ?? 'all';
  const before = int(req.query.before, { min: 1, max: 4294967295 });
  const topic = ref.topic(selected);
  const ids = topic
    ? await queries.feedTopicIds(req.me.universityId, topic.topic_id, before)
    : selected === 'uni'
      ? await queries.feedUniIds(req.me.universityId, before)
      : await queries.feedAllIds(req.me.universityId, before);
  // D18: paginate the merged view, then hydrate at most 20 cards, preserving the id order.
  const cards = await byIds(ids.slice(0, 20));
  const nextUrl = ids.length > 20 ? `/feed?tab=${selected}&before=${ids[19]}` : null;
  const emptyText = topic
    ? `No posts in ${topic.name_en} yet.`
    : selected === 'uni'
      ? `No posts from ${req.me.universityCode} yet.`
      : 'No posts yet. Be the first to write one.';
  res.page('discover/feed', {
    title: 'Campus Notes',
    tab: 'feed',
    scripts: ['/m/discover/feed.js'],
    cards,
    nextUrl,
    emptyText,
    canCompose: selected === 'all',
    feedHeading:
      selected === 'all' ? 'All posts' : `${topic?.name_en ?? req.me.universityCode} posts`,
    feedTabs: choices.map((choice) => ({
      label: choice.label,
      href: `/feed?tab=${choice.code}`,
      active: choice.code === selected,
    })),
  });
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

router.get('/me/posts', async (req, res) => {
  const before = int(req.query.before, { min: 1, max: 4294967295 });
  const ids = await queries.myPostIds(req.me.userId, before);
  res.page('discover/my-list', {
    title: 'My posts',
    tab: 'me',
    back: '/me',
    cards: await byIds(ids.slice(0, 20)),
    nextUrl: ids.length > 20 ? `/me/posts?before=${ids[19]}` : null,
    note: 'Anonymous posts show no name to others.',
    emptyText: 'You have not posted yet.',
    emptyHref: '/compose',
    emptyLabel: 'Write a post',
  });
});

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
