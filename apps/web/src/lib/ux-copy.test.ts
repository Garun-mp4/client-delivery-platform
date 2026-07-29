import { describe, expect, it } from 'vitest';

import { formatProjectWaitingTitle } from './ux-copy';

describe('formatProjectWaitingTitle', () => {
  it.each([
    [1, '1 проект ожидает клиента'],
    [2, '2 проекта ожидают клиента'],
    [4, '4 проекта ожидают клиента'],
    [5, '5 проектов ожидают клиента'],
    [11, '11 проектов ожидают клиента'],
    [12, '12 проектов ожидают клиента'],
    [21, '21 проект ожидает клиента'],
    [24, '24 проекта ожидают клиента'],
    [25, '25 проектов ожидают клиента'],
  ])('formats %i correctly', (count, expected) => {
    expect(formatProjectWaitingTitle(count)).toBe(expected);
  });
});
