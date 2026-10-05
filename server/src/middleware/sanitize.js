/**
 * MongoDB Query Sanitization Middleware (PRD section 44).
 *
 * Recursively strips keys containing prohibited characters ($ or .) from
 * req.body, req.query, and req.params to prevent NoSQL operator injection.
 */
function clean(target) {
  if (!target || typeof target !== 'object') return target;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      target[i] = clean(target[i]);
    }
    return target;
  }

  for (const key of Object.keys(target)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete target[key];
    } else {
      target[key] = clean(target[key]);
    }
  }
  return target;
}

function mongoSanitize(req, res, next) {
  if (req.body) clean(req.body);
  if (req.query) clean(req.query);
  if (req.params) clean(req.params);
  next();
}

module.exports = { mongoSanitize, clean };
