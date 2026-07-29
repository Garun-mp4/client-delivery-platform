import { describe, expect, it } from 'vitest';

import { renderProjectExport } from './render';

describe('project export rendering', () => {
  it('escapes active HTML and preserves readable tombstones', () => {
    const result = renderProjectExport({
      project: {
        name: '<script>alert(1)</script>',
        companyName: 'Клиент',
        description: 'Описание',
        status: 'completed',
        plannedStartDate: '2026-01-01',
        plannedEndDate: '2026-02-01',
        exportedAt: '2026-02-02T10:00:00.000Z',
      },
      scope: [],
      stages: [],
      updates: [
        {
          title: 'Готово',
          body: '<img src=x onerror=alert(1)>',
          publishedAt: '2026-02-01T10:00:00.000Z',
        },
      ],
      versions: [
        {
          versionNumber: 1,
          name: 'Опасная ссылка',
          changeLog: 'Проверка схемы',
          url: 'javascript:alert(1)',
          publishedAt: '2026-02-01T10:00:00.000Z',
        },
      ],
      feedback: [
        {
          title: 'Замечание',
          body: 'Текст',
          status: 'closed',
          createdAt: '2026-02-01T10:00:00.000Z',
          comments: [
            {
              body: 'secret old body',
              deleted: true,
              createdAt: '2026-02-01T11:00:00.000Z',
            },
          ],
        },
      ],
      approvals: [],
      checklist: [],
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img');
    expect(result.html).not.toContain('href="javascript:');
    expect(result.html).not.toContain('secret old body');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.markdown).toContain('Сообщение удалено');
  });
});
