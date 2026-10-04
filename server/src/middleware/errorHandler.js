/**
 * 404 handler for unknown API routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Central error handler. Never leaks stack traces to the client
 * (PRD section 48: never expose raw backend stack traces).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err.stack || err.message || err);

  const status = err.status || 500;
  const message =
    status >= 500 ? 'Something went wrong. Please try again.' : err.message;

  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
