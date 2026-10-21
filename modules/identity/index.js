// The identity module: sign-up, login and logout, password reset, the Me hub, profile, settings,
// the public pages (About, Contact, Terms, Privacy) and the admin user list.
// Specification: docs/modules/identity/DEV_GUIDE.md (this manifest is its §2).
module.exports = {
  name: 'identity',
  router: require('./routes'),
  publicRoutes: [
    '/auth/register',
    '/auth/verify',
    '/auth/resend',
    '/auth/login',
    '/auth/logout',
    '/auth/forgot',
    '/auth/reset',
    '/about',
    '/contact',
    '/terms',
    '/privacy',
  ],
  smoke: ['/me', '/me/profile', '/me/settings', '/about', '/contact', '/terms', '/privacy'],
};
