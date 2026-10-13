// Passcode-based encryption for the journal, using the browser's Web Crypto
// API: PBKDF2 turns the passcode into an AES-GCM key, and every entry is
// encrypted with its own random IV. The key only ever lives in memory.

export const PBKDF2_ITERATIONS = 310000; // OWASP's 2023 recommendation for PBKDF2-SHA256

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(passcode, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key, value) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv, data: new Uint8Array(data) };
}

// Throws if the key is wrong or the data was tampered with (AES-GCM is
// authenticated), which is how a wrong passcode is detected.
export async function decryptJson(key, { iv, data }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(decoder.decode(plain));
}

// --- Key wrapping ---
// The journal is encrypted with one random data key. That key is stored
// only "wrapped" (encrypted) by a key derived from the passcode, and
// optionally by one from a passkey, so either can unlock it, and changing
// the passcode just re-wraps the data key instead of re-encrypting every
// entry.

export function generateDataKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function deriveWrappingKey(passcode, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// A passkey's PRF output is already high-entropy, so HKDF (not PBKDF2)
// turns it into a wrapping key.
export async function wrappingKeyFromSecret(secret, info = 'weather-journal passkey') {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(info) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function wrapDataKey(dataKey, wrappingKey) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv, data: new Uint8Array(data) };
}

// Throws if the wrapping key is wrong (AES-GCM authentication fails).
export function unwrapDataKey({ iv, data }, wrappingKey) {
  return crypto.subtle.unwrapKey(
    'raw',
    data,
    wrappingKey,
    { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// --- Base64, for backup files ---

export function toBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
