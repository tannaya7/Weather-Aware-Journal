import { randomBytes } from './crypto.js';

// Unlocking with a fingerprint / face / device PIN via a passkey (WebAuthn).
// There's no server to log in to: the passkey is only used for its PRF
// extension, which returns the same secret every time the same passkey
// signs the same salt, and only after the person verifies with biometrics
// or a PIN. That secret wraps the journal's data key (see storage.js).

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super("This device's passkeys can't unlock the journal. Keep using your passcode.");
    this.name = 'PasskeyUnsupportedError';
  }
}

function bytes(buffer) {
  return buffer ? new Uint8Array(buffer) : null;
}

// Whether to offer passkey unlock at all. PRF support can only be fully
// confirmed by trying, so this is "probably".
export async function isPasskeySupported() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return false;
  try {
    const caps = await PublicKeyCredential.getClientCapabilities?.();
    if (caps && 'extension:prf' in caps) return Boolean(caps['extension:prf']);
    return Boolean(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}

async function getSecret(credentialId, prfSalt) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: credentialId }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const secret = bytes(assertion?.getClientExtensionResults().prf?.results?.first);
  if (!secret) throw new PasskeyUnsupportedError();
  return secret;
}

// Creates a passkey for this journal and returns what's needed to unlock
// with it later, plus its secret.
export async function registerPasskey() {
  const prfSalt = randomBytes(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Weather Journal' },
      user: { id: randomBytes(16), name: 'Weather Journal', displayName: 'Weather Journal' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  if (!credential) throw new Error('Setting up the passkey was cancelled.');

  const prf = credential.getClientExtensionResults().prf;
  if (prf && prf.enabled === false) throw new PasskeyUnsupportedError();

  const credentialId = new Uint8Array(credential.rawId);
  // Some authenticators return the secret at creation; others only when used.
  const secret = bytes(prf?.results?.first) || (await getSecret(credentialId, prfSalt));
  return { credentialId, prfSalt, secret };
}

export function getPasskeySecret({ credentialId, prfSalt }) {
  return getSecret(credentialId, prfSalt);
}

// A friendly message for errors from the browser's passkey prompt.
export function passkeyErrorMessage(error) {
  if (error?.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
  if (error?.name === 'PasskeyUnsupportedError') return error.message;
  return error?.message || 'Something went wrong with the passkey.';
}
