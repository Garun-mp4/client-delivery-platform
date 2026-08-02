import { describe, expect, it } from 'vitest';

import {
  classifyProjectCoverCaptureEligibility,
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

  it.each([
    [null, 'no_version'],
    [
      {
        securityStatus: 'pending',
        availabilityStatus: 'pending',
        accessMode: 'public',
        clientVisible: false,
      },
      'check_pending',
    ],
    [
      {
        securityStatus: 'unsafe',
        availabilityStatus: 'unreachable',
        accessMode: 'password',
        clientVisible: false,
      },
      'unsafe',
    ],
    [
      {
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        accessMode: 'password',
        clientVisible: true,
      },
      'password_protected',
    ],
    [
      {
        securityStatus: 'safe',
        availabilityStatus: 'unreachable',
        accessMode: 'public',
        clientVisible: true,
      },
      'unreachable',
    ],
    [
      {
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        accessMode: 'public',
        clientVisible: false,
      },
      'not_published',
    ],
    [
      {
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        accessMode: 'public',
        clientVisible: true,
      },
      'eligible',
    ],
  ] as const)('classifies capture eligibility as %s', (version, expected) => {
    expect(classifyProjectCoverCaptureEligibility(version)).toBe(expected);
  });

  it('keeps an unfinished check ahead of later eligibility reasons', () => {
    expect(
      classifyProjectCoverCaptureEligibility({
        securityStatus: 'error',
        availabilityStatus: 'unreachable',
        accessMode: 'password',
        clientVisible: false,
      }),
    ).toBe('check_pending');
  });
});
