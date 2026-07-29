import { unlink } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { buildArchive, dateOnly, safeAttachmentName } from './exports';

describe('export attachment paths', () => {
  it('normalizes PostgreSQL date values at the data boundary', () => {
    expect(dateOnly(new Date('2026-07-29T00:00:00.000Z'))).toBe('2026-07-29');
    expect(dateOnly('2026-07-30')).toBe('2026-07-30');
  });

  it('cannot escape the archive attachment directory', () => {
    const name = safeAttachmentName(
      0,
      '12345678-1234-1234-1234-123456789abc',
      '../../секрет\\report\u0000.html',
    );
    expect(name).toMatch(/^attachments\/0001-12345678-[^/]+\.html$/);
    expect(name).not.toContain('..');
    expect(name).not.toContain('\\');
  });

  it('creates a readable archive when a project has no attachments', async () => {
    const archive = await buildArchive(
      {} as never,
      {
        id: '20e33f04-1008-4e28-a857-31e5c65db64b',
        audience: 'internal',
        projectSlug: 'pilot',
        projectName: 'Pilot',
      } as never,
      {
        project: {
          name: 'Pilot',
          companyName: 'Client',
          description: null,
          status: 'in_progress',
          plannedStartDate: '2026-01-01',
          plannedEndDate: '2026-12-31',
          exportedAt: new Date().toISOString(),
        },
        scope: [],
        stages: [],
        updates: [],
        versions: [],
        feedback: [],
        approvals: [],
        checklist: [],
      },
      [],
    );

    try {
      expect(archive.size).toBeGreaterThan(100);
      expect(archive.checksum).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await unlink(archive.path);
    }
  });
});
