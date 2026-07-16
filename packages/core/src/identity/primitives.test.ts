import { describe, expect, it } from 'vitest';

import {
  createOneTimeToken,
  hashOneTimeToken,
  isExpired,
  maskEmail,
  normalizeEmail,
  safeRelativeRedirect,
  verifyOneTimeToken,
  webmailProviderForEmail,
} from './primitives';

describe('identity primitives', () => {
  it('normalizes email deterministically', () =>
    expect(normalizeEmail('  OWNER@Example.COM ')).toBe('owner@example.com'));
  it('stores and verifies only a token hash', () => {
    const token = createOneTimeToken();
    const hash = hashOneTimeToken(token);
    expect(hash).not.toContain(token);
    expect(verifyOneTimeToken(token, hash)).toBe(true);
    expect(verifyOneTimeToken(`${token}x`, hash)).toBe(false);
  });
  it('treats the exact expiry instant as expired', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isExpired(now, now)).toBe(true);
  });
  it('permits only local redirect paths', () => {
    expect(safeRelativeRedirect('/workspace/demo')).toBe('/workspace/demo');
    expect(safeRelativeRedirect('//evil.test')).toBe('/workspace');
    expect(safeRelativeRedirect('/\\evil.test')).toBe('/workspace');
    expect(safeRelativeRedirect('https://evil.test')).toBe('/workspace');
  });
  it('masks audit email values', () =>
    expect(maskEmail('owner@example.com')).toBe('o***@example.com'));
  it('maps only known domains to fixed webmail providers', () => {
    expect(webmailProviderForEmail(' User@GMAIL.com ')).toBe('gmail');
    expect(webmailProviderForEmail('user@inbox.ru')).toBe('mailru');
    expect(webmailProviderForEmail('user@yandex.ru')).toBe('yandex');
    expect(webmailProviderForEmail('user@company.example')).toBeNull();
  });
});
