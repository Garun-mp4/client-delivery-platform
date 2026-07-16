import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.byteLength !== 32) throw new Error('Invalid outbox encryption key');
  return key;
}

export function encryptOutboxSecret(plaintext: string, base64Key: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(base64Key), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptOutboxSecret(envelope: string, base64Key: string): string {
  const [version, nonce, tag, ciphertext] = envelope.split('.');
  if (version !== VERSION || !nonce || !tag || !ciphertext)
    throw new Error('Invalid secret envelope');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    decodeKey(base64Key),
    Buffer.from(nonce, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
