import { describe, expect, it } from 'vitest';

import {
  FilePolicyError,
  normalizeDisplayName,
  validateUploadDeclaration,
  verifyDetectedType,
} from './policy';

describe('file policy', () => {
  it('normalizes an untrusted display name without changing the storage key', () => {
    expect(normalizeDisplayName('../бриф\\ клиента.pdf')).toBe('бриф клиента.pdf');
  });

  it('enforces size, declared MIME and matching extension', () => {
    expect(
      validateUploadDeclaration({
        name: 'photo.JPG',
        mimeType: 'image/jpeg',
        size: 42,
        maxBytes: 100,
      }),
    ).toMatchObject({ mimeType: 'image/jpeg', normalizedName: 'photo.JPG' });
    expect(() =>
      validateUploadDeclaration({
        name: 'photo.exe',
        mimeType: 'image/jpeg',
        size: 42,
        maxBytes: 100,
      }),
    ).toThrow(FilePolicyError);
  });

  it('blocks ZIP containers and MIME spoofing by content', () => {
    expect(() =>
      verifyDetectedType('application/pdf', new TextEncoder().encode('PK\u0003\u0004payload')),
    ).toThrowError('FILE_TYPE_NOT_ALLOWED');
    expect(() =>
      verifyDetectedType('image/png', new TextEncoder().encode('%PDF-1.7')),
    ).toThrowError('FILE_TYPE_NOT_ALLOWED');
  });
});
