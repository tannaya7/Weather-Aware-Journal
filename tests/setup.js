import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { configure } from '@testing-library/react';
import { beforeEach } from 'vitest';

// Waiting for the screen to catch up: generous, because the whole suite
// runs in parallel and a busy machine can be slow. A passing test never
// waits this long.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no Web Crypto `subtle`; Node's is the same standard API.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// A fresh, empty IndexedDB for every test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
