import { authorize, vaultKeys } from './vault.js';
import { error, json, readJson } from './http.js';

// Daily reminders with Web Push. Pushes carry no payload: the app's service
// worker shows a fixed "time to write" notification, so the server never
// handles journal text here and needs no payload encryption.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const WINDOW_MINUTES = 15; // the cron runs every 15 minutes

function base64url(bytes) {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// VAPID (RFC 8292): an ES256-signed JWT proving the push comes from this
// server. WebCrypto's ECDSA signature is already the raw r||s JWS wants.
export async function vapidAuthorization(endpoint, env, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = base64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export async function sendPush(subscription, env, fetchImpl = fetch) {
  return fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(subscription.endpoint, env),
      ttl: String(12 * 3600),
      urgency: 'normal',
      'content-length': '0',
    },
  });
}

export function publicKey(env) {
  if (!env.VAPID_PUBLIC_KEY) return error(503, 'Reminders are not set up on this server');
  return json({ key: env.VAPID_PUBLIC_KEY });
}

// PUT /v1/vaults/:id/reminder  { subscription, time: "20:30", timeZone }
export async function putReminder(request, env, vaultId) {
  const auth = await authorize(request, env, vaultId);
  if (auth.response) return auth.response;
  let body;
  try {
    body = await readJson(request, 8 * 1024);
  } catch (err) {
    return error(err.status || 400, err.message);
  }
  const { subscription, time, timeZone } = body;
  if (!subscription?.endpoint?.startsWith('https://') || !TIME.test(time || '')) {
    return error(400, 'Expected { subscription, time: "HH:MM", timeZone }');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return error(400, 'Unknown time zone');
  }
  await env.JOURNAL.put(
    vaultKeys.reminder(vaultId),
    JSON.stringify({ subscription: { endpoint: subscription.endpoint }, time, timeZone, lastSent: null }),
  );
  return json({ saved: true });
}

export async function deleteReminder(request, env, vaultId) {
  const auth = await authorize(request, env, vaultId);
  if (auth.response) return auth.response;
  await env.JOURNAL.delete(vaultKeys.reminder(vaultId));
  return json({ deleted: true });
}

function localClock(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Whether a reminder is due now: its time falls in this cron window, in the
// person's own time zone, and it hasn't gone out today.
export function isDue(reminder, now = new Date()) {
  const { day, minutes } = localClock(now, reminder.timeZone);
  const [h, m] = reminder.time.split(':').map(Number);
  const target = h * 60 + m;
  return reminder.lastSent !== day && minutes >= target && minutes < target + WINDOW_MINUTES;
}

// Cron: send every reminder that's due. Expired subscriptions (the person
// uninstalled or blocked notifications) are cleaned up.
export async function sendDueReminders(env, { now = new Date(), fetchImpl = fetch } = {}) {
  let cursor;
  let sent = 0;
  do {
    const page = await env.JOURNAL.list({ prefix: 'reminder:', cursor });
    for (const { name } of page.keys) {
      const reminder = await env.JOURNAL.get(name, 'json');
      if (!reminder || !isDue(reminder, now)) continue;
      const response = await sendPush(reminder.subscription, env, fetchImpl);
      if (response.status === 404 || response.status === 410) {
        await env.JOURNAL.delete(name);
        continue;
      }
      if (response.ok) {
        reminder.lastSent = localClock(now, reminder.timeZone).day;
        await env.JOURNAL.put(name, JSON.stringify(reminder));
        sent += 1;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return sent;
}
