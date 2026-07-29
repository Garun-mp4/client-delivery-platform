import { describe, expect, it } from 'vitest';

import { normalizeSiteUrl, parseFeedbackInput } from './validation';

describe('review validation', () => {
  it('normalizes http URLs without fragments', () => {
    expect(normalizeSiteUrl('https://example.test/path#private')).toBe('https://example.test/path');
  });

  it('rejects credentials and non-http schemes', () => {
    expect(() => normalizeSiteUrl('https://user:secret@example.test')).toThrow('INVALID_URL');
    expect(() => normalizeSiteUrl('file:///etc/passwd')).toThrow('INVALID_URL');
  });

  it('allows an optional reviewed page and screenshot', () => {
    expect(
      parseFeedbackInput({
        siteVersionId: 'version',
        title: 'Заголовок',
        body: 'Описание',
        priority: 'high',
        pageUrl: '',
        screenshotFileId: '',
      }),
    ).toMatchObject({ priority: 'high', pageUrl: null, screenshotFileId: null });
  });
});
