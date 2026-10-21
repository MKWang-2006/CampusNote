// The events module: campus events and tickets, with the booking race.
module.exports = {
  name: 'events',
  router: require('./routes'),
  smoke: ['/events', '/events/1', '/events/2', '/me/tickets'],
};
