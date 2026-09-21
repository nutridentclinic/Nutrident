/**
 * Replaces express-mongo-sanitize + xss-clean, neither of which works under Express 5.
 *
 * Why: Express 5 made req.query a read-only getter that RE-COMPUTES from the URL on
 * every access (it's not a cached, mutable object anymore). Both of those packages
 * were written for Express 4, where req.query was a plain writable property - they
 * try to do `req.query = sanitizedResult`, which now throws immediately:
 *   TypeError: Cannot set property query of #<IncomingMessage> which has only a getter
 * This crashes on literally every request, not just ones with a query string.
 *
 * What this does instead:
 * 1. Strips MongoDB operator-injection keys (anything starting with "$" or containing
 *    a ".") from req.body, req.params, and req.query - same protection
 *    express-mongo-sanitize provided, against e.g. {"email": {"$gt": ""}} bypassing
 *    an auth check.
 * 2. For req.body and req.params, which remain plain writable objects in Express 5,
 *    a normal reassignment works fine.
 * 3. For req.query specifically, Object.defineProperty() overrides the read-only
 *    getter with a real, writable data property for the rest of this one request -
 *    the only way to actually replace it under Express 5 (confirmed against Express's
 *    own source: a plain reassignment or in-place mutation of the returned object
 *    both fail to persist, since the getter recomputes from the URL each time).
 *
 * xss-clean's job (stripping <script>-like HTML from string values) is intentionally
 * NOT reimplemented here: this is a pure JSON API - nothing on the backend ever
 * renders user-supplied strings as raw HTML, and both frontends (React / React
 * Native) escape string content by default when rendering. The actual risk
 * xss-clean guarded against doesn't apply to this architecture the way it would for
 * a server-rendered HTML app. If a future feature ever renders user content as raw
 * HTML/PDF, sanitize at that specific point instead of blanket-stripping every
 * request body (which xss-clean did, and which sometimes mangled legitimate input
 * like a treatment note containing a "<" character).
 */

const sanitizeValue = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const clean = {};
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) continue; // drop the dangerous key entirely
      clean[key] = sanitizeValue(value[key]);
    }
    return clean;
  }
  return value;
};

module.exports = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.params) req.params = sanitizeValue(req.params);

  if (req.query) {
    const sanitizedQuery = sanitizeValue(req.query);
    Object.defineProperty(req, 'query', {
      value: sanitizedQuery,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  next();
};