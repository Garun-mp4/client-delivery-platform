import { describe, expect, it } from 'vitest';

import { defineModule } from './index';

describe('modular-monolith boundary', () => {
  it('defines immutable named modules', () => {
    const module = defineModule({ name: 'foundation' });

    expect(module).toEqual({ name: 'foundation' });
    expect(Object.isFrozen(module)).toBe(true);
  });
});
