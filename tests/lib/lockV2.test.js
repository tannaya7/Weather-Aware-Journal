import { beforeEach, describe, expect, it } from 'vitest';
import {
  WrongPasscodeError,
  addPasskey,
  changePasscode,
  getLockInfo,
  loadEntries,
  removePasskey,
  setPasscode,
  unlock,
  unlockWithPasskeySecret,
} from '../../src/lib/storage.js';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  generateDataKey,
  randomBytes,
  unwrapDataKey,
  wrapDataKey,
  wrappingKeyFromSecret,
} from '../../src/lib/crypto.js';
import { rawRecords } from '../helpers/journal.jsx';

const ENTRIES = [
  { id: 1, content: 'First secret' },
  { id: 2, content: 'Second secret' },
];

function putRaw(records, lockRecord) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('weatherJournal', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('entries', { keyPath: 'id' });
      open.result.createObjectStore('meta', { keyPath: 'key' });
    };
    open.onsuccess = () => {
      const tx = open.result.transaction(['entries', 'meta'], 'readwrite');
      for (const r of records) tx.objectStore('entries').put(r);
      tx.objectStore('meta').put(lockRecord);
      tx.oncomplete = () => {
        open.result.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('key wrapping', () => {
  it('unwraps the same data key with the right wrapping key only', async () => {
    const dataKey = await generateDataKey();
    const right = await wrappingKeyFromSecret(randomBytes(32));
    const wrong = await wrappingKeyFromSecret(randomBytes(32));
    const wrapped = await wrapDataKey(dataKey, right);

    const unwrapped = await unwrapDataKey(wrapped, right);
    const sealed = await encryptJson(dataKey, 'hello');
    expect(await decryptJson(unwrapped, sealed)).toBe('hello');
    await expect(unwrapDataKey(wrapped, wrong)).rejects.toThrow();
  });
});

describe('lock version 2', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('changing the passcode re-wraps the key without touching entries', async () => {
    const key = await setPasscode('old-pass', ENTRIES);
    const before = JSON.stringify(await rawRecords());

    await changePasscode(key, 'new-pass');

    expect(JSON.stringify(await rawRecords())).toBe(before);
    await expect(unlock('old-pass')).rejects.toThrow(WrongPasscodeError);
    expect(await loadEntries(await unlock('new-pass'))).toEqual(ENTRIES);
  });

  it('a passkey secret unlocks the same data key, and keeps working after a passcode change', async () => {
    const key = await setPasscode('pass', ENTRIES);
    const secret = randomBytes(32);
    await addPasskey(key, { credentialId: randomBytes(16), prfSalt: randomBytes(32), secret });

    expect(await loadEntries(await unlockWithPasskeySecret(secret))).toEqual(ENTRIES);
    await expect(unlockWithPasskeySecret(randomBytes(32))).rejects.toThrow(/couldn't unlock/);

    await changePasscode(key, 'other');
    expect(await loadEntries(await unlockWithPasskeySecret(secret))).toEqual(ENTRIES);
  });

  it('removing the passkey leaves passcode unlock working', async () => {
    const key = await setPasscode('pass', ENTRIES);
    await addPasskey(key, { credentialId: randomBytes(16), prfSalt: randomBytes(32), secret: randomBytes(32) });

    await removePasskey();

    expect((await getLockInfo()).passkey).toBeNull();
    expect(await loadEntries(await unlock('pass'))).toEqual(ENTRIES);
  });

  it('upgrades a journal locked by the earlier version on first unlock', async () => {
    // Version 1: entries encrypted directly with the passcode-derived key.
    const salt = randomBytes(16);
    const oldKey = await deriveKey('legacy-pass', salt, 1000);
    const records = await Promise.all(
      ENTRIES.map(async (entry) => ({ id: entry.id, ...(await encryptJson(oldKey, entry)) })),
    );
    await putRaw(records, {
      key: 'lock',
      salt,
      iterations: 1000,
      check: await encryptJson(oldKey, 'weather-journal'),
    });

    await expect(unlock('wrong')).rejects.toThrow(WrongPasscodeError);
    const key = await unlock('legacy-pass');

    expect((await getLockInfo()).version).toBe(2);
    expect(await loadEntries(key)).toEqual(ENTRIES);
    expect(await loadEntries(await unlock('legacy-pass'))).toEqual(ENTRIES);
  });
});
