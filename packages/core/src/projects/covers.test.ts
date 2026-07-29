import { describe, expect, it } from 'vitest';

import {
  parseProjectCoverUpload,
  PROJECT_COVER_MAX_BYTES,
  resolveProjectCoverKind,
} from './covers';

describe('project covers', () => {
  it('keeps the manual cover ahead of an automatic capture', () => {
    expect(resolveProjectCoverKind(['automatic', 'manual'])).toBe('manual');
    expect(resolveProjectCoverKind(['automatic'])).toBe('automatic');
    expect(resolveProjectCoverKind([])).toBeNull();
  });

  it('accepts only bounded JPEG, PNG and WebP declarations', () => {
    expect(
      parseProjectCoverUpload(
        {
          name: 'cover.webp',
          mimeType: 'image/webp',
          size: 1024,
          checksum: 'a'.repeat(64),
        },
        'request-1',
      ),
    ).toMatchObject({ mimeType: 'image/webp', size: 1024 });
    expect(() =>
      parseProjectCoverUpload(
        {
          name: 'cover.svg',
          mimeType: 'image/svg+xml',
          size: 1024,
          checksum: 'a'.repeat(64),
        },
        'request-2',
      ),
    ).toThrowError('INVALID_INPUT');
    expect(() =>
      parseProjectCoverUpload(
        {
          name: 'cover.png',
          mimeType: 'image/png',
          size: PROJECT_COVER_MAX_BYTES + 1,
          checksum: 'a'.repeat(64),
        },
        'request-3',
      ),
    ).toThrowError('INVALID_INPUT');
  });
});
