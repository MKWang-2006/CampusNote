const express = require('express');
const { requireRole } = require('../../core/auth');
const { notFound } = require('../../core/errors');
const { int } = require('../../core/validate');
const ui = require('../../core/ui');
const uploads = require('../../core/uploads');
const queries = require('./queries');
const { formatHkt, validateEvent } = require('./forms');

const router = express.Router();
const styles = ['/m/events/events.css'];
const scripts = ['/m/events/events.js'];
const page = (res, view, locals) =>
  res.page(`events/${view}`, { tab: null, styles, scripts, ...locals });
const canOrganize = (me) => me.isOrg || me.isAdmin;
const idOf = (req) => {
  const id = int(req.params.id, { min: 1, max: 4294967295 });
  if (!id) throw notFound();
  return id;
};

async function visible(req) {
  const event = await queries.getEvent(idOf(req), req.me.userId, req.me.universityId);
  if (!event) throw notFound();
  return event;
}

async function owned(req, res, next) {
  const event = await visible(req);
  if (event.organizer_id !== req.me.userId) throw notFound();
  req.event = event;
  next();
}

async function attendeeAccess(req) {
  const event = await queries.attendeeEvent(idOf(req), req.me.userId, req.me.isAdmin);
  if (!event) throw notFound();
  return event;
}

router.get('/events', async (req, res) => {
  const mine = req.query.mine === '1';
  if (mine && !canOrganize(req.me)) throw notFound();
  const events = mine
    ? await queries.listMyEvents(req.me.userId)
    : await queries.listEvents(req.me.userId, req.me.universityId);
  page(res, 'list', {
    title: mine ? 'My events' : 'Events',
    back: mine ? '/me' : '/search',
    events,
    mine,
    canOrganize: canOrganize(req.me),
  });
});

router.get('/me/tickets', async (req, res) => {
  page(res, 'tickets', {
    title: 'My tickets',
    tab: 'me',
    back: '/me',
    tickets: await queries.myTickets(req.me.userId),
  });
});

const formPage = (res, values, errors = {}, event = null) =>
  page(res, 'form', {
    title: event ? 'Edit event' : 'New event',
    back: event ? `/events/${event.event_id}` : '/events?mine=1',
    values,
    errors,
    event,
    action: event ? `/events/${event.event_id}/edit` : '/events/new',
  });

router.get('/events/new', requireRole('organization', 'admin'), (req, res) => {
  formPage(res, { audience: 'all' });
});

async function saveEvent(req, res) {
  const event = req.event || null;
  const values = req.body || {};
  const { fields, errors } = validateEvent(values, req.uploadError);
  const uploaded = (req.files || []).map((file) => file.publicPath);
  fields.cover_path = uploaded[0] || (event && event.cover_path) || null;
  if (event && event.cancelled_at) errors.form = 'This event was cancelled';
  if (event && fields.capacity !== null && fields.capacity < event.sold)
    errors.capacity = `${event.sold} tickets are already booked`;
  if (Object.keys(errors).length) {
    uploads.remove(uploaded);
    return formPage(res.status(400), values, errors, event);
  }
  try {
    let id;
    if (event) {
      const changed = await queries.updateEvent(event.event_id, req.me.userId, fields);
      if (!changed) {
        const current = await visible(req);
        errors[current.cancelled_at ? 'form' : 'capacity'] = current.cancelled_at
          ? 'This event was cancelled'
          : `${current.sold} tickets are already booked`;
        uploads.remove(uploaded);
        return formPage(res.status(400), values, errors, current);
      }
      id = event.event_id;
      if (uploaded.length && event.cover_path) uploads.remove(event.cover_path);
    } else id = await queries.createEvent(req.me.userId, fields);
    return res.done({
      to: `/events/${id}`,
      json: { ok: true, eventId: id },
      flash: event ? 'Event updated' : 'Event created',
    });
  } catch (err) {
    uploads.remove(uploaded);
    throw err;
  }
}

router.post(
  '/events/new',
  requireRole('organization', 'admin'),
  uploads.images({ field: 'cover', max: 1 }),
  saveEvent,
);
router.get('/events/:id/edit', owned, (req, res) => {
  const values = { ...req.event };
  for (const key of ['starts_at', 'ends_at', 'release_at']) values[key] = formatHkt(values[key]);
  formPage(res, values, {}, req.event);
});
router.post('/events/:id/edit', owned, uploads.images({ field: 'cover', max: 1 }), saveEvent);

router.get('/events/:id/attendees', async (req, res) => {
  const event = await attendeeAccess(req);
  const attendees = await queries.attendees(event.event_id, req.me.userId, req.me.isAdmin);
  page(res, 'attendees', {
    title: 'Attendees',
    back: `/events/${event.event_id}`,
    event,
    attendees,
  });
});

router.post('/events/:id/check-in', async (req, res) => {
  const event = await attendeeAccess(req);
  const code =
    req.body && typeof req.body.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const ticket = /^[A-Z2-9]{8}$/.test(code)
    ? await queries.checkIn(event.event_id, code, req.me.userId, req.me.isAdmin)
    : null;
  const flash = !ticket
    ? 'No ticket with that code'
    : ticket.already
      ? `Already checked in at ${ui.hkt(ticket.checkedInAt).slice(-5)}`
      : `Checked in: ${ticket.handle}`;
  res.done({
    to: `/events/${event.event_id}/attendees`,
    json: { ok: Boolean(ticket), already: Boolean(ticket && ticket.already), message: flash },
    flash,
  });
});

router.post('/events/:id/cancel', owned, async (req, res) => {
  await queries.cancelEvent(req.event.event_id, req.me.userId);
  res.done({ to: `/events/${req.event.event_id}`, json: { ok: true }, flash: 'Event cancelled' });
});

router.post('/events/:id/book', async (req, res) => {
  let event = await visible(req);
  let result = event.my_ticket_code
    ? { ok: false, reason: 'already_booked' }
    : await queries.bookTicket(event.event_id, req.me.userId, req.me.universityId);
  if (!result.ok) {
    event = await visible(req);
    const reason =
      result.reason ||
      (event.my_ticket_code
        ? 'already_booked'
        : event.status === 'cancelled'
          ? 'cancelled'
          : event.status === 'upcoming'
            ? 'not_open'
            : !event.before_start
              ? 'closed'
              : 'sold_out');
    result = { ok: false, reason, ticketsLeft: event.tickets_left, code: null };
  } else result.reason = null;
  const messages = {
    already_booked: 'You already have a ticket',
    sold_out: 'Sold out',
    not_open: `Tickets go on sale at ${ui.hkt(event.release_at)}`,
    closed: 'Booking has closed',
    cancelled: 'This event was cancelled',
  };
  res.done({
    to: `/events/${event.event_id}`,
    json: result,
    flash: result.ok ? `Booked. Your ticket code is ${result.code}.` : messages[result.reason],
  });
});

router.post('/events/:id/cancel-booking', async (req, res) => {
  const event = await visible(req);
  const result = await queries.cancelBooking(event.event_id, req.me.userId);
  const messages = {
    cancelled: 'This event was cancelled',
    closed: 'Booking has closed',
    no_ticket: 'No unchecked ticket to cancel',
  };
  res.done({
    to: `/events/${event.event_id}`,
    json: result,
    flash: result.ok ? 'Booking cancelled' : messages[result.reason],
  });
});

router.get('/events/:id', async (req, res) => {
  const event = await visible(req);
  page(res, 'detail', {
    title: event.title,
    back: '/events',
    event,
    isOwner: event.organizer_id === req.me.userId,
  });
});

module.exports = router;
