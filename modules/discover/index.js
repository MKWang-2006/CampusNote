// The discover module: feeds, hot ranking, search, the four "my" lists, user pages and announcements.
// Skeleton from the backbone: placeholder pages keep every tab and Me menu link working until
// the owner builds the real ones from docs/modules/discover/DEV_GUIDE.md (manifest in its §2).
module.exports = {
  name: 'discover',
  router: require('./routes'),
  smoke: ['/feed', '/search', '/me/posts', '/me/watching', '/me/likes', '/me/history'],
};
