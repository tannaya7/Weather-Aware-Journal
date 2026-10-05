import { describe, expect, it } from 'vitest';
import { decryptJson, deriveKey, encryptJson, randomBytes } from '../../src/lib/crypto.js';

const ITERATIONS = 1000; // the real default is slow on purpose; tests don't need that

describe('crypto', () => {
  it('round-trips a value through encrypt and decrypt', async () => {
    const key = await deriveKey('passcode', randomBytes(16), ITERATIONS);
    const value = { content: 'Dear journal', tags: ['a'], n: 3 };

    expect(await decryptJson(key, await encryptJson(key, value))).toEqual(value);
  });

  it('uses a fresh IV every time, so equal entries look different on disk', async () => {
    const key = await deriveKey('passcode', randomBytes(16), ITERATIONS);
    const a = await encryptJson(key, 'same');
    const b = await encryptJson(key, 'same');

    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it('fails to decrypt with a key from a different passcode', async () => {
    const salt = randomBytes(16);
    const right = await deriveKey('right', salt, ITERATIONS);
    const wrong = await deriveKey('wrong', salt, ITERATIONS);

    await expect(decryptJson(wrong, await encryptJson(right, 'secret'))).rejects.toThrow();
  });

  it('fails to decrypt tampered data', async () => {
    const key = await deriveKey('passcode', randomBytes(16), ITERATIONS);
    const sealed = await encryptJson(key, 'secret');
    sealed.data[0] ^= 1;

    await expect(decryptJson(key, sealed)).rejects.toThrow();
  });
});
