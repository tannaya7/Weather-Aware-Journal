import { error, json, readJson, safeEqual, sha256Hex } from './http.js';
import { LIMITS, clientIp, consume, isLimited, tooMany } from './ratelimit.js';

// A "vault" is one journal shared by a person's devices. There are no
// accounts: each device that has the sync code derives the same vault id
// and access token from it (see the app's lib/syncClient.js). The server
// stores a hash of the token, the encrypted journal, and nothing readable.

export const MAX_JOURNAL_BYTES = 20 * 1024 * 1024; // under KV's 25 MiB value limit
// Workers KV allows about one write a second to the same key.
export const MIN_WRITE_GAP_MS = 1000;
const VAULT_ID = /^[0-9a-f]{64}$/;
// What the app uploads: JSON text of { iv, data }, both base64. Anything
// else is not a journal from this app, so it is not stored.
const SEALED = /^\{"iv":"[A-Za-z0-9+/=]{16,32}","data":"[A-Za-z0-9+/=]/;

const keys = {
  auth: (id) => `vault:${id}:auth`,
  journal: (id) => `vault:${id}:journal`,
  // Version and time only, so devices can check for changes without
  // reading the whole journal.
  meta: (id) => `vault:${id}:meta`,
  reminder: (id) => `reminder:${id}`,
};
export { keys as vaultKeys };

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function isKvRateLimit(err) {
  return /\b429\b|too many requests/i.test(String(err?.message || ''));
}

// Checks the request's token against the vault. The first request with a
// token claims a new vault (`claim`), so creating sync is just a first PUT.
// Wrong or missing tokens are counted per IP address, and an address that
// keeps failing is turned away (429) for a while. Creating journals is
// limited per address too, so the server can't be filled with empty ones.
export async function authorize(request, env, vaultId, { claim = false, now = Date.now() } = {}) {
  if (!VAULT_ID.test(vaultId)) return { response: error(400, 'Bad vault id') };

  const ip = clientIp(request);
  const failKey = `fail:${ip}`;
  const fail = async (response) => {
    await consume(env, failKey, LIMITS.failedAuth, now);
    return { response };
  };
  if (await isLimited(env, failKey, LIMITS.failedAuth, now)) {
    return { response: tooMany('Too many failed attempts. Try again later.', LIMITS.failedAuth.windowSeconds, now) };
  }

  const token = bearer(request);
  if (token.length < 32) return fail(error(401, 'Missing token'));

  const tokenHash = await sha256Hex(token);
  const stored = await env.JOURNAL.get(keys.auth(vaultId));
  if (!stored) {
    if (!claim) return { response: error(404, 'No such journal') };
    if (!(await consume(env, `claim:${ip}`, LIMITS.newJournal, now))) {
      return { response: tooMany('Too many new journals from this address. Try again later.', LIMITS.newJournal.windowSeconds, now) };
    }
    await env.JOURNAL.put(keys.auth(vaultId), tokenHash);
    return { ok: true, created: true };
  }
  if (!safeEqual(stored, tokenHash)) return fail(error(403, 'Wrong token'));
  return { ok: true };
}

export async function getJournal(request, env, vaultId, deps = {}) {
  const auth = await authorize(request, env, vaultId, { now: deps.now?.() });
  if (auth.response) return auth.response;
  const stored = await env.JOURNAL.get(keys.journal(vaultId), 'json');
  return json(stored ? { version: stored.version, data: stored.data, updatedAt: stored.updatedAt } : { version: 0, data: null });
}

// GET /v1/vaults/:id/version: just { version, updatedAt }, so a device can
// ask "has anything changed?" often without downloading the journal.
export async function getVersion(request, env, vaultId, deps = {}) {
  const auth = await authorize(request, env, vaultId, { now: deps.now?.() });
  if (auth.response) return auth.response;
  const meta = await env.JOURNAL.get(keys.meta(vaultId), 'json');
  if (meta) return json({ version: meta.version, updatedAt: meta.updatedAt });
  // Journals written before this endpoint existed have no meta yet.
  const stored = await env.JOURNAL.get(keys.journal(vaultId), 'json');
  return json({ version: stored?.version ?? 0, updatedAt: stored?.updatedAt ?? null });
}

// Optimistic concurrency: the client says which version it built on, and a
// mismatch means another device synced first (409, merge and retry).
export async function putJournal(request, env, vaultId, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const auth = await authorize(request, env, vaultId, { claim: true, now });
  if (auth.response) return auth.response;

  let body;
  try {
    body = await readJson(request, MAX_JOURNAL_BYTES);
  } catch (err) {
    return error(err.status || 400, err.status === 413 ? 'Journal is too large to sync (20 MB max)' : err.message);
  }
  if (typeof body.data !== 'string' || !Number.isInteger(body.baseVersion) || body.baseVersion < 0) {
    return error(400, 'Expected { baseVersion, data }');
  }
  if (!SEALED.test(body.data.slice(0, 120))) return error(400, 'Not an encrypted journal');

  const current = (await env.JOURNAL.get(keys.journal(vaultId), 'json')) || { version: 0 };
  if (current.version !== body.baseVersion) {
    return json({ error: 'Out of date', version: current.version }, 409);
  }
  if (current.updatedAtMs && now - current.updatedAtMs < MIN_WRITE_GAP_MS) {
    const response = error(429, 'Syncing too fast. Try again in a moment.');
    response.headers.set('retry-after', '1');
    return response;
  }

  const next = {
    version: current.version + 1,
    data: body.data,
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
  };
  try {
    await env.JOURNAL.put(keys.journal(vaultId), JSON.stringify(next));
  } catch (err) {
    if (!isKvRateLimit(err)) throw err;
    const response = error(429, 'Syncing too fast. Try again in a moment.');
    response.headers.set('retry-after', '2');
    return response;
  }
  // The journal is the truth. If this small write fails, other devices
  // just notice the change a little later (on their next own sync).
  await env.JOURNAL.put(keys.meta(vaultId), JSON.stringify({ version: next.version, updatedAt: next.updatedAt })).catch(
    (err) => console.error('meta write failed', err),
  );
  return json({ version: next.version, updatedAt: next.updatedAt });
}

export async function deleteVault(request, env, vaultId, deps = {}) {
  const auth = await authorize(request, env, vaultId, { now: deps.now?.() });
  if (auth.response) return auth.response;
  await Promise.all([
    env.JOURNAL.delete(keys.journal(vaultId)),
    env.JOURNAL.delete(keys.meta(vaultId)),
    env.JOURNAL.delete(keys.reminder(vaultId)),
    env.JOURNAL.delete(keys.auth(vaultId)),
  ]);
  return json({ deleted: true });
}
