// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/index.js';
import { at, makeEnv, req } from './helpers.js';

const REPORT = { kind: 'error', name: 'TypeError', message: 'x is undefined', stack: 'at f (index.js:1:2)', route: '/settings', version: '2.0.0', at: '2026-10-12T00:00:00Z' };

describe('error reports', () => {
  it('logs a report and stores nothing (apart from the rate counter)', async () => {
    const env = makeEnv();
    const log = vi.fn();
    const res = await handle(req('POST', '/v1/errors', { body: { ...REPORT, extra: 'dropped' }, token: null }), env, { ...at(0), log });
    expect(res.status).toBe(204);
    const logged = JSON.parse(log.mock.calls[0][0]);
    expect(logged).toEqual({ type: 'client-error', ...REPORT });
    expect([...env.JOURNAL.store.keys()].every((k) => k.startsWith('rl:'))).toBe(true);
  });

  it('trims long fields', async () => {
    const log = vi.fn();
    await handle(req('POST', '/v1/errors', { body: { ...REPORT, message: 'm'.repeat(5000) }, token: null }), makeEnv(), { ...at(0), log });
    expect(JSON.parse(log.mock.calls[0][0]).message).toHaveLength(300);
  });

  it('rejects things that are not reports, and oversized bodies', async () => {
    const env = makeEnv();
    const log = vi.fn();
    expect((await handle(req('POST', '/v1/errors', { body: [1, 2], token: null }), env, { ...at(0), log })).status).toBe(400);
    expect((await handle(req('POST', '/v1/errors', { body: { message: 5 }, token: null }), env, { ...at(1), log })).status).toBe(400);
    expect((await handle(req('POST', '/v1/errors', { body: { message: 'x'.repeat(9000) }, token: null }), env, { ...at(2), log })).status).toBe(413);
    expect(log).not.toHaveBeenCalled();
  });

  it('limits reports per address', async () => {
    const env = makeEnv();
    const log = vi.fn();
    for (let i = 0; i < 20; i++) {
      expect((await handle(req('POST', '/v1/errors', { body: REPORT, token: null, ip: '1.2.3.4' }), env, { ...at(i), log })).status).toBe(204);
    }
    const over = await handle(req('POST', '/v1/errors', { body: REPORT, token: null, ip: '1.2.3.4' }), env, { ...at(50), log });
    expect(over.status).toBe(429);
    expect((await handle(req('POST', '/v1/errors', { body: REPORT, token: null, ip: '5.6.7.8' }), env, { ...at(60), log })).status).toBe(204);
  });
});
