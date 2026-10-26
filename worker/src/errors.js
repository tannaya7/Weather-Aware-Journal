import { error, readJson } from './http.js';
import { clientIp, consume, tooMany } from './ratelimit.js';

// POST /v1/errors: an error report from the app (src/lib/errorReport.js),
// sent only if the person turned that on. Reports are already scrubbed of
// journal text by the app; here they are checked, trimmed, and written to
// the Worker's logs (`wrangler tail`, or the dashboard). Nothing is stored.

const LIMIT = { limit: 20, windowSeconds: 3600 }; // per IP
const FIELDS = { kind: 40, name: 80, message: 300, stack: 3000, route: 200, version: 40, at: 40 };

export async function receiveError(request, env, _id, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  if (!(await consume(env, `errors:${clientIp(request)}`, LIMIT, now))) {
    return tooMany('Too many reports from this address.', LIMIT.windowSeconds, now);
  }
  let body;
  try {
    body = await readJson(request, 8 * 1024);
  } catch (err) {
    return error(err.status || 400, err.message);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.message !== 'string') {
    return error(400, 'Expected an error report');
  }
  const report = {};
  for (const [field, max] of Object.entries(FIELDS)) {
    if (typeof body[field] === 'string') report[field] = body[field].slice(0, max);
  }
  (deps.log || console.log)(JSON.stringify({ type: 'client-error', ...report }));
  return new Response(null, { status: 204 });
}
