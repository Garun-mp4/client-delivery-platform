import { describe, expect, it } from 'vitest';

import { nextAllowedDeliveryAt } from './notification-queue';

describe('notification delivery scheduling', () => {
  it('keeps immediate delivery outside quiet hours', () => {
    const now = new Date('2026-07-29T09:00:00Z');
    expect(nextAllowedDeliveryAt(now, 'Europe/Moscow', 1_320, 480)).toEqual(now);
  });

  it('moves delivery to the end of overnight quiet hours', () => {
    const now = new Date('2026-07-29T20:30:00Z');
    expect(nextAllowedDeliveryAt(now, 'Europe/Moscow', 1_320, 480)).toEqual(
      new Date('2026-07-30T05:00:00Z'),
    );
  });

  it('uses the recipient timezone across a daylight-saving transition', () => {
    const beforeSpringShift = new Date('2026-03-29T00:30:00Z');
    expect(nextAllowedDeliveryAt(beforeSpringShift, 'Europe/Berlin', 60, 240)).toEqual(
      new Date('2026-03-29T02:00:00Z'),
    );
  });
});
