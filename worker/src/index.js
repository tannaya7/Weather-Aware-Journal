import { corsHeaders, error, json, withCors } from './http.js';
import { deleteVault, getJournal, putJournal } from './vault.js';
import { reflect } from './reflect.js';
import { deleteReminder, publicKey, putReminder, sendDueReminders } from './push.js';

// Weather Journal's optional server (Cloudflare Worker + KV):
//   GET    /v1/health
//   GET    /v1/vaults/:id/journal      encrypted journal + version
//   PUT    /v1/vaults/:id/journal      { baseVersion, data } -> new version, or 409
//   DELETE /v1/vaults/:id              remove everything for this journal
//   POST   /v1/vaults/:id/reflect      AI reflection on entries the app sends
//   GET    /v1/push/public-key         VAPID public key
//   PUT    /v1/vaults/:id/reminder     daily reminder time + push subscription
//   DELETE /v1/vaults/:id/reminder
// Every /vaults route needs "Authorization: Bearer <token>" (see vault.js).

const ROUTES = [
  ['GET', /^\/v1\/health$/, () => json({ ok: true })],
  ['GET', /^\/v1\/push\/public-key$/, (req, env) => publicKey(env)],
  ['GET', /^\/v1\/vaults\/([^/]+)\/journal$/, getJournal],
  ['PUT', /^\/v1\/vaults\/([^/]+)\/journal$/, putJournal],
  ['DELETE', /^\/v1\/vaults\/([^/]+)$/, deleteVault],
  ['POST', /^\/v1\/vaults\/([^/]+)\/reflect$/, reflect],
  ['PUT', /^\/v1\/vaults\/([^/]+)\/reminder$/, putReminder],
  ['DELETE', /^\/v1\/vaults\/([^/]+)\/reminder$/, deleteReminder],
];

export async function handle(request, env, deps = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  const { pathname } = new URL(request.url);
  for (const [method, pattern, handler] of ROUTES) {
    const match = pattern.exec(pathname);
    if (match && request.method === method) {
      try {
        return withCors(await handler(request, env, match[1], deps), request, env);
      } catch (err) {
        console.error(err);
        return withCors(error(500, 'Server error'), request, env);
      }
    }
  }
  return withCors(error(404, 'Not found'), request, env);
}

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (event, env, ctx) => ctx.waitUntil(sendDueReminders(env)),
};
