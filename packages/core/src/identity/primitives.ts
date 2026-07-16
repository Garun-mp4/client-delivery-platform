import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function createOneTimeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function verifyOneTimeToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOneTimeToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function safeRelativeRedirect(value: string | null | undefined, fallback = '/workspace') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = normalizeEmail(email).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}
