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
