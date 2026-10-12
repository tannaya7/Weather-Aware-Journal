import {
  decryptJson,
  encryptJson,
  encryptionKeyFromSecret,
  fromBase64,
  randomBytes,
  sha256Hex,
  toBase64,
} from './crypto.js';
import { mergeJournals, sameJournal } from './syncMerge.js';

// Talking to the optional sync server (worker/). Everything leaves this
// device encrypted with a key derived from the sync code, which the server
// never sees: it only gets a vault id and an access token, both one-way
// hashes of the code.

const SERVER_KEY = 'weatherJournalServerUrl';

// `code` says what kind of failure it was, so callers can decide what to do
// without reading the message: network, rate-limited, server, auth,
// not-found, too-large, wrong-code, remote-deleted, or request.
export class SyncError extends Error {
  constructor(message, status, retryAfter = null, code = 'request') {
    super(message);
    this.name = 'SyncError';
    this.status = status;
    // Seconds the server asked us to wait (429 responses).
    this.retryAfter = retryAfter;
    this.code = code;
  }
}

function codeForStatus(status) {
  if (status === 413) return 'too-large';
  if (status === 429) return 'rate-limited';
  if (status === 404) return 'not-found';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'request';
}

// Set at build time (VITE_SERVER_URL) or overridden in Settings.
export function getServerUrl() {
  let override = null;
  try {
    override = localStorage.getItem(SERVER_KEY);
  } catch {
    // storage blocked: use the build default
  }
  return (override || import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
}

export function setServerUrl(url) {
  try {
    if (url) localStorage.setItem(SERVER_KEY, url.trim());
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    // ignore
  }
}

// --- Sync codes ------------------------------------------------------------

export function newSyncCode() {
  return toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function normalizeSyncCode(code) {
  return (code || '').replace(/\s+/g, '').trim();
}

// For display: groups of 4 are easier to read out or retype.
export function formatSyncCode(code) {
  return code.match(/.{1,4}/g).join(' ');
}

export function isValidSyncCode(code) {
  return /^[A-Za-z0-9_-]{43}$/.test(normalizeSyncCode(code));
}

function codeBytes(code) {
  const b64 = normalizeSyncCode(code).replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

export async function deriveSyncIdentity(code) {
  const normalized = normalizeSyncCode(code);
  return {
    vaultId: await sha256Hex(`weather-journal:vault:${normalized}`),
    token: await sha256Hex(`weather-journal:token:${normalized}`),
    key: await encryptionKeyFromSecret(codeBytes(normalized), 'weather-journal sync'),
  };
}

// --- Requests --------------------------------------------------------------

async function call(identity, method, path, body, fetchImpl = fetch) {
  const server = getServerUrl();
  if (!server) throw new SyncError('No sync server is set up.');
  let response;
  try {
    response = await fetchImpl(`${server}/v1/vaults/${identity.vaultId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${identity.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError("Couldn't reach the sync server. Check your connection.", undefined, null, 'network');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const wait = Number(response.headers?.get?.('retry-after'));
    throw new SyncError(
      data.error || `Server error (${response.status})`,
      response.status,
      Number.isFinite(wait) && wait > 0 ? wait : null,
      codeForStatus(response.status),
    );
  }
  return data;
}

// Has the journal on the server changed? One small request that never
// downloads the journal, so devices can ask every few seconds.
export async function checkVersion(code, fetchImpl = fetch) {
  const identity = await deriveSyncIdentity(code);
  const { version } = await call(identity, 'GET', '/version', null, fetchImpl);
  return version;
}

async function encryptSnapshot(identity, snapshot) {
  const { iv, data } = await encryptJson(identity.key, snapshot);
  return JSON.stringify({ iv: toBase64(iv), data: toBase64(data) });
}

async function decryptSnapshot(identity, text) {
  const sealed = JSON.parse(text);
  try {
    return await decryptJson(identity.key, { iv: fromBase64(sealed.iv), data: fromBase64(sealed.data) });
  } catch {
    throw new SyncError("This sync code doesn't match the journal on the server.", undefined, null, 'wrong-code');
  }
}

// One sync round: download, merge with this device's copy, upload the
// result. If another device uploads in between (409), merge again.
const MAX_WAIT_SECONDS = 10;
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A 429 from the server means "too fast, wait a moment" (it allows about
// one upload a second per journal): wait as long as it asks, then start the
// round again from a fresh download rather than reuse a stale one.
//
// `knownVersion` is the version this device last synced. If the server now
// has nothing (version 0), the copy was deleted elsewhere on purpose, and
// quietly uploading this device's journal again would undo that, so it
// stops and says so (code 'remote-deleted').
export async function syncJournal({
  code,
  local,
  lastSyncedAt = null,
  knownVersion = 0,
  fetchImpl = fetch,
  maxAttempts = 5,
  sleep = realSleep,
}) {
  // When the sync began, not ended: an edit made while it runs is not in
  // the upload, so it must still count as made after this sync.
  const startedAt = Date.now();
  const identity = await deriveSyncIdentity(code);
  let snapshot = local;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remote = await call(identity, 'GET', '/journal', null, fetchImpl).catch((err) => {
      if (err.status === 404) return { version: 0, data: null };
      throw err;
    });
    if (remote.version === 0 && knownVersion > 0) {
      throw new SyncError('The synced copy was deleted from the server.', 404, null, 'remote-deleted');
    }
    const remoteSnapshot = remote.data ? await decryptSnapshot(identity, remote.data) : { entries: [], tombstones: {} };
    const merged = mergeJournals(snapshot, remoteSnapshot, { lastSyncedAt });
    const payload = {
      format: 1,
      entries: merged.entries,
      tombstones: merged.tombstones,
      habits: snapshot.habits ?? remoteSnapshot.habits ?? null,
    };

    // Nothing to add to what the server has: do not upload (and so do not
    // bump its version, which would make every other device sync too).
    if (remote.version > 0 && sameJournal(payload, remoteSnapshot)) {
      return { ...payload, version: remote.version, syncedAt: startedAt };
    }

    try {
      const { version } = await call(
        identity,
        'PUT',
        '/journal',
        { baseVersion: remote.version, data: await encryptSnapshot(identity, payload) },
        fetchImpl,
      );
      return { ...payload, version, syncedAt: startedAt };
    } catch (err) {
      if (err.status === 429 && err.retryAfter) {
        await sleep(Math.min(err.retryAfter, MAX_WAIT_SECONDS) * 1000);
        snapshot = payload;
        continue;
      }
      if (err.status !== 409) throw err;
      snapshot = payload; // someone else synced first: merge on top of theirs
    }
  }
  throw new SyncError('Another device kept syncing at the same time. Try again in a moment.');
}

export async function deleteSyncedJournal(code, fetchImpl = fetch) {
  await call(await deriveSyncIdentity(code), 'DELETE', '', null, fetchImpl);
}

// --- AI reflections and reminders (same identity) ---------------------------

export async function requestReflection(code, { scope, entries }, fetchImpl = fetch) {
  return call(await deriveSyncIdentity(code), 'POST', '/reflect', { scope, entries }, fetchImpl);
}

export async function getPushPublicKey(fetchImpl = fetch) {
  const server = getServerUrl();
  if (!server) throw new SyncError('No sync server is set up.');
  const response = await fetchImpl(`${server}/v1/push/public-key`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new SyncError(data.error || 'Reminders are not available on this server.', response.status);
  return data.key;
}

export async function saveReminder(code, reminder, fetchImpl = fetch) {
  return call(await deriveSyncIdentity(code), 'PUT', '/reminder', reminder, fetchImpl);
}

export async function removeReminder(code, fetchImpl = fetch) {
  return call(await deriveSyncIdentity(code), 'DELETE', '/reminder', null, fetchImpl);
}
