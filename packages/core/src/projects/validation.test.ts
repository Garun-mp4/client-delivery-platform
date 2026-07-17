import { describe, expect, it } from 'vitest';

import { parseClientCompanyInput, parseProjectInput, ProjectValidationError } from './validation';

describe('client and project input validation', () => {
  it('returns an allowlisted client DTO without mass-assigned tenant or status fields', () => {
    const parsed = parseClientCompanyInput({
      name: '  Студия клиента  ',
      email: 'CLIENT@EXAMPLE.TEST',
      workspaceId: 'spoofed',
      status: 'archived',
      internalNotes: 'Только для команды',
    });
    expect(parsed).toEqual({
      name: 'Студия клиента',
      legalName: null,
      website: null,
      phone: null,
      email: 'client@example.test',
      messenger: null,
      internalNotes: 'Только для команды',
    });
    expect(parsed).not.toHaveProperty('workspaceId');
    expect(parsed).not.toHaveProperty('status');
  });

  it('validates a project date range and ignores protected state fields', () => {
    const parsed = parseProjectInput({
      clientCompanyId: crypto.randomUUID(),
      ownerUserId: crypto.randomUUID(),
      name: 'Новый сайт',
      slug: 'new-site',
      projectType: 'website',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-09-01',
      workspaceId: crypto.randomUUID(),
      status: 'completed',
    });
    expect(parsed.slug).toBe('new-site');
    expect(parsed).not.toHaveProperty('workspaceId');
    expect(parsed).not.toHaveProperty('status');
  });

  it('rejects an invalid slug, URL and reversed dates', () => {
    const base = {
      clientCompanyId: crypto.randomUUID(),
      ownerUserId: crypto.randomUUID(),
      name: 'Проект',
      slug: 'проект',
      projectType: 'website',
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-08-01',
    };
    expect(() => parseProjectInput(base)).toThrow(ProjectValidationError);
    expect(() =>
      parseClientCompanyInput({ name: 'Компания', website: 'file:///etc/passwd' }),
    ).toThrow(ProjectValidationError);
  });
});
