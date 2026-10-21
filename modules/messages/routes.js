// Placeholder routes for the messages module. Replace each one with the real page from
// docs/modules/messages/DEV_GUIDE.md; keep the paths (docs/team/WORK_DIVISION.md §3).
const express = require('express');
const { requireRole } = require('../../core/auth');

const router = express.Router();

const placeholder = (page) => (req, res) =>
  res.page('messages/placeholder', { module: 'messages', ...page });

router.get(
  '/messages',
  placeholder({
    feature: 'MS-3',
    title: 'Messages',
    tab: 'messages',
    what: 'Notifications and your private conversations.',
  }),
);

router.get(
  '/admin/reports',
  requireRole('admin'),
  placeholder({
    feature: 'MS-7',
    title: 'Reports',
    tab: null,
    back: '/me',
    what: 'Open reports with Hide and Dismiss, and the hidden content with Restore.',
  }),
);

module.exports = router;
