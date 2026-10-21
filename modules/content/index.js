// The content module: posts, comments, likes, watches and history: the compose page (+) and the post page.
// Skeleton from the backbone: placeholder pages keep every tab and Me menu link working until
// the owner builds the real ones from docs/modules/content/DEV_GUIDE.md (manifest in its §2).
module.exports = {
  name: 'content',
  router: require('./routes'),
  smoke: ['/compose', '/me/comments'],
};
