import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WrongBackupPasswordError,
  buildBackupFilename,
  createEncryptedBackup,
  isEncryptedBackup,
  readEncryptedBackup,
} from '../../src/lib/backup.js';
import { mergeImportedEntries } from '../../src/lib/exportImport.js';
import { isPasskeySupported, registerPasskey, getPasskeySecret, passkeyErrorMessage } from '../../src/lib/passkey.js';

const ENTRIES = [
  { id: 1, content: 'Private', images: ['data:image/jpeg;base64,/9j/AAAA'] },
  { id: 2, content: 'Also private', mood: 'Sad' },
];

describe('encrypted backups', () => {
  it('round-trips every entry, photos included', async () => {
    const text = await createEncryptedBackup(ENTRIES, 'a long password');
    expect(isEncryptedBackup(text)).toBe(true);
    expect(await readEncryptedBackup(text, 'a long password')).toEqual(ENTRIES);
  });

  it('keeps the contents unreadable without the password', async () => {
    const text = await createEncryptedBackup(ENTRIES, 'a long password');
    expect(text).not.toContain('Private');
    expect(JSON.parse(text)).toMatchObject({ format: 'weather-journal-backup', version: 1, count: 2 });
  });

  it('rejects a wrong password', async () => {
    const text = await createEncryptedBackup(ENTRIES, 'a long password');
    await expect(readEncryptedBackup(text, 'nope')).rejects.toThrow(WrongBackupPasswordError);
  });

  it('rejects files that are not backups, or from a newer app', async () => {
    await expect(readEncryptedBackup('[]', 'x')).rejects.toThrow(/isn't a weather journal backup/i);
    const newer = JSON.stringify({ format: 'weather-journal-backup', version: 99 });
    await expect(readEncryptedBackup(newer, 'x')).rejects.toThrow(/newer version/);
  });

  it('the plain Import points to the backup restore instead', async () => {
    const text = await createEncryptedBackup(ENTRIES, 'a long password');
    expect(() => mergeImportedEntries([], text)).toThrow(/encrypted backup/);
  });

  it('names files by date', () => {
    expect(buildBackupFilename(new Date('2026-10-05T12:00:00Z'))).toBe('weather-journal-backup-2026-10-05.wjbackup');
  });
});

describe('passkeys', () => {
  const SECRET = new Uint8Array(32).fill(7).buffer;

  function credential({ prf }) {
    return { rawId: new Uint8Array([1, 2, 3]).buffer, getClientExtensionResults: () => ({ prf }) };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers and returns the PRF secret given at creation', async () => {
    const create = vi.fn().mockResolvedValue(credential({ prf: { enabled: true, results: { first: SECRET } } }));
    vi.stubGlobal('navigator', { ...navigator, credentials: { create, get: vi.fn() } });

    const result = await registerPasskey();

    expect(result.secret).toEqual(new Uint8Array(SECRET));
    expect(result.credentialId).toEqual(new Uint8Array([1, 2, 3]));
    const options = create.mock.calls[0][0].publicKey;
    expect(options.authenticatorSelection.userVerification).toBe('required');
    expect(options.extensions.prf.eval.first).toBe(result.prfSalt);
  });

  it('asks the passkey for the secret when creation does not return it', async () => {
    const create = vi.fn().mockResolvedValue(credential({ prf: { enabled: true } }));
    const get = vi.fn().mockResolvedValue(credential({ prf: { results: { first: SECRET } } }));
    vi.stubGlobal('navigator', { ...navigator, credentials: { create, get } });

    const result = await registerPasskey();

    expect(get).toHaveBeenCalled();
    expect(result.secret).toEqual(new Uint8Array(SECRET));
  });

  it('refuses passkeys without PRF support', async () => {
    const create = vi.fn().mockResolvedValue(credential({ prf: { enabled: false } }));
    vi.stubGlobal('navigator', { ...navigator, credentials: { create, get: vi.fn() } });

    await expect(registerPasskey()).rejects.toThrow(/can't unlock the journal/);
  });

  it('gets the secret for an existing passkey', async () => {
    const get = vi.fn().mockResolvedValue(credential({ prf: { results: { first: SECRET } } }));
    vi.stubGlobal('navigator', { ...navigator, credentials: { create: vi.fn(), get } });
    const credentialId = new Uint8Array([9]);

    expect(await getPasskeySecret({ credentialId, prfSalt: new Uint8Array(32) })).toEqual(new Uint8Array(SECRET));
    expect(get.mock.calls[0][0].publicKey.allowCredentials[0].id).toBe(credentialId);
  });

  it('detects support from client capabilities', async () => {
    vi.stubGlobal('PublicKeyCredential', { getClientCapabilities: async () => ({ 'extension:prf': true }) });
    vi.stubGlobal('navigator', { ...navigator, credentials: {} });
    expect(await isPasskeySupported()).toBe(true);

    vi.stubGlobal('PublicKeyCredential', { getClientCapabilities: async () => ({ 'extension:prf': false }) });
    expect(await isPasskeySupported()).toBe(false);
  });

  it('explains a cancelled prompt', () => {
    expect(passkeyErrorMessage({ name: 'NotAllowedError' })).toMatch(/cancelled/);
  });
});
