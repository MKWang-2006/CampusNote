module.exports = {
  name: 'content',
  router: require('./routes'),
  smoke: ['/compose', '/posts/600012', '/posts/600006', '/me/comments'],
};
