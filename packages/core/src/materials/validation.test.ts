import { describe, expect, it } from 'vitest';

import { parseMaterialRequestInput, parseUploadDeclarations } from './validation';

describe('material validation', () => {
  it('normalizes a material request and rejects invalid dates', () => {
    expect(
      parseMaterialRequestInput({
        title: '  Логотип  ',
        type: 'logo',
        category: ' Бренд ',
        requestedFromUserId: 'user-id',
        dueDate: '2026-08-10',
      }),
    ).toMatchObject({
      title: 'Логотип',
      type: 'logo',
      category: 'Бренд',
      requestedFromUserId: 'user-id',
    });
    expect(() =>
      parseMaterialRequestInput({
        title: 'Логотип',
        type: 'logo',
        requestedFromUserId: 'user-id',
        dueDate: '2026-02-30',
      }),
    ).toThrow();
  });

  it('accepts a bounded safe upload declaration', () => {
    expect(
      parseUploadDeclarations(
        [
          {
            name: 'brief.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            checksum: 'a'.repeat(64),
          },
        ],
        2048,
      ),
    ).toHaveLength(1);
  });

  it('rejects extension spoofing, ZIP and oversized batches', () => {
    expect(() =>
      parseUploadDeclarations(
        [
          {
            name: 'brief.exe',
            mimeType: 'application/pdf',
            size: 1024,
            checksum: 'a'.repeat(64),
          },
        ],
        2048,
      ),
    ).toThrow();
    expect(() =>
      parseUploadDeclarations(
        Array.from({ length: 11 }, (_, index) => ({
          name: `${index}.pdf`,
          mimeType: 'application/pdf',
          size: 1,
          checksum: 'a'.repeat(64),
        })),
        2048,
      ),
    ).toThrow();
  });
});
