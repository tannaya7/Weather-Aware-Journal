import { error } from './http.js';

// Approximate rate limits on Workers KV, to deter abuse (not to meter it
// exactly): KV is eventually consistent, so a burst spread across several
// locations can slip a few requests past a limit. Counters are fixed
// windows that expire on their own.
//
// KV's free tier allows 1,000 writes a day, so a counter is only written
// for things worth limiting: failed sign-ins, new journals, reflections.
// Ordinary syncing is never counted.

const MIN_TTL = 60; // KV's minimum expiration

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

function windowOf(now, windowSeconds) {
  return Math.floor(now / 1000 / windowSeconds);
}

// Whether `key` is already at its limit. Does not count anything.
export async function isLimited(env, key, { limit, windowSeconds }, now = Date.now()) {
  const used = Number((await env.JOURNAL.get(`rl:${key}:${windowOf(now, windowSeconds)}`)) || 0);
  return used >= limit;
}

// Counts one use of `key`, returning false (and not counting) once the
// limit is reached in the current window.
export async function consume(env, key, { limit, windowSeconds }, now = Date.now()) {
  const kvKey = `rl:${key}:${windowOf(now, windowSeconds)}`;
  const used = Number((await env.JOURNAL.get(kvKey)) || 0);
  if (used >= limit) return false;
  await env.JOURNAL.put(kvKey, String(used + 1), { expirationTtl: Math.max(MIN_TTL, windowSeconds * 2) });
  return true;
}

export function retryAfterSeconds(windowSeconds, now = Date.now()) {
  const into = (now / 1000) % windowSeconds;
  return Math.max(1, Math.ceil(windowSeconds - into));
}

export function tooMany(message, windowSeconds, now = Date.now()) {
  const response = error(429, message);
  response.headers.set('retry-after', String(retryAfterSeconds(windowSeconds, now)));
  return response;
}

// The limits, in one place.
export const LIMITS = {
  failedAuth: { limit: 20, windowSeconds: 600 }, // per IP
  newJournal: { limit: 5, windowSeconds: 3600 }, // per IP
  reflectBurst: { limit: 5, windowSeconds: 60 }, // per journal
};
