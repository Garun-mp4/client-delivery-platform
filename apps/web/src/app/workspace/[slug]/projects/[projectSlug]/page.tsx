import Link from 'next/link';
import { notFound } from 'next/navigation';

import { isOwner } from '@garun/core/identity';
import {
  canAccessProject,
  getClientProject,
  getInternalProject,
  listActiveClientCompanies,
  listInternalWorkspaceMembers,
  listProjectInvitations,
  listProjectMembers,
  resolveProjectAccess,
} from '@garun/core/projects';
import { getProjectWorkflow } from '@garun/core/workflow';

import { ProjectNav } from './_components/project-nav';
import { ProjectRoute } from './_components/project-route';
import { projectStatusLabels, projectTypeLabels } from '../project-copy';
import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

function ClientProjectView({
  slug,
  workspaceSlug,
  project: item,
  workflow,
  preview,
}: {
  slug: string;
  workspaceSlug: string;
  project: NonNullable<Awaited<ReturnType<typeof getClientProject>>>;
  workflow: Awaited<ReturnType<typeof getProjectWorkflow>>;
  preview: boolean;
}) {
  return (
    <main className="workspace-shell client-project-shell">
      {preview ? (
        <div className="preview-banner" role="status">
          Предпросмотр клиентского интерфейса. Вы действуете от своего имени и ничего не
          подтверждаете за клиента.
          <Link href={`/workspace/${workspaceSlug}/projects/${slug}`}>Вернуться к управлению</Link>
        </div>
      ) : null}
      <header className="page-header project-page-header">
        <div>
          <p className="eyebrow">Проект · {item.company.name}</p>
          <h1>{item.name}</h1>
          <p className="lede">Состояние, ближайшее действие и материалы проекта — в одном месте.</p>
        </div>
        <span className="status-pill">{projectStatusLabels[item.status]}</span>
      </header>
      <ProjectNav projectSlug={slug} workspaceSlug={workspaceSlug} />
      {item.status === 'archived' ? (
        <p className="notice" role="status">
          Проект находится в архиве и доступен только для чтения.
        </p>
      ) : null}
      <ProjectRoute
        action={workflow?.nextAction?.title ?? 'От вас пока ничего не требуется'}
        actionHref={
          workflow?.nextAction ? `/workspace/${workspaceSlug}/projects/${slug}/workflow` : undefined
        }
        actionLabel={workflow?.nextAction ? 'Перейти к действию' : undefined}
        progress={workflow?.progressPercent ?? 0}
        responsibility={workflow?.nextAction ? 'Вы' : 'Команда проекта'}
        result={
          workflow?.nextAction
            ? 'После выполнения разработчик увидит результат и продолжит работу.'
            : 'Новое действие появится здесь, когда понадобится ваше участие.'
        }
        status={projectStatusLabels[item.status]}
      />
      <section className="client-summary" aria-labelledby="project-summary-title">
        <div>
          <p className="eyebrow">О проекте</p>
          <h2 id="project-summary-title">Что мы создаём</h2>
          <p>{item.description ?? 'Описание проекта пока не добавлено.'}</p>
        </div>
        <dl>
          <div>
            <dt>Тип проекта</dt>
            <dd>{projectTypeLabels[item.projectType]}</dd>
          </div>
          <div>
            <dt>Плановый период</dt>
            <dd>
              {item.plannedStartDate} — {item.plannedEndDate}
            </dd>
          </div>
          <div>
            <dt>Ваш доступ</dt>
            <dd>{item.access.role === 'observer' ? 'Только просмотр' : 'Участник клиента'}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ preview?: string; success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const access = await resolveProjectAccess(database.db, tenant, projectSlug);
  if (!access) notFound();
  const preview = feedback.preview === 'client' && isOwner(tenant);
  const internal = canAccessProject(access, 'project.view.internal') && !preview;
  if (!internal) {
    const [clientProject, workflow] = await Promise.all([
      getClientProject(database.db, tenant, projectSlug, preview),
      getProjectWorkflow(database.db, tenant, projectSlug),
    ]);
    if (!clientProject) notFound();
    return (
      <ClientProjectView
        slug={projectSlug}
        workspaceSlug={slug}
        project={clientProject}
        workflow={workflow}
        preview={preview}
      />
    );
  }
  const [item, companies, workspaceMembers, members, invitations, workflow] = await Promise.all([
    getInternalProject(database.db, tenant, projectSlug),
    listActiveClientCompanies(database.db, tenant),
    listInternalWorkspaceMembers(database.db, tenant),
    listProjectMembers(database.db, tenant, projectSlug),
    listProjectInvitations(database.db, tenant, projectSlug),
    getProjectWorkflow(database.db, tenant, projectSlug),
  ]);
  if (!item) notFound();
  const archived = item.status === 'archived';
  const memberUserIds = new Set(members.map((member) => member.userId));
  const candidates = workspaceMembers.filter((member) => !memberUserIds.has(member.id));
  return (
    <main className="workspace-shell">
      <header className="page-header project-page-header">
        <div>
          <p className="eyebrow">Проект · {item.companyName}</p>
          <h1>{item.name}</h1>
          <p className="muted">
            {projectStatusLabels[item.status]} · ответственный {item.ownerName}
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects`}>
          Ко всем проектам
        </Link>
      </header>
      <ProjectNav projectSlug={projectSlug} workspaceSlug={slug} />
      {feedback.success ? (
        <p className="notice success" role="status">
          Операция выполнена.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте данные или состояние проекта.
        </p>
      ) : null}
      <div className="project-toolbar project-toolbar-secondary">
        <Link
          className="button-secondary"
          href={`/workspace/${slug}/projects/${projectSlug}?preview=client`}
        >
          Посмотреть глазами клиента
        </Link>
        {item.status === 'draft' ? (
          <form action={`/api/workspaces/${slug}/projects/${projectSlug}/publish`} method="post">
            <label className="confirm-control">
              <input name="confirm" type="checkbox" value="yes" required />
              Показывать приглашённым клиентам
            </label>
            <SubmitButton pendingText="Публикуем…">Опубликовать проект</SubmitButton>
          </form>
        ) : null}
      </div>
      <ProjectRoute
        action={
          workflow?.blockedByClient?.title ??
          workflow?.nextAction?.title ??
          'Определите ближайшее действие проекта'
        }
        actionHref={`/workspace/${slug}/projects/${projectSlug}/workflow`}
        actionLabel="Открыть план"
        progress={workflow?.progressPercent ?? 0}
        responsibility={workflow?.blockedByClient ? 'Клиент' : 'Команда проекта'}
        result={
          workflow?.blockedByClient
            ? 'После ответа клиента блокировка снимется и работа сможет продолжиться.'
            : 'Завершённые этапы автоматически обновят общий прогресс проекта.'
        }
        status={projectStatusLabels[item.status]}
      />
      <details className="panel disclosure-panel">
        <summary>
          <span className="disclosure-title">
            <small>ПАРАМЕТРЫ</small>
            <span id="project-data-title">Карточка проекта</span>
          </span>
        </summary>
        <div className="disclosure-body">
          <form
            className="form-grid"
            action={`/api/workspaces/${slug}/projects/${projectSlug}`}
            method="post"
          >
            <label>
              Название
              <input name="name" defaultValue={item.name} required disabled={archived} />
            </label>
            <label>
              Адрес проекта
              <input
                name="slug"
                defaultValue={item.slug}
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                disabled={archived}
              />
            </label>
            <label>
              Компания
              <select
                name="clientCompanyId"
                defaultValue={item.clientCompanyId}
                disabled={archived}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="projectType" defaultValue={item.projectType} disabled={archived}>
                {Object.entries(projectTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ответственный
              <select name="ownerUserId" defaultValue={item.ownerUserId} disabled={archived}>
                {workspaceMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Плановое начало
              <input
                name="plannedStartDate"
                type="date"
                defaultValue={item.plannedStartDate}
                disabled={archived}
              />
            </label>
            <label>
              Плановое завершение
              <input
                name="plannedEndDate"
                type="date"
                defaultValue={item.plannedEndDate}
                disabled={archived}
              />
            </label>
            <label className="full-field">
              Описание
              <textarea
                name="description"
                rows={5}
                defaultValue={item.description ?? ''}
                disabled={archived}
              />
            </label>
            {!archived && canAccessProject(access, 'project.edit') ? (
              <SubmitButton pendingText="Сохраняем проект…">Сохранить проект</SubmitButton>
            ) : null}
          </form>
        </div>
      </details>
      <details className="panel disclosure-panel">
        <summary>
          <span className="disclosure-title">
            <small>ДОСТУП · {members.length}</small>
            <span id="project-members-title">Участники проекта</span>
          </span>
        </summary>
        <div className="disclosure-body">
          <ul className="compact-list">
            {members.map((member) => (
              <li key={member.id}>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </span>
                <span>
                  {member.side === 'internal'
                    ? 'Команда'
                    : member.role === 'observer'
                      ? 'Наблюдатель'
                      : 'Клиент'}
                  {!archived &&
                  member.role !== 'owner' &&
                  canAccessProject(access, 'project.members.manage') ? (
                    <form
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/members/${member.id}/remove`}
                      method="post"
                    >
                      <label className="confirm-control">
                        <input name="confirm" type="checkbox" value="yes" required />
                        Подтверждаю отзыв доступа
                      </label>
                      <SubmitButton className="danger" pendingText="Отзываем доступ…">
                        Удалить из проекта
                      </SubmitButton>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {!archived &&
          candidates.length > 0 &&
          canAccessProject(access, 'project.members.manage') ? (
            <form
              className="inline-form member-form"
              action={`/api/workspaces/${slug}/projects/${projectSlug}/members`}
              method="post"
            >
              <label>
                Участник команды
                <select name="userId" required>
                  {candidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="confirm-control">
                <input name="canEdit" type="checkbox" value="yes" />
                Может редактировать и публиковать
              </label>
              <label className="confirm-control">
                <input name="canManageMembers" type="checkbox" value="yes" />
                Может управлять доступом
              </label>
              <SubmitButton pendingText="Добавляем участника…">Добавить в проект</SubmitButton>
            </form>
          ) : null}
        </div>
      </details>
      {!archived &&
      item.status !== 'draft' &&
      canAccessProject(access, 'project.members.manage') ? (
        <details className="panel disclosure-panel">
          <summary>
            <span className="disclosure-title">
              <small>КЛИЕНТСКИЙ ДОСТУП</small>
              <span id="client-invite-title">Пригласить представителя клиента</span>
            </span>
          </summary>
          <div className="disclosure-body">
            <form
              className="form-grid"
              action={`/api/workspaces/${slug}/projects/${projectSlug}/invitations`}
              method="post"
            >
              <label>
                Email клиента
                <input name="email" type="email" required />
              </label>
              <label>
                Роль в компании
                <select name="companyRole" defaultValue="member">
                  <option value="primary">Главный представитель</option>
                  <option value="member">Участник</option>
                </select>
              </label>
              <label>
                Доступ к проекту
                <select name="projectRole" defaultValue="client">
                  <option value="client">Участник клиента</option>
                  <option value="observer">Только просмотр</option>
                </select>
              </label>
              <label className="confirm-control">
                <input name="canApprove" type="checkbox" value="yes" />
                Может согласовывать границы проекта
              </label>
              <SubmitButton pendingText="Готовим приглашение…">Отправить приглашение</SubmitButton>
            </form>
            {invitations.length === 0 ? (
              <p className="empty">Приглашений по этому проекту пока нет.</p>
            ) : (
              <ul className="compact-list">
                {invitations.map((invite) => (
                  <li key={invite.id}>
                    <span>
                      {invite.email}
                      <small>Действует до {invite.expiresAt.toLocaleString('ru-RU')}</small>
                    </span>
                    <span>
                      {invite.status} · {invite.role === 'observer' ? 'просмотр' : 'клиент'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ) : null}
      <details className="panel danger-zone disclosure-panel">
        <summary>
          <span className="disclosure-title">
            <small>СТАТУС ПРОЕКТА</small>
            <span id="project-archive-title">
              {archived ? 'Восстановить проект' : 'Архивировать проект'}
            </span>
          </span>
        </summary>
        <div className="disclosure-body">
          {archived ? (
            isOwner(tenant) ? (
              <form
                action={`/api/workspaces/${slug}/projects/${projectSlug}/restore`}
                method="post"
              >
                <SubmitButton className="secondary" pendingText="Восстанавливаем…">
                  Восстановить прежний статус
                </SubmitButton>
              </form>
            ) : (
              <p className="empty">Только владелец может восстановить проект.</p>
            )
          ) : canAccessProject(access, 'project.archive') ? (
            <form action={`/api/workspaces/${slug}/projects/${projectSlug}/archive`} method="post">
              <label className="confirm-control">
                <input name="confirm" type="checkbox" value="yes" required />
                Подтверждаю перевод в read-only архив
              </label>
              <SubmitButton className="danger" pendingText="Архивируем…">
                Архивировать проект
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </details>
    </main>
  );
}
