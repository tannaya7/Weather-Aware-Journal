import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_VERSION,
  clearReports,
  installErrorReporting,
  isSendingEnabled,
  makeReport,
  readReports,
  recordError,
  reportsAsText,
  resetSession,
  scrubRoute,
  scrubStack,
  scrubText,
  setSendingEnabled,
} from '../../src/lib/errorReport.js';
import { setServerUrl } from '../../src/lib/syncClient.js';

describe('scrubbing', () => {
  it('removes anything that could be journal text from a message', () => {
    expect(scrubText('Unexpected token in "Dear diary, I miss Sam"')).toBe('Unexpected token in …');
    expect(scrubText("Cannot read 'my secret' of undefined")).toBe('Cannot read … of undefined');
    expect(scrubText('Failed for me@example.com at https://x.test/a?b=1')).toBe('Failed for <email> at <url>');
    expect(scrubText('Entry 1696512345123 missing')).toBe('Entry <n> missing');
    expect(scrubText('x'.repeat(1000))).toHaveLength(300);
    expect(scrubText(undefined)).toBe('');
  });

  it('keeps only file names and positions in a stack', () => {
    const stack = 'TypeError: boom\n    at save (https://site.example/app/assets/index-abc.js?v=2:10:5)\n    at "weird" (file:///C:/x/y.js:1:1)';
    expect(scrubStack(stack)).toBe('TypeError: boom\nat save (index-abc.js:10:5)\nat … (y.js:1:1)');
    expect(scrubStack(Array.from({ length: 30 }, (_, i) => `at f${i}`).join('\n')).split('\n')).toHaveLength(12);
  });

  it('takes ids out of the page address', () => {
    expect(scrubRoute('#/entry/1696512345.123')).toBe('/entry/:id');
    expect(scrubRoute('#/edit/dayone-ABC?x=1')).toBe('/edit/:id');
    expect(scrubRoute('#/settings')).toBe('/settings');
    expect(scrubRoute('')).toBe('/');
  });

  it('builds a report with nothing personal in it', () => {
    const err = new Error('Could not parse "my private words"');
    const report = makeReport(err, { route: '#/entry/123456', kind: 'error' });
    expect(report).toMatchObject({ kind: 'error', name: 'Error', message: 'Could not parse …', route: '/entry/:id', version: APP_VERSION });
    expect(APP_VERSION).toBe('2.0.0'); // from package.json
    expect(JSON.stringify(report)).not.toContain('private');
    expect(makeReport('just a string').message).toBe('just a string');
    expect(makeReport({ weird: true }).message).toBe('Non-error thrown');
  });
});

describe('keeping and sending', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSession();
  });
  afterEach(() => setServerUrl(null));

  it('keeps the latest 20 on this device, newest first', () => {
    for (let i = 0; i < 25; i++) recordError(new Error(`e${i}`), {}, null);
    const kept = readReports();
    expect(kept).toHaveLength(20);
    expect(kept[0].message).toBe('e24');
    clearReports();
    expect(readReports()).toEqual([]);
  });

  it('sends nothing unless turned on and a server is set', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    recordError(new Error('a'), {}, fetchImpl);
    setServerUrl('https://server.example');
    recordError(new Error('b'), {}, fetchImpl);
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();

    setSendingEnabled(true);
    expect(isSendingEnabled()).toBe(true);
    recordError(new Error('c'), {}, fetchImpl);
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://server.example/v1/errors');
    expect(JSON.parse(init.body)).toMatchObject({ message: 'c' });
    setSendingEnabled(false);
    expect(isSendingEnabled()).toBe(false);
  });

  it('sends the same error once per session, and at most ten', async () => {
    setServerUrl('https://server.example');
    setSendingEnabled(true);
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const same = new Error('same');
    recordError(same, {}, fetchImpl);
    recordError(same, {}, fetchImpl);
    for (let i = 0; i < 20; i++) recordError(new Error(`n${i}`), {}, fetchImpl);
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it('a failed send is harmless', async () => {
    setServerUrl('https://server.example');
    setSendingEnabled(true);
    expect(() => recordError(new Error('x'), {}, async () => { throw new Error('offline'); })).not.toThrow();
  });

  it('catches errors and rejected promises nothing else handled', () => {
    const target = new EventTarget();
    const stop = installErrorReporting(target);
    const errorEvent = new Event('error');
    errorEvent.error = new Error('uncaught "words"');
    target.dispatchEvent(errorEvent);
    const rejection = new Event('unhandledrejection');
    rejection.reason = new Error('rejected');
    target.dispatchEvent(rejection);
    target.dispatchEvent(new Event('error')); // a failed image load: ignored
    stop();
    target.dispatchEvent(errorEvent);
    expect(readReports().map((r) => [r.kind, r.message])).toEqual([
      ['unhandled-rejection', 'rejected'],
      ['error', 'uncaught …'],
    ]);
  });

  it('writes the reports out as text for a support message', () => {
    expect(reportsAsText([])).toBe('No errors recorded.');
    recordError(new Error('boom'), { route: '#/settings' }, null);
    expect(reportsAsText()).toContain(`error on /settings (v${APP_VERSION})\nError: boom`);
  });
});
