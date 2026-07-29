import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listProjectExports } from '@garun/core/exports';
import { canAccessProject, resolveProjectAccess } from '@garun/core/projects';

import { ProjectNav } from '../_components/project-nav';
import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const statusLabels = {
  pending: 'В очереди',
  processing: 'Собирается',
  succeeded: 'Готов',
  failed: 'Не удалось создать',
  expired: 'Срок хранения истёк',
} as const;

function size(value: number | null): string {
  if (!value) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'unit',
    unit: value >= 1_048_576 ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(value / (value >= 1_048_576 ? 1_048_576 : 1_024));
}

export default async function ProjectExportPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string; projectSlug: string }>;
  readonly searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const access = await resolveProjectAccess(database.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.export')) notFound();
  const jobs = await listProjectExports(database, tenant, projectSlug);
  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">История проекта</p>
          <h1>Экспорт для передачи</h1>
          <p className="lede">
            Получите читаемую историю в Markdown и HTML вместе с доступными оригиналами файлов.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects/${projectSlug}`}>
          К обзору
        </Link>
      </header>
      <ProjectNav projectSlug={projectSlug} workspaceSlug={slug} />
      {feedback.requested ? (
        <p className="notice success" role="status">
          Экспорт поставлен в очередь. Обновите страницу через несколько секунд.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Экспорт сейчас создать нельзя. Повторите попытку позднее.
        </p>
      ) : null}
      <section className="panel" aria-labelledby="export-create-title">
        <p className="eyebrow">Новый пакет</p>
        <h2 id="export-create-title">Собрать актуальную историю</h2>
        <p>
          Состав пакета зависит от ваших текущих прав. В клиентский экспорт не попадут внутренние
          комментарии, действия или файлы. Готовый архив хранится 24 часа.
        </p>
        <form action={`/api/workspaces/${slug}/projects/${projectSlug}/exports`} method="post">
          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
          <SubmitButton pendingText="Ставим в очередь…">Создать экспорт</SubmitButton>
        </form>
      </section>
      <section className="panel" aria-labelledby="export-history-title">
        <p className="eyebrow">Последние запросы</p>
        <h2 id="export-history-title">Готовые пакеты</h2>
        {jobs.length === 0 ? (
          <p className="empty">Экспортов пока нет. Первый пакет появится здесь после обработки.</p>
        ) : (
          <ul className="compact-list export-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <span>
                  <strong>{statusLabels[job.status]}</strong>
                  <small>
                    {job.createdAt.toLocaleString('ru-RU')} ·{' '}
                    {job.audience === 'internal' ? 'внутренняя история' : 'клиентская история'}
                  </small>
                </span>
                <span>
                  {job.status === 'succeeded' && job.expiresAt && job.expiresAt > new Date() ? (
                    <Link
                      className="button-secondary"
                      href={`/api/workspaces/${slug}/projects/${projectSlug}/exports/${job.id}/download`}
                    >
                      Скачать · {job.attachmentCount ?? 0} файл(ов) · {size(job.artifactSize)}
                    </Link>
                  ) : job.status === 'failed' ? (
                    <small>Безопасный код: {job.failureCode ?? 'EXPORT_FAILED'}</small>
                  ) : job.status === 'pending' || job.status === 'processing' ? (
                    <small>Можно безопасно закрыть страницу: worker продолжит обработку.</small>
                  ) : (
                    <small>Создайте новый пакет, если он ещё нужен.</small>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
