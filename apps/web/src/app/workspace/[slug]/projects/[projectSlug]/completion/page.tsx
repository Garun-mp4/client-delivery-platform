import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProjectCompletionState, ProjectCompletionError } from '@garun/core/projects';

import { ProjectNav } from '../_components/project-nav';
import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function ProjectCompletionPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string; projectSlug: string }>;
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const state = await getProjectCompletionState(database, tenant, projectSlug).catch((error) => {
    if (error instanceof ProjectCompletionError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });
  const gates = [
    {
      ready: state.gates.stagesReady,
      title: 'Обязательные этапы',
      detail: state.gates.stagesReady
        ? 'Все обязательные этапы согласованы или обоснованно пропущены.'
        : 'Завершите обязательные этапы в разделе «План».',
      href: `/workspace/${slug}/projects/${projectSlug}/workflow`,
    },
    {
      ready: state.gates.noBlockingActions,
      title: 'Блокирующие действия',
      detail: state.gates.noBlockingActions
        ? 'Открытых блокирующих действий нет.'
        : `Осталось блокирующих действий: ${state.blockingActions}.`,
      href: `/workspace/${slug}/projects/${projectSlug}/workflow`,
    },
    {
      ready: state.gates.finalApprovalReady,
      title: 'Финальное согласование',
      detail: state.gates.finalApprovalReady
        ? 'Финальная передача согласована назначенным клиентом.'
        : 'Создайте и получите финальное согласование.',
      href: `/workspace/${slug}/projects/${projectSlug}/approvals`,
    },
  ];
  return (
    <main className="workspace-shell completion-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Финальный контроль</p>
          <h1>Завершение проекта</h1>
          <p className="lede">
            Проект завершится только после выполнения всех условий. Пропустить их одной кнопкой
            нельзя.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects/${projectSlug}`}>
          К обзору проекта
        </Link>
      </header>
      <ProjectNav projectSlug={projectSlug} workspaceSlug={slug} />
      {feedback.error ? (
        <p className="notice error" role="alert">
          Проект пока нельзя завершить. Проверьте условия ниже.
        </p>
      ) : null}
      <section className="completion-gates" aria-labelledby="completion-gates-title">
        <p className="eyebrow">Условия</p>
        <h2 id="completion-gates-title">Что осталось проверить</h2>
        <ul>
          {gates.map((gate) => (
            <li className={gate.ready ? 'is-ready' : 'is-blocked'} key={gate.title}>
              <span className="gate-marker" aria-hidden="true" />
              <div>
                <h3>{gate.title}</h3>
                <p>{gate.detail}</p>
              </div>
              {!gate.ready ? (
                <Link className="text-link" href={gate.href}>
                  Исправить
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel handover-checklist" aria-labelledby="handover-title">
        <p className="eyebrow">Передача</p>
        <h2 id="handover-title">Чек-лист передачи</h2>
        <p className="muted">
          Отмечайте пункт только после фактической передачи. Секреты в платформу не загружаются.
        </p>
        <ul>
          {state.checklist.map((item) => (
            <li key={item.key}>
              <form
                action={`/api/workspaces/${slug}/projects/${projectSlug}/completion/checklist`}
                method="post"
              >
                <input name="itemKey" type="hidden" value={item.key} />
                <input name="completed" type="hidden" value={item.completedAt ? 'no' : 'yes'} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.completedAt ? 'Выполнено' : 'Ещё не выполнено'}</small>
                </span>
                <SubmitButton
                  className={item.completedAt ? 'button-link' : 'button-secondary'}
                  pendingText="Сохраняем…"
                >
                  {item.completedAt ? 'Отменить отметку' : 'Отметить выполненным'}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section className="completion-action">
        <div>
          <p className="eyebrow">Итог</p>
          <h2>{state.canComplete ? 'Всё готово к завершению' : 'Завершение пока недоступно'}</h2>
          <p>
            После завершения проект останется доступным. Перевод в read-only архив выполняется
            отдельно.
          </p>
        </div>
        <form action={`/api/workspaces/${slug}/projects/${projectSlug}/completion`} method="post">
          <label className="confirm-control">
            <input
              name="confirm"
              type="checkbox"
              value="yes"
              required
              disabled={!state.canComplete}
            />
            Подтверждаю выполнение условий завершения
          </label>
          <SubmitButton pendingText="Завершаем…" disabled={!state.canComplete}>
            Завершить проект
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
