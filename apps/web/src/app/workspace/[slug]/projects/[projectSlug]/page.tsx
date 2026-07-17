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

import { WorkspaceNav } from '../../_components/workspace-nav';
import { projectStatusLabels, projectTypeLabels } from '../project-copy';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

function ClientProjectView({
  slug,
  workspaceSlug,
  project: item,
  preview,
}: {
  slug: string;
  workspaceSlug: string;
  project: NonNullable<Awaited<ReturnType<typeof getClientProject>>>;
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
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Проект · {item.company.name}</p>
          <h1>{item.name}</h1>
          <p className="lede">{item.description ?? 'Описание проекта пока не добавлено.'}</p>
        </div>
        <span className="status-pill">{projectStatusLabels[item.status]}</span>
      </header>
      <WorkspaceNav slug={workspaceSlug} internal={false} />
      {item.status === 'archived' ? (
        <p className="notice" role="status">
          Проект находится в архиве и доступен только для чтения.
        </p>
      ) : null}
      <section className="client-summary" aria-labelledby="project-summary-title">
        <div>
          <p className="eyebrow">Сейчас</p>
          <h2 id="project-summary-title">От вас пока ничего не требуется</h2>
          <p>Проект опубликован. Когда появится следующее действие, оно будет показано здесь.</p>
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
    const clientProject = await getClientProject(database.db, tenant, projectSlug, preview);
    if (!clientProject) notFound();
    return (
      <ClientProjectView
        slug={projectSlug}
        workspaceSlug={slug}
        project={clientProject}
        preview={preview}
      />
    );
  }
  const [item, companies, workspaceMembers, members, invitations] = await Promise.all([
    getInternalProject(database.db, tenant, projectSlug),
    listActiveClientCompanies(database.db, tenant),
    listInternalWorkspaceMembers(database.db, tenant),
    listProjectMembers(database.db, tenant, projectSlug),
    listProjectInvitations(database.db, tenant, projectSlug),
  ]);
  if (!item) notFound();
  const archived = item.status === 'archived';
  const memberUserIds = new Set(members.map((member) => member.userId));
  const candidates = workspaceMembers.filter((member) => !memberUserIds.has(member.id));
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
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
      <WorkspaceNav slug={slug} internal={isOwner(tenant)} />
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
      <div className="project-toolbar">
        <Link
          className="provider-link"
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
            <button type="submit">Опубликовать проект</button>
          </form>
        ) : null}
      </div>
      <section className="panel" aria-labelledby="project-data-title">
        <p className="eyebrow">Параметры</p>
        <h2 id="project-data-title">Карточка проекта</h2>
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
            <select name="clientCompanyId" defaultValue={item.clientCompanyId} disabled={archived}>
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
            <button type="submit">Сохранить проект</button>
          ) : null}
        </form>
      </section>
      <section className="panel" aria-labelledby="project-members-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Доступ</p>
            <h2 id="project-members-title">Участники проекта</h2>
          </div>
          <span className="count">{members.length}</span>
        </div>
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
                    <button className="danger" type="submit">
                      Удалить из проекта
                    </button>
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
            <button type="submit">Добавить в проект</button>
          </form>
        ) : null}
      </section>
      {!archived &&
      item.status !== 'draft' &&
      canAccessProject(access, 'project.members.manage') ? (
        <section className="panel" aria-labelledby="client-invite-title">
          <p className="eyebrow">Клиентский доступ</p>
          <h2 id="client-invite-title">Пригласить представителя клиента</h2>
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
            <button type="submit">Отправить приглашение</button>
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
        </section>
      ) : null}
      <section className="panel danger-zone" aria-labelledby="project-archive-title">
        <p className="eyebrow">Статус проекта</p>
        <h2 id="project-archive-title">
          {archived ? 'Восстановить проект' : 'Архивировать проект'}
        </h2>
        {archived ? (
          isOwner(tenant) ? (
            <form action={`/api/workspaces/${slug}/projects/${projectSlug}/restore`} method="post">
              <button className="secondary" type="submit">
                Восстановить прежний статус
              </button>
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
            <button className="danger" type="submit">
              Архивировать проект
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
