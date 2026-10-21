// Placeholder routes for the content module. Replace each one with the real page from
// docs/modules/content/DEV_GUIDE.md; keep the paths (docs/team/WORK_DIVISION.md §3).
const express = require('express');

const router = express.Router();

const placeholder = (page) => (req, res) =>
  res.page('content/placeholder', { module: 'content', ...page });

router.get(
  '/compose',
  placeholder({
    feature: 'CT-1',
    title: 'New post',
    tab: 'compose',
    back: '/feed',
    hideTabs: true,
    what: 'Write a post: text, up to 6 images, a topic, and the "Show my handle" and "Visible to all universities" switches.',
  }),
);

router.get(
  '/me/comments',
  placeholder({
    feature: 'CT-7',
    title: 'My comments',
    tab: 'me',
    back: '/me',
    what: 'Every comment you wrote, newest first, linking to its post.',
  }),
);

module.exports = router;
