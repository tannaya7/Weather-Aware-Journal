// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/index.js';
import { ORIGIN, SEALED, SEALED_2, T0, TOKEN, VAULT, at, makeEnv, req } from './helpers.js';

const put = (env, body, deps, options = {}) =>
  handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body, ...options }), env, deps);

describe('version check', () => {
  it('reports the current version without sending the journal', async () => {
    const env = makeEnv();
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/version`), env)).status).toBe(404);

    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    const one = await (await handle(req('GET', `/v1/vaults/${VAULT}/version`), env)).json();
    expect(one).toEqual({ version: 1, updatedAt: new Date(T0).toISOString() });

    await put(env, { baseVersion: 1, data: SEALED_2 }, at(5000));
    expect((await (await handle(req('GET', `/v1/vaults/${VAULT}/version`), env)).json()).version).toBe(2);
  });

  it('is cheap: it never reads the journal itself once the small record exists', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    const gets = [];
    const original = env.JOURNAL.get.bind(env.JOURNAL);
    env.JOURNAL.get = async (key, type) => {
      gets.push(key);
      return original(key, type);
    };
    await handle(req('GET', `/v1/vaults/${VAULT}/version`), env);
    expect(gets.some((k) => k.endsWith(':journal'))).toBe(false);
  });

  it('still answers for journals written before the small record existed', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    await env.JOURNAL.delete(`vault:${VAULT}:meta`);
    expect((await (await handle(req('GET', `/v1/vaults/${VAULT}/version`), env)).json()).version).toBe(1);
  });

  it('needs the right token', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/version`, { token: 'c'.repeat(64) }), env)).status).toBe(403);
  });

  it('is removed along with the journal', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    await handle(req('DELETE', `/v1/vaults/${VAULT}`), env);
    expect(await env.JOURNAL.get(`vault:${VAULT}:meta`)).toBeNull();
  });
});

describe('write throttle', () => {
  it('asks a device that writes again within a second to wait', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    const fast = await put(env, { baseVersion: 1, data: SEALED_2 }, at(400));
    expect(fast.status).toBe(429);
    expect(fast.headers.get('retry-after')).toBe('1');
    expect(fast.headers.get('access-control-expose-headers')).toBe('retry-after');

    expect((await put(env, { baseVersion: 1, data: SEALED_2 }, at(1500))).status).toBe(200);
  });

  it('turns the storage layer rate limit into a 429 too', async () => {
    const env = makeEnv();
    const original = env.JOURNAL.put.bind(env.JOURNAL);
    env.JOURNAL.put = async (key, value, options) => {
      if (key.endsWith(':journal')) throw new Error('KV PUT failed: 429 Too Many Requests');
      return original(key, value, options);
    };
    const res = await put(env, { baseVersion: 0, data: SEALED }, at(0));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('2');
  });

  it('still succeeds when only the small version record fails to save', async () => {
    const env = makeEnv();
    const original = env.JOURNAL.put.bind(env.JOURNAL);
    env.JOURNAL.put = async (key, value, options) => {
      if (key.endsWith(':meta')) throw new Error('boom');
      return original(key, value, options);
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await put(env, { baseVersion: 0, data: SEALED }, at(0))).status).toBe(200);
    spy.mockRestore();
  });

  it('reports other storage errors as a server error', async () => {
    const env = makeEnv();
    const original = env.JOURNAL.put.bind(env.JOURNAL);
    env.JOURNAL.put = async (key, value, options) => {
      if (key.endsWith(':journal')) throw new Error('disk on fire');
      return original(key, value, options);
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await put(env, { baseVersion: 0, data: SEALED }, at(0))).status).toBe(500);
    spy.mockRestore();
  });
});

describe('abuse limits', () => {
  it('turns away an address that keeps sending wrong tokens, then lets it back after the window', async () => {
    const env = makeEnv();
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    const wrong = () => req('GET', `/v1/vaults/${VAULT}/journal`, { token: 'c'.repeat(64), ip: '9.9.9.9' });
    const right = (ip) => req('GET', `/v1/vaults/${VAULT}/journal`, { ip });

    for (let i = 0; i < 20; i++) expect((await handle(wrong(), env, at(1000 + i))).status).toBe(403);
    const blocked = await handle(wrong(), env, at(2000));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);

    // Even the right token is refused from that address for now,
    expect((await handle(right('9.9.9.9'), env, at(3000))).status).toBe(429);
    // but not from another one,
    expect((await handle(right('8.8.8.8'), env, at(3000))).status).toBe(200);
    // and the block ends with the window.
    expect((await handle(right('9.9.9.9'), env, at(11 * 60 * 1000))).status).toBe(200);
  });

  it('does not count a missing journal as a failed sign-in', async () => {
    const env = makeEnv();
    for (let i = 0; i < 30; i++) {
      expect((await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { ip: '7.7.7.7' }), env, at(i))).status).toBe(404);
    }
  });

  it('counts a missing token as a failed sign-in', async () => {
    const env = makeEnv();
    const noToken = () => req('GET', `/v1/vaults/${VAULT}/journal`, { token: null, ip: '6.6.6.6' });
    for (let i = 0; i < 20; i++) expect((await handle(noToken(), env, at(i))).status).toBe(401);
    expect((await handle(noToken(), env, at(100))).status).toBe(429);
  });

  it('limits how many journals one address can create in an hour', async () => {
    const env = makeEnv();
    const vault = (n) => String(n).repeat(64);
    const create = (n, ip, ms, extra = {}) =>
      handle(req('PUT', `/v1/vaults/${vault(n)}/journal`, { body: { baseVersion: 0, data: SEALED, ...extra }, ip }), env, at(ms));

    for (let n = 1; n <= 5; n++) expect((await create(n, '5.5.5.5', n)).status).toBe(200);
    const sixth = await create(6, '5.5.5.5', 10);
    expect(sixth.status).toBe(429);
    expect(await env.JOURNAL.get(`vault:${vault(6)}:auth`)).toBeNull();

    // Updating an existing journal is not creating one.
    const again = await handle(
      req('PUT', `/v1/vaults/${vault(1)}/journal`, { body: { baseVersion: 1, data: SEALED_2 }, ip: '5.5.5.5' }),
      env,
      at(5000),
    );
    expect(again.status).toBe(200);
    // Another address can create its own, and after the hour so can this one.
    expect((await create(6, '4.4.4.4', 20)).status).toBe(200);
    expect((await create(7, '5.5.5.5', 61 * 60 * 1000)).status).toBe(200);
  });

  it('limits reflections in a short burst, apart from the daily cap', async () => {
    const env = makeEnv({ ANTHROPIC_API_KEY: 'test' });
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    const client = {
      beta: { messages: { create: vi.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] })) } },
    };
    const body = { entries: [{ date: '2026-10-01', text: 'hi' }] };
    const reflect = (ms) => handle(req('POST', `/v1/vaults/${VAULT}/reflect`, { body }), env, { client, now: () => T0 + ms });

    for (let i = 0; i < 5; i++) expect((await reflect(i)).status).toBe(200);
    expect((await reflect(6)).status).toBe(429);
    expect(client.beta.messages.create).toHaveBeenCalledTimes(5);
    // A minute later the burst window has reset.
    expect((await reflect(61_000)).status).toBe(200);
  });
});

describe('request checks', () => {
  it('stores only what looks like an encrypted journal from the app', async () => {
    const env = makeEnv();
    for (const data of ['plain text', '{"hello":"world"}', JSON.stringify({ iv: 'short', data: 'AA' }), '']) {
      expect((await put(env, { baseVersion: 0, data }, at(0))).status).toBe(400);
    }
    expect(await env.JOURNAL.get(`vault:${VAULT}:journal`)).toBeNull();
  });

  it('rejects bad versions', async () => {
    const env = makeEnv();
    for (const baseVersion of [-1, 1.5, '0', null]) {
      expect((await put(env, { baseVersion, data: SEALED }, at(0))).status).toBe(400);
    }
  });

  it('refuses bodies that are not JSON', async () => {
    const env = makeEnv();
    const send = (type) =>
      handle(
        new Request(`https://server.example/v1/vaults/${VAULT}/journal`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': type, origin: ORIGIN },
          body: JSON.stringify({ baseVersion: 0, data: SEALED }),
        }),
        env,
        at(0),
      );
    expect((await send('text/plain')).status).toBe(415);
    expect((await send('application/jsonx')).status).toBe(415);
    expect((await send('application/json; charset=utf-8')).status).toBe(200);
  });

  it('rejects invalid JSON and oversized bodies', async () => {
    const env = makeEnv();
    const base = { method: 'PUT', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } };
    const broken = new Request(`https://server.example/v1/vaults/${VAULT}/journal`, { ...base, body: '{not json' });
    expect((await handle(broken, env, at(0))).status).toBe(400);
    const huge = new Request(`https://server.example/v1/vaults/${VAULT}/journal`, {
      ...base,
      headers: { ...base.headers, 'content-length': String(21 * 1024 * 1024) },
      body: '{}',
    });
    expect((await handle(huge, env, at(0))).status).toBe(413);
  });

  it('says 405 with the allowed methods, rather than 404, for a known path', async () => {
    const env = makeEnv();
    const res = await handle(req('PATCH', `/v1/vaults/${VAULT}/journal`), env);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PUT');
    expect((await handle(req('POST', '/v1/health'), env)).headers.get('allow')).toBe('GET');
    expect((await handle(req('GET', '/v1/nowhere'), env)).status).toBe(404);
  });

  it('marks every response as uncacheable, unframeable, and not sniffable', async () => {
    const env = makeEnv();
    const requests = [req('GET', '/v1/health'), req('GET', '/v1/nowhere'), req('PATCH', `/v1/vaults/${VAULT}/journal`)];
    for (const request of requests) {
      const res = await handle(request, env);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    }
  });
});

describe('authorization and secrets', () => {
  it('never stores or logs the token', async () => {
    const env = makeEnv();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { token: 'c'.repeat(64) }), env);
    const everything = JSON.stringify([...env.JOURNAL.store.entries()]);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain('c'.repeat(64));
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    log.mockRestore();
  });

  it('a token valid for one journal does not open another', async () => {
    const env = makeEnv();
    const other = 'e'.repeat(64);
    await put(env, { baseVersion: 0, data: SEALED }, at(0));
    await handle(
      req('PUT', `/v1/vaults/${other}/journal`, { token: 'f'.repeat(64), body: { baseVersion: 0, data: SEALED_2 } }),
      env,
      at(10),
    );
    expect((await handle(req('GET', `/v1/vaults/${other}/journal`, { token: TOKEN }), env)).status).toBe(403);
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { token: 'f'.repeat(64) }), env)).status).toBe(403);
  });

  it('treats a too-short token as missing', async () => {
    const env = makeEnv();
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/journal`, { token: 'short' }), env)).status).toBe(401);
  });
});
