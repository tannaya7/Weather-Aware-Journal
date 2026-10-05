import {
  PBKDF2_ITERATIONS,
  decryptJson,
  deriveKey,
  encryptJson,
  fromBase64,
  randomBytes,
  toBase64,
} from './crypto.js';

// Password-protected backup files. Unlike the plain JSON export, the whole
// journal (photos included) is encrypted with AES-GCM under a key derived
// from the backup password, so the file is safe to keep in a cloud drive
// or email to yourself. The format is self-describing so future versions
// can still read old backups.
export const BACKUP_FORMAT = 'weather-journal-backup';
const BACKUP_VERSION = 1;

export class WrongBackupPasswordError extends Error {
  constructor() {
    super("That password doesn't open this backup.");
    this.name = 'WrongBackupPasswordError';
  }
}

// Blob.text() is missing in older Safari; FileReader works everywhere.
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsText(file);
  });
}

export function buildBackupFilename(date = new Date()) {
  return `weather-journal-backup-${date.toISOString().slice(0, 10)}.wjbackup`;
}

export async function createEncryptedBackup(entries, password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const { iv, data } = await encryptJson(key, { entries, createdAt: new Date().toISOString() });
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    count: entries.length,
    data: toBase64(data),
  });
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isEncryptedBackup(text) {
  return parse(text)?.format === BACKUP_FORMAT;
}

// Returns the backup's entries, or throws if the password is wrong or the
// file isn't a backup.
export async function readEncryptedBackup(text, password) {
  const backup = parse(text);
  if (backup?.format !== BACKUP_FORMAT) throw new Error("That file isn't a Weather Journal backup.");
  if (backup.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  }

  const key = await deriveKey(password, fromBase64(backup.kdf.salt), backup.kdf.iterations);
  let contents;
  try {
    contents = await decryptJson(key, { iv: fromBase64(backup.cipher.iv), data: fromBase64(backup.data) });
  } catch {
    throw new WrongBackupPasswordError();
  }
  if (!Array.isArray(contents?.entries)) throw new Error('This backup is damaged.');
  return contents.entries;
}
