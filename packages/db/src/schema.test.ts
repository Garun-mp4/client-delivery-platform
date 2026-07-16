import { describe, expect, it } from 'vitest';

import { systemMetadata } from './schema';

describe('foundation schema', () => {
  it('uses a dedicated infrastructure metadata table', () => {
    expect(systemMetadata.key.name).toBe('key');
    expect(systemMetadata.value.name).toBe('value');
  });
});
