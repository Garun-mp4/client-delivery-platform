import { describe, expect, it } from 'vitest';

import { publicAppUrl } from './public-url';

describe('publicAppUrl', () => {
  it('uses the configured public origin instead of an internal request host', () => {
    expect(publicAppUrl('http://localhost:3000', '/workspace').toString()).toBe(
      'http://localhost:3000/workspace',
    );
  });

  it('preserves a relative path, query and fragment', () => {
    expect(
      publicAppUrl('https://workspace.example/app', '/login?error=credentials#form').toString(),
    ).toBe('https://workspace.example/login?error=credentials#form');
  });

  it.each(['https://evil.example/path', '//evil.example/path'])(
    'rejects a redirect outside the configured origin: %s',
    (path) => {
      expect(() => publicAppUrl('https://workspace.example', path)).toThrow(
        'Public redirect must stay on the configured application origin',
      );
    },
  );
});
