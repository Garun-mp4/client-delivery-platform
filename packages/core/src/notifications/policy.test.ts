import { describe, expect, it } from 'vitest';

import {
  isInsideQuietHours,
  isValidTimezone,
  notificationPresentation,
  validateQuietHours,
} from './policy';

describe('notification policy', () => {
  it('uses safe copy for known and unknown event types', () => {
    expect(notificationPresentation('approval.requested').title).toBe('Требуется согласование');
    expect(notificationPresentation('untrusted.event')).toEqual({
      title: 'Обновление проекта',
      description: 'В проекте произошло важное изменение.',
    });
  });

  it('validates timezone and paired quiet-hour values', () => {
    expect(isValidTimezone('Europe/Moscow')).toBe(true);
    expect(isValidTimezone('Not/A-Timezone')).toBe(false);
    expect(validateQuietHours(null, null)).toBe(true);
    expect(validateQuietHours(1_320, 480)).toBe(true);
    expect(validateQuietHours(1_320, null)).toBe(false);
    expect(validateQuietHours(500, 500)).toBe(false);
  });

  it('handles quiet hours that cross midnight in the selected timezone', () => {
    expect(isInsideQuietHours(new Date('2026-07-29T20:30:00Z'), 'Europe/Moscow', 1_320, 480)).toBe(
      true,
    );
    expect(isInsideQuietHours(new Date('2026-07-29T09:00:00Z'), 'Europe/Moscow', 1_320, 480)).toBe(
      false,
    );
  });
});
