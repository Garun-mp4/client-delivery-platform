import { describe, expect, it } from 'vitest';

import { decryptOutboxSecret, encryptOutboxSecret } from './crypto';

describe('outbox secret encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  it('round trips without storing plaintext', () => {
    const envelope = encryptOutboxSecret('https://example.test/?token=secret', key);
    expect(envelope).not.toContain('secret');
    expect(decryptOutboxSecret(envelope, key)).toBe('https://example.test/?token=secret');
  });
  it('rejects tampering', () => {
    const envelope = encryptOutboxSecret('secret', key);
    const parts = envelope.split('.');
    parts[2] = Buffer.alloc(16, 1).toString('base64url');
    expect(() => decryptOutboxSecret(parts.join('.'), key)).toThrow();
  });
});
