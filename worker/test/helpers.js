// Shared by the worker tests.

// In-memory stand-in for a Workers KV namespace.
export function memoryKv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix }) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
}

// What the app uploads: JSON text of { iv, data } in base64.
export const SEALED = JSON.stringify({ iv: 'AAAAAAAAAAAAAAAA', data: 'Q0lQSEVSVEVYVA==' });
export const SEALED_2 = JSON.stringify({ iv: 'BBBBBBBBBBBBBBBB', data: 'U0VDT05E' });

export const VAULT = 'a'.repeat(64);
export const TOKEN = 'b'.repeat(64);
export const ORIGIN = 'https://tannaya7.github.io';

export function makeEnv(extra = {}) {
  return { JOURNAL: memoryKv(), ALLOWED_ORIGINS: ORIGIN, ...extra };
}

export function req(method, path, { body, token = TOKEN, origin = ORIGIN, ip } = {}) {
  const headers = { origin };
  if (token) headers.authorization = `Bearer ${token}`;
  if (ip) headers['cf-connecting-ip'] = ip;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://server.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const T0 = Date.UTC(2026, 9, 12, 12, 0, 0);
// A fixed clock `ms` after T0, passed to handle() as its dependencies.
export const at = (ms) => ({ now: () => T0 + ms });
