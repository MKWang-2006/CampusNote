const { countUnread } = require('./queries');

module.exports = {
  name: 'messages',
  router: require('./routes'),
  locals: async (req) => {
    const unread = await countUnread(req.me.userId);
    return { badges: { messages: unread.notifications + unread.messages } };
  },
  smoke: ['/messages', '/messages/notifications'],
};
