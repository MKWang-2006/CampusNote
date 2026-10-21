// HTTP errors a route can throw (ARCHITECTURE.md §6.4). Express 5 passes them to the error handler.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true; // the message is meant for the user
  }
}

const NOT_FOUND = 'This page does not exist or you cannot see it';

const notFound = (message = NOT_FOUND) => new HttpError(404, message);
const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, message);
const badRequest = (message = 'Something in the request is not right') =>
  new HttpError(400, message);
const unauthorized = (message = 'Please log in first') => new HttpError(401, message);

module.exports = { HttpError, notFound, forbidden, badRequest, unauthorized, NOT_FOUND };
