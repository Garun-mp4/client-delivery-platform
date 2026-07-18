import Link from 'next/link';

import { isOwner } from '@garun/core/identity';
import { listActiveClientCompanies, listProjects } from '@garun/core/projects';
import { getProjectWorkflow, listWorkspaceWorkflowOverview } from '@garun/core/workflow';

import { projectStatusLabels } from './projects/project-copy';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export default async function WorkspaceOverviewPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { identity, tenant } = await requireTenantPage(slug);
  const owner = isOwner(tenant);
  const projects = await listProjects(database.db, tenant);

  if (owner) {
    const [companies, overview] = await Promise.all([
      listActiveClientCompanies(database.db, tenant),
      listWorkspaceWorkflowOverview(database.db, tenant),
    ]);
    const routeByProject = new Map(overview.map((item) => [item.projectId, item]));
    const waiting = projects.filter((item) => routeByProject.get(item.id)?.blockingAction);
    const active = projects.filter((item) => item.status !== 'archived');
    const firstAction =
      companies.length === 0
        ? {
            title: 'Добавьте первого клиента',
            body: 'Карточка клиента нужна, чтобы создать проект и сохранить контакты в одном месте.',
            href: `/workspace/${slug}/clients`,
            label: 'Добавить клиента',
          }
        : projects.length === 0
          ? {
              title: 'Создайте первый проект',
              body: 'Клиент уже добавлен. Теперь задайте сроки и подготовьте проект до публикации.',
              href: `/workspace/${slug}/projects`,
              label: 'Создать проект',
            }
          : waiting.length > 0
            ? {
                title: `${waiting.length} ${waiting.length === 1 ? 'проект ожидает' : 'проекта ожидают'} клиента`,
                body: 'Откройте проект, чтобы проверить блокирующее действие и при необходимости напомнить клиенту.',
                href: `/workspace/${slug}/projects/${waiting[0]!.slug}/workflow`,
                label: 'Проверить ожидание',
              }
            : {
                title: 'Работа движется по плану',
                body: 'Нет блокирующих клиентских действий. Откройте проекты, чтобы проверить ближайшие этапы.',
                href: `/workspace/${slug}/projects`,
                label: 'Открыть проекты',
              };

    return (
      <main className="workspace-shell">
        <header className="page-header overview-header">
          <div>
            <p className="eyebrow">Рабочий центр</p>
            <h1>Добрый день, {identity.user.name.split(' ')[0]}</h1>
            <p className="lede">Здесь только то, что помогает двигать клиентские проекты дальше.</p>
          </div>
          <Link className="button-secondary" href={`/workspace/${slug}/projects`}>
            Все проекты
          </Link>
        </header>

        <section className="attention-panel" aria-labelledby="attention-title">
          <div>
            <p className="section-label">Следующий шаг</p>
            <h2 id="attention-title">{firstAction.title}</h2>
            <p>{firstAction.body}</p>
          </div>
          <Link className="button-primary" href={firstAction.href}>
            {firstAction.label}
          </Link>
        </section>

        <dl className="overview-facts" aria-label="Состояние рабочего пространства">
          <div>
            <dt>Активные проекты</dt>
            <dd>{active.length}</dd>
          </div>
          <div>
            <dt>Ожидают клиента</dt>
            <dd>{waiting.length}</dd>
          </div>
          <div>
            <dt>Клиенты</dt>
            <dd>{companies.length}</dd>
          </div>
        </dl>

        <section className="overview-section" aria-labelledby="recent-projects-title">
          <div className="section-heading">
            <div>
              <p className="section-label">Маршруты</p>
              <h2 id="recent-projects-title">Проекты в работе</h2>
            </div>
            <Link className="text-link compact-link" href={`/workspace/${slug}/projects`}>
              Смотреть все
            </Link>
          </div>
          {active.length === 0 ? (
            <div className="empty-state">
              <h3>Активных проектов пока нет</h3>
              <p>Создайте первый проект — здесь появятся прогресс и ожидающая сторона.</p>
            </div>
          ) : (
            <ul className="route-list">
              {active.slice(0, 5).map((item) => {
                const route = routeByProject.get(item.id);
                return (
                  <li key={item.id}>
                    <Link href={`/workspace/${slug}/projects/${item.slug}`}>
                      <span className="route-list-main">
                        <strong>{item.name}</strong>
                        <small>
                          {item.companyName} · до {formatDate(item.plannedEndDate)}
                        </small>
                      </span>
                      <span className="route-list-state">
                        <span>{route?.progressPercent ?? 0}%</span>
                        <small>
                          {route?.blockingAction
                            ? `Ожидает клиента: ${route.blockingAction.title}`
                            : projectStatusLabels[item.status]}
                        </small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    );
  }

  const workflows = await Promise.all(
    projects.slice(0, 12).map((item) => getProjectWorkflow(database.db, tenant, item.slug)),
  );
  const projectRoutes = projects.map((item, index) => ({ item, workflow: workflows[index] }));
  const withAction = projectRoutes.find(({ workflow }) => workflow?.nextAction);
  const primary = withAction ?? projectRoutes[0];

  return (
    <main className="workspace-shell client-overview">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ваше рабочее пространство</p>
          <h1>Здравствуйте, {identity.user.name.split(' ')[0]}</h1>
          <p className="lede">Здесь собраны только проекты и действия, доступные вам.</p>
        </div>
      </header>
      {primary ? (
        <section className="attention-panel client-attention" aria-labelledby="client-action-title">
          <div>
            <p className="section-label">
              {primary.workflow?.nextAction ? 'От вас требуется действие' : 'Сейчас'}
            </p>
            <h2 id="client-action-title">
              {primary.workflow?.nextAction?.title ?? 'От вас пока ничего не требуется'}
            </h2>
            <p>
              {primary.workflow?.nextAction?.description ??
                'Разработчик продолжает работу. Новое действие появится здесь, когда понадобится ваше участие.'}
            </p>
          </div>
          <Link
            className="button-primary"
            href={`/workspace/${slug}/projects/${primary.item.slug}${
              primary.workflow?.nextAction ? '/workflow' : ''
            }`}
          >
            {primary.workflow?.nextAction ? 'Перейти к действию' : 'Открыть проект'}
          </Link>
        </section>
      ) : (
        <div className="empty-state">
          <h2>Проекты пока не назначены</h2>
          <p>Владелец рабочего пространства сообщит, когда откроет вам доступ.</p>
        </div>
      )}
      {projectRoutes.length > 0 ? (
        <section className="overview-section" aria-labelledby="client-projects-title">
          <div className="section-heading">
            <div>
              <p className="section-label">Доступные вам</p>
              <h2 id="client-projects-title">Проекты</h2>
            </div>
          </div>
          <ul className="route-list">
            {projectRoutes.map(({ item, workflow }) => (
              <li key={item.id}>
                <Link href={`/workspace/${slug}/projects/${item.slug}`}>
                  <span className="route-list-main">
                    <strong>{item.name}</strong>
                    <small>{item.companyName}</small>
                  </span>
                  <span className="route-list-state">
                    <span>{workflow?.progressPercent ?? 0}%</span>
                    <small>
                      {workflow?.nextAction
                        ? 'Нужно ваше действие'
                        : projectStatusLabels[item.status]}
                    </small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
