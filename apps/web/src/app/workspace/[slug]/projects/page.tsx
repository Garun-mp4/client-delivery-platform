import Link from 'next/link';

import { isOwner } from '@garun/core/identity';
import {
  listActiveClientCompanies,
  listInternalWorkspaceMembers,
  listProjects,
} from '@garun/core/projects';
import { listWorkspaceWorkflowOverview } from '@garun/core/workflow';

import { projectStatusLabels, projectTypeLabels } from './project-copy';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ slug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const owner = isOwner(tenant);
  const [projects, companies, members, overview] = await Promise.all([
    listProjects(database.db, tenant),
    listActiveClientCompanies(database.db, tenant),
    listInternalWorkspaceMembers(database.db, tenant),
    listWorkspaceWorkflowOverview(database.db, tenant),
  ]);
  const overviewByProject = new Map(overview.map((item) => [item.projectId, item]));
  const internal = owner || projects.some((item) => item.side === 'internal');
  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Проекты</p>
          <h1>{internal ? 'Работа с клиентами' : 'Ваши проекты'}</h1>
          <p className="muted">
            {internal
              ? 'Черновики видны только команде. Клиент получает доступ после публикации и приглашения.'
              : 'Здесь находятся только проекты, к которым вам выдан отдельный доступ.'}
          </p>
        </div>
      </header>
      {feedback.error ? (
        <p className="notice error" role="alert">
          Проект создать не удалось. Проверьте обязательные поля, даты и уникальность адреса.
        </p>
      ) : null}
      <section className="overview-section" aria-labelledby="projects-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Доступные проекты</p>
            <h2 id="projects-list-title">Список проектов</h2>
          </div>
          <span className="count">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <p className="empty">
            {internal
              ? 'Проектов пока нет. Сначала создайте клиента, затем новый проект.'
              : 'Вам пока не открыт ни один проект. Обратитесь к владельцу рабочего пространства.'}
          </p>
        ) : (
          <ul className="project-grid">
            {projects.map((item) => (
              <li key={item.id}>
                <Link href={`/workspace/${slug}/projects/${item.slug}`}>
                  <strong>{item.name}</strong>
                  <span>{projectStatusLabels[item.status]}</span>
                  <small>
                    {item.companyName} · до{' '}
                    {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(
                      new Date(`${item.plannedEndDate}T00:00:00Z`),
                    )}
                  </small>
                  {internal ? (
                    <small>
                      Прогресс {overviewByProject.get(item.id)?.progressPercent ?? 0}%
                      {overviewByProject.get(item.id)?.blockingAction
                        ? ` · ожидает клиента: ${overviewByProject.get(item.id)!.blockingAction!.title}`
                        : ''}
                    </small>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {owner ? (
        <section className="panel form-section" aria-labelledby="create-project-title">
          <p className="eyebrow">Новый проект</p>
          <h2 id="create-project-title">Создать черновик</h2>
          {companies.length === 0 ? (
            <p className="empty">
              Сначала <Link href={`/workspace/${slug}/clients`}>создайте карточку клиента</Link>.
            </p>
          ) : (
            <form className="form-grid" action={`/api/workspaces/${slug}/projects`} method="post">
              <label>
                Название проекта
                <input name="name" required maxLength={180} />
              </label>
              <label>
                Адрес проекта
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="new-website"
                  maxLength={80}
                />
                <small>Латинские буквы, цифры и дефисы.</small>
              </label>
              <label>
                Компания клиента
                <select name="clientCompanyId" required defaultValue="">
                  <option value="" disabled>
                    Выберите компанию
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Тип проекта
                <select name="projectType" required defaultValue="website">
                  {Object.entries(projectTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ответственный
                <select name="ownerUserId" required defaultValue={tenant.userId}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Плановое начало
                <input name="plannedStartDate" type="date" required />
              </label>
              <label>
                Плановое завершение
                <input name="plannedEndDate" type="date" required />
              </label>
              <label className="full-field">
                Описание
                <textarea name="description" rows={5} maxLength={5_000} />
              </label>
              <button type="submit">Создать черновик</button>
            </form>
          )}
        </section>
      ) : null}
    </main>
  );
}
