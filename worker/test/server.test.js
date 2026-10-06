// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/index.js';
import { isDue, sendDueReminders, vapidAuthorization } from '../src/push.js';
import { DAILY_LIMIT, MODEL } from '../src/reflect.js';

// In-memory stand-in for a Workers KV namespace.
function memoryKv() {
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

async function vapidEnv() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    pair,
    VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'),
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)),
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
}

const VAULT = 'a'.repeat(64);
const TOKEN = 'b'.repeat(64);
const ORIGIN = 'https://tannaya7.github.io';

function makeEnv(extra = {}) {
  return { JOURNAL: memoryKv(), ALLOWED_ORIGINS: ORIGIN, ...extra };
}

function req(method, path, { body, token = TOKEN, origin = ORIGIN } = {}) {
  const headers = { origin };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://server.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('journal sync', () => {
  it('claims a new journal on first upload, then serves it back', async () => {
    const env = makeEnv();
    const put = await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'CIPHERTEXT' } }), env);
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ version: 1 });

    const get = await handle(req('GET', `/v1/vaults/${VAULT}/journal`), env);
    expect(await get.json()).toMatchObject({ version: 1, data: 'CIPHERTEXT' });
    expect(get.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    expect([...env.JOURNAL.store.values()].join()).not.toContain(TOKEN);
  });

  it('rejects the wrong token, a missing token, and unknown journals', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);

    expect((await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { token: 'c'.repeat(64) }), env)).status).toBe(403);
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { token: null }), env)).status).toBe(401);
    expect((await handle(req('GET', `/v1/vaults/${'d'.repeat(64)}/journal`), env)).status).toBe(404);
    expect((await handle(req('GET', '/v1/vaults/not-hex/journal'), env)).status).toBe(400);
  });

  it('refuses an upload built on an old version (another device synced first)', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'one' } }), env);
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 1, data: 'two' } }), env);

    const stale = await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 1, data: 'three' } }), env);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ version: 2 });
  });

  it('deletes everything for a journal', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    expect((await handle(req('DELETE', `/v1/vaults/${VAULT}`), env)).status).toBe(200);
    expect(env.JOURNAL.store.size).toBe(0);
  });

  it('answers CORS preflight only for allowed sites', async () => {
    const env = makeEnv();
    const ok = await handle(new Request('https://server.example/v1/health', { method: 'OPTIONS', headers: { origin: ORIGIN } }), env);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const other = await handle(
      new Request('https://server.example/v1/health', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
      env,
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('AI reflections', () => {
  function fakeClaude(response) {
    return { beta: { messages: { create: vi.fn(async () => response) } } };
  }

  async function syncedEnv() {
    const env = makeEnv({ ANTHROPIC_API_KEY: 'test' });
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    return env;
  }

  const ENTRIES = [{ date: '2026-10-01', mood: 'Sad', weather: 'Rain', text: 'A slow grey day.', extra: 'ignored' }];

  it('asks Claude with the entries and returns the reflection', async () => {
    const env = await syncedEnv();
    const client = fakeClaude({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'You noticed the rain.' }] });

    const res = await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { scope: 'week', entries: ENTRIES } }), env, { client });

    expect(await res.json()).toEqual({ text: 'You noticed the rain.', remainingToday: DAILY_LIMIT - 1 });
    const params = client.beta.messages.create.mock.calls[0][0];
    expect(params.model).toBe(MODEL);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.messages[0].content).toContain('A slow grey day.');
    expect(params.messages[0].content).not.toContain('ignored');
  });

  it('reports a declined request clearly', async () => {
    const env = await syncedEnv();
    const client = fakeClaude({ stop_reason: 'refusal', content: [] });
    const res = await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { entries: ENTRIES } }), env, { client });
    expect(res.status).toBe(422);
  });

  it('needs a synced journal and caps reflections per day', async () => {
    const client = fakeClaude({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    const fresh = makeEnv({ ANTHROPIC_API_KEY: 'test' });
    expect((await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { entries: ENTRIES } }), fresh, { client })).status).toBe(404);

    const env = await syncedEnv();
    for (let i = 0; i < DAILY_LIMIT; i++) {
      await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { entries: ENTRIES } }), env, { client });
    }
    const over = await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { entries: ENTRIES } }), env, { client });
    expect(over.status).toBe(429);
    expect(client.beta.messages.create).toHaveBeenCalledTimes(DAILY_LIMIT);
  });

  it('says so when the server has no API key', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    expect((await handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body: { entries: ENTRIES } }), env)).status).toBe(503);
  });
});

describe('push reminders', () => {
  it('signs a valid VAPID token for the push service', async () => {
    const env = await vapidEnv();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', env, Date.UTC(2026, 9, 6));
    const [, jwt, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(key).toBe(env.VAPID_PUBLIC_KEY);

    const [h, c, s] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:test@example.com' });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      env.pair.publicKey,
      Buffer.from(s, 'base64url'),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(valid).toBe(true);
  });

  it('is due in the right 15-minute window of the person’s own time zone, once a day', () => {
    const reminder = { time: '20:30', timeZone: 'Asia/Kolkata', lastSent: null };
    expect(isDue(reminder, new Date('2026-10-06T15:05:00Z'))).toBe(true); // 20:35 IST
    expect(isDue(reminder, new Date('2026-10-06T14:55:00Z'))).toBe(false); // 20:25 IST
    expect(isDue(reminder, new Date('2026-10-06T15:20:00Z'))).toBe(false); // 20:50 IST
    expect(isDue({ ...reminder, lastSent: '2026-10-06' }, new Date('2026-10-06T15:05:00Z'))).toBe(false);
  });

  it('saves a reminder, sends it when due, and drops expired subscriptions', async () => {
    const env = { ...makeEnv(), ...(await vapidEnv()) };
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    const saved = await handle(
      req('PUT', `/v1/vaults/${VAULT}/reminder`, {
        body: { subscription: { endpoint: 'https://push.example/abc' }, time: '20:30', timeZone: 'Asia/Kolkata' },
      }),
      env,
    );
    expect(saved.status).toBe(200);

    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const now = new Date('2026-10-06T15:05:00Z');
    expect(await sendDueReminders(env, { now, fetchImpl })).toBe(1);
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toMatch(/^vapid t=/);
    expect(await sendDueReminders(env, { now, fetchImpl })).toBe(0); // already sent today

    const gone = vi.fn(async () => new Response(null, { status: 410 }));
    await sendDueReminders(env, { now: new Date('2026-10-07T15:05:00Z'), fetchImpl: gone });
    expect(await env.JOURNAL.get(`reminder:${VAULT}`)).toBeNull();
  });

  it('rejects bad reminder settings', async () => {
    const env = makeEnv();
    await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: 'x' } }), env);
    const bad = await handle(
      req('PUT', `/v1/vaults/${VAULT}/reminder`, {
        body: { subscription: { endpoint: 'http://insecure' }, time: '25:00', timeZone: 'Nowhere/City' },
      }),
      env,
    );
    expect(bad.status).toBe(400);
  });
});
