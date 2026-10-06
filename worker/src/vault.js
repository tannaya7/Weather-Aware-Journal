import { error, json, readJson, safeEqual, sha256Hex } from './http.js';

// A "vault" is one journal shared by a person's devices. There are no
// accounts: each device that has the sync code derives the same vault id
// and access token from it (see the app's lib/syncClient.js). The server
// stores a hash of the token, the encrypted journal, and nothing readable.

export const MAX_JOURNAL_BYTES = 20 * 1024 * 1024; // under KV's 25 MiB value limit
const VAULT_ID = /^[0-9a-f]{64}$/;

const keys = {
  auth: (id) => `vault:${id}:auth`,
  journal: (id) => `vault:${id}:journal`,
  reminder: (id) => `reminder:${id}`,
};
export { keys as vaultKeys };

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// Checks the request's token against the vault. The first request with a
// token claims a new vault (`claim`), so creating sync is just a first PUT.
export async function authorize(request, env, vaultId, { claim = false } = {}) {
  if (!VAULT_ID.test(vaultId)) return { response: error(400, 'Bad vault id') };
  const token = bearer(request);
  if (token.length < 32) return { response: error(401, 'Missing token') };

  const tokenHash = await sha256Hex(token);
  const stored = await env.JOURNAL.get(keys.auth(vaultId));
  if (!stored) {
    if (!claim) return { response: error(404, 'No such journal') };
    await env.JOURNAL.put(keys.auth(vaultId), tokenHash);
    return { ok: true, created: true };
  }
  if (!safeEqual(stored, tokenHash)) return { response: error(403, 'Wrong token') };
  return { ok: true };
}

export async function getJournal(request, env, vaultId) {
  const auth = await authorize(request, env, vaultId);
  if (auth.response) return auth.response;
  const stored = await env.JOURNAL.get(keys.journal(vaultId), 'json');
  return json(stored || { version: 0, data: null });
}

// Optimistic concurrency: the client says which version it built on, and a
// mismatch means another device synced first (409, merge and retry).
export async function putJournal(request, env, vaultId) {
  const auth = await authorize(request, env, vaultId, { claim: true });
  if (auth.response) return auth.response;

  let body;
  try {
    body = await readJson(request, MAX_JOURNAL_BYTES);
  } catch (err) {
    return error(err.status || 400, err.status === 413 ? 'Journal is too large to sync (20 MB max)' : err.message);
  }
  if (typeof body.data !== 'string' || !Number.isInteger(body.baseVersion)) {
    return error(400, 'Expected { baseVersion, data }');
  }

  const current = (await env.JOURNAL.get(keys.journal(vaultId), 'json')) || { version: 0 };
  if (current.version !== body.baseVersion) {
    return json({ error: 'Out of date', version: current.version }, 409);
  }
  const next = { version: current.version + 1, data: body.data, updatedAt: new Date().toISOString() };
  await env.JOURNAL.put(keys.journal(vaultId), JSON.stringify(next));
  return json({ version: next.version });
}

export async function deleteVault(request, env, vaultId) {
  const auth = await authorize(request, env, vaultId);
  if (auth.response) return auth.response;
  await Promise.all([
    env.JOURNAL.delete(keys.journal(vaultId)),
    env.JOURNAL.delete(keys.reminder(vaultId)),
    env.JOURNAL.delete(keys.auth(vaultId)),
  ]);
  return json({ deleted: true });
}
