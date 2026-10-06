// Prints a new VAPID key pair for Web Push. Set both as Worker secrets:
//   npx wrangler secret put VAPID_PUBLIC_KEY
//   npx wrangler secret put VAPID_PRIVATE_JWK
import { webcrypto as crypto } from 'node:crypto';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const publicKey = Buffer.from(raw).toString('base64url');
const privateJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));

console.log('VAPID_PUBLIC_KEY:');
console.log(publicKey);
console.log('\nVAPID_PRIVATE_JWK (keep secret):');
console.log(privateJwk);
