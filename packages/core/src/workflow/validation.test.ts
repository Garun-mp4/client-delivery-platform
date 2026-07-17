import { describe, expect, it } from 'vitest';

import {
  parseActionInput,
  parseScopeRevisionInput,
  parseStageInput,
  WorkflowValidationError,
} from './validation';

describe('workflow validation', () => {
  it('allowlists scope content and sanitizes external URLs', () => {
    const parsed = parseScopeRevisionInput({
      summary: '  Новый сайт  ',
      goals: 'Рост обращений\nПонятный каталог',
      contractUrl: 'https://example.test/contract',
      cost: '125000,50',
      currency: 'rub',
      workspaceId: crypto.randomUUID(),
      status: 'agreed',
    });
    expect(parsed.summary).toBe('Новый сайт');
    expect(parsed.goals).toEqual(['Рост обращений', 'Понятный каталог']);
    expect(parsed.costMinor).toBe(12_500_050);
    expect(parsed.currency).toBe('RUB');
    expect(parsed).not.toHaveProperty('workspaceId');
    expect(parsed).not.toHaveProperty('status');
    expect(() =>
      parseScopeRevisionInput({ summary: 'Scope', contractUrl: 'file:///etc/passwd' }),
    ).toThrow(WorkflowValidationError);
  });

  it('uses unambiguous end-of-day UTC deadlines', () => {
    const parsed = parseActionInput({
      title: 'Передать логотип',
      type: 'upload_material',
      priority: 'high',
      visibility: 'client',
      assigneeUserId: crypto.randomUUID(),
      dueDate: '2026-08-15',
      isBlocking: 'yes',
    });
    expect(parsed.dueAt.toISOString()).toBe('2026-08-15T23:59:59.999Z');
    expect(parsed.isBlocking).toBe(true);
  });

  it('rejects invalid weights and reversed stage dates', () => {
    expect(() =>
      parseStageInput({
        name: 'Дизайн',
        weight: 0,
        ownerUserId: crypto.randomUUID(),
        plannedStartDate: '2026-09-10',
        plannedEndDate: '2026-09-01',
      }),
    ).toThrow(WorkflowValidationError);
  });
});
