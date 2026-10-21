// The messages module: notifications, private messages, reports and moderation.
// Skeleton from the backbone: placeholder pages keep every tab and Me menu link working until
// the owner builds the real ones from docs/modules/messages/DEV_GUIDE.md (manifest in its §2).
module.exports = {
  name: 'messages',
  router: require('./routes'),
  smoke: ['/messages'],
};
