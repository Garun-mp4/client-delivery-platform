import type { ProjectExportRecord, ProjectExportRendered } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(/([`*_[\]<>#|])/g, '\\$1');
}

function date(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
    timeZone: 'UTC',
  }).format(new Date(value));
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function renderProjectExport(record: ProjectExportRecord): ProjectExportRendered {
  const markdown: string[] = [
    `# ${escapeMarkdown(record.project.name)}`,
    '',
    `Клиент: ${escapeMarkdown(record.project.companyName)}`,
    `Статус: ${escapeMarkdown(record.project.status)}`,
    `Плановый период: ${date(record.project.plannedStartDate)} — ${date(record.project.plannedEndDate)}`,
    `Экспорт создан: ${date(record.project.exportedAt)}`,
    '',
    record.project.description ? escapeMarkdown(record.project.description) : '',
    '',
    '## Границы проекта',
    '',
    ...record.scope.flatMap((item) => [
      `### Редакция ${item.revision} · ${escapeMarkdown(item.status)}`,
      '',
      escapeMarkdown(item.summary),
      '',
    ]),
    '## Этапы',
    '',
    ...record.stages.map(
      (item) =>
        `- **${escapeMarkdown(item.name)}** — ${escapeMarkdown(item.status)}, срок ${date(item.plannedEndDate)}${item.resultSummary ? `; результат: ${escapeMarkdown(item.resultSummary)}` : ''}${item.skipReason ? `; причина пропуска: ${escapeMarkdown(item.skipReason)}` : ''}`,
    ),
    '',
    '## Обновления',
    '',
    ...record.updates.flatMap((item) => [
      `### ${escapeMarkdown(item.title)} · ${date(item.publishedAt)}`,
      '',
      escapeMarkdown(item.body),
      '',
    ]),
    '## Версии сайта',
    '',
    ...record.versions.map(
      (item) =>
        `- **Версия ${item.versionNumber}: ${escapeMarkdown(item.name)}** (${date(item.publishedAt)}) — ${escapeMarkdown(item.changeLog)} — ${escapeMarkdown(item.url)}`,
    ),
    '',
    '## Замечания и обсуждения',
    '',
    ...record.feedback.flatMap((item) => [
      `### ${escapeMarkdown(item.title)} · ${escapeMarkdown(item.status)}`,
      '',
      escapeMarkdown(item.body),
      '',
      ...item.comments.map(
        (comment) =>
          `- ${date(comment.createdAt)} — ${comment.deleted ? '_Сообщение удалено_' : escapeMarkdown(comment.body)}`,
      ),
      '',
    ]),
    '## Согласования',
    '',
    ...record.approvals.map(
      (item) =>
        `- **${escapeMarkdown(item.title)}** — ${escapeMarkdown(item.status)}; запрос ${date(item.requestedAt)}; решение ${date(item.resolvedAt)}`,
    ),
    '',
    '## Передача проекта',
    '',
    ...record.checklist.map(
      (item) =>
        `- [${item.completedAt ? 'x' : ' '}] ${escapeMarkdown(item.label)}${item.completedAt ? ` — ${date(item.completedAt)}` : ''}`,
    ),
    '',
  ];

  const section = (title: string, body: string) => `<section><h2>${title}</h2>${body}</section>`;
  const html = [
    '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(record.project.name)}</title>`,
    '<style>body{font:16px/1.6 system-ui,sans-serif;color:#17201c;max-width:900px;margin:0 auto;padding:40px 24px}h1,h2,h3{line-height:1.15}section{border-top:1px solid #d8d4c8;margin-top:32px;padding-top:20px}li{margin:.45rem 0}.meta{color:#58635e}.entry{margin:1.2rem 0;white-space:pre-wrap}</style></head><body>',
    `<h1>${escapeHtml(record.project.name)}</h1>`,
    `<p class="meta">Клиент: ${escapeHtml(record.project.companyName)} · статус: ${escapeHtml(record.project.status)} · экспорт: ${date(record.project.exportedAt)}</p>`,
    record.project.description ? `<p>${escapeHtml(record.project.description)}</p>` : '',
    section(
      'Границы проекта',
      record.scope
        .map(
          (item) =>
            `<article class="entry"><h3>Редакция ${item.revision} · ${escapeHtml(item.status)}</h3>${escapeHtml(item.summary)}</article>`,
        )
        .join(''),
    ),
    section(
      'Этапы',
      `<ul>${record.stages
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.status)}, срок ${date(item.plannedEndDate)}${item.resultSummary ? `; результат: ${escapeHtml(item.resultSummary)}` : ''}${item.skipReason ? `; причина пропуска: ${escapeHtml(item.skipReason)}` : ''}</li>`,
        )
        .join('')}</ul>`,
    ),
    section(
      'Обновления',
      record.updates
        .map(
          (item) =>
            `<article class="entry"><h3>${escapeHtml(item.title)}</h3><p class="meta">${date(item.publishedAt)}</p>${escapeHtml(item.body)}</article>`,
        )
        .join(''),
    ),
    section(
      'Версии сайта',
      `<ul>${record.versions
        .map((item) => {
          const url = safeHttpUrl(item.url);
          const link = url
            ? `<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(item.url)}</a>`
            : escapeHtml(item.url);
          return `<li><strong>Версия ${item.versionNumber}: ${escapeHtml(item.name)}</strong> — ${escapeHtml(item.changeLog)} — ${link}</li>`;
        })
        .join('')}</ul>`,
    ),
    section(
      'Замечания и обсуждения',
      record.feedback
        .map(
          (item) =>
            `<article class="entry"><h3>${escapeHtml(item.title)} · ${escapeHtml(item.status)}</h3><p>${escapeHtml(item.body)}</p><ul>${item.comments
              .map(
                (comment) =>
                  `<li>${date(comment.createdAt)} — ${comment.deleted ? '<em>Сообщение удалено</em>' : escapeHtml(comment.body)}</li>`,
              )
              .join('')}</ul></article>`,
        )
        .join(''),
    ),
    section(
      'Согласования',
      `<ul>${record.approvals
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.status)}; запрос ${date(item.requestedAt)}; решение ${date(item.resolvedAt)}</li>`,
        )
        .join('')}</ul>`,
    ),
    section(
      'Передача проекта',
      `<ul>${record.checklist
        .map(
          (item) =>
            `<li>${item.completedAt ? '✓' : '○'} ${escapeHtml(item.label)}${item.completedAt ? ` — ${date(item.completedAt)}` : ''}</li>`,
        )
        .join('')}</ul>`,
    ),
    '</body></html>',
  ].join('');

  return { markdown: markdown.join('\n'), html };
}
