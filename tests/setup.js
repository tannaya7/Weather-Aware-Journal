import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

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

// Storage opens the database for each read or write and closes it after.
// Counting open connections tells us when the app has stopped writing.
let openConnections = 0;
const open = IDBFactory.prototype.open;
IDBFactory.prototype.open = function (...args) {
  const request = open.apply(this, args);
  openConnections += 1;
  request.addEventListener('error', () => (openConnections -= 1));
  request.addEventListener('success', () => {
    const db = request.result;
    const close = db.close;
    let closed = false;
    db.close = function () {
      if (!closed) {
        closed = true;
        openConnections -= 1;
      }
      return close.call(this);
    };
  });
  return request;
};

// A test can pass while the app still has writes queued, such as clearing
// the draft after a save. Left running, they land in the next test's fresh
// database and leak into it (a draft that test never wrote shows up), so
// unmount and wait for storage to go quiet before moving on.
afterEach(async () => {
  cleanup();
  // Fake timers never fire the waits below; such tests don't touch storage.
  if (vi.isFakeTimers()) return;
  let quietChecks = 0;
  for (let waited = 0; quietChecks < 3 && waited < 2000; waited += 20) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    quietChecks = openConnections === 0 ? quietChecks + 1 : 0;
  }
});
