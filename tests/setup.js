import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { beforeEach } from 'vitest';

// jsdom has no Web Crypto `subtle`; Node's is the same standard API.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// A fresh, empty IndexedDB for every test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
