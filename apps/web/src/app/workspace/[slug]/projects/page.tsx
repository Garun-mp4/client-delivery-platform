import Image from 'next/image';
import Link from 'next/link';

import { isOwner } from '@garun/core/identity';
import { listProjectCoverKinds, listProjects } from '@garun/core/projects';
import { listProjectCatalogWorkflow } from '@garun/core/workflow';

import { ProjectCoverActions } from './project-cover-actions';
import { projectStatusLabels } from './project-copy';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

type CatalogFilter = 'current' | 'attention' | 'completed' | 'archived' | 'all';
type CatalogSort = 'priority' | 'deadline' | 'activity' | 'name';
type CatalogView = 'cards' | 'compact';

const PAGE_SIZE = 24;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(
  slug: string,
  input: Record<string, string | number | undefined>,
  current: Record<string, string>,
) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, String(value));
  }
  return `/workspace/${slug}/projects${params.size > 0 ? `?${params}` : ''}`;
}

function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const owner = isOwner(tenant);
  const q = (one(raw.q) ?? '').trim().slice(0, 120);
  const filter = (
    ['current', 'attention', 'completed', 'archived', 'all'].includes(one(raw.filter) ?? '')
      ? one(raw.filter)
      : 'current'
  ) as CatalogFilter;
  const sort = (
    ['priority', 'deadline', 'activity', 'name'].includes(one(raw.sort) ?? '')
      ? one(raw.sort)
      : 'priority'
  ) as CatalogSort;
  const view = (one(raw.view) === 'compact' ? 'compact' : 'cards') as CatalogView;
  const requestedPage = Math.max(1, Number.parseInt(one(raw.page) ?? '1', 10) || 1);
  const projects = await listProjects(database.db, tenant);
  const workflow = await listProjectCatalogWorkflow(
    database.db,
    tenant,
    projects.map((item) => ({ id: item.id, side: item.side })),
  );
  const workflowByProject = new Map(workflow.map((item) => [item.projectId, item]));
  const now = new Date();
  const catalog = projects.map((item) => {
    const route = workflowByProject.get(item.id);
    const overdue =
      !['completed', 'archived'].includes(item.status) &&
      new Date(`${item.plannedEndDate}T23:59:59Z`) < now;
    const attention = Boolean(route?.blockingAction || overdue || (!owner && route?.nextAction));
    const permissions = item.permissions as { version?: unknown; grants?: unknown } | null;
    const grants =
      permissions?.version === 1 && Array.isArray(permissions.grants)
        ? permissions.grants.filter((value): value is string => typeof value === 'string')
        : [];
    return {
      ...item,
      route,
      overdue,
      attention,
      canEdit: owner || item.role === 'owner' || grants.includes('project.edit'),
      lastActivityAt: route?.lastActivityAt ?? item.updatedAt,
    };
  });
  const normalizedQuery = q.toLocaleLowerCase('ru-RU');
  const filtered = catalog.filter((item) => {
    if (
      normalizedQuery &&
      !`${item.name} ${item.companyName}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery)
    ) {
      return false;
    }
    if (filter === 'current') return !['completed', 'archived'].includes(item.status);
    if (filter === 'attention') return item.attention;
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'archived') return item.status === 'archived';
    return true;
  });
  filtered.sort((left, right) => {
    if (sort === 'name') return left.name.localeCompare(right.name, 'ru');
    if (sort === 'deadline') return left.plannedEndDate.localeCompare(right.plannedEndDate);
    if (sort === 'activity') return right.lastActivityAt.getTime() - left.lastActivityAt.getTime();
    return (
      Number(right.attention) - Number(left.attention) ||
      left.plannedEndDate.localeCompare(right.plannedEndDate) ||
      right.lastActivityAt.getTime() - left.lastActivityAt.getTime()
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const coverKinds = await listProjectCoverKinds(
    database,
    tenant,
    visible.map((item) => item.id),
  );
  const coverByProject = new Map<string, 'manual' | 'automatic'>();
  for (const cover of coverKinds) {
    const current = coverByProject.get(cover.projectId);
    if (!current || cover.kind === 'manual') coverByProject.set(cover.projectId, cover.kind);
  }
  const currentQuery: Record<string, string> = {};
  for (const key of ['q', 'filter', 'sort', 'view']) {
    const value = one(raw[key]);
    if (value) currentQuery[key] = value;
  }

  return (
    <main className="workspace-shell project-catalog">
      <header className="page-header catalog-header">
        <div>
          <p className="eyebrow">Рабочий стол проектов</p>
          <h1>Проекты</h1>
          <p className="lede">
            Сроки, ответственность и следующий шаг каждого клиентского проекта.
          </p>
        </div>
        {owner ? (
          <Link className="button-primary" href={`/workspace/${slug}/projects/new`}>
            Создать проект
          </Link>
        ) : null}
      </header>

      {one(raw.error) ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте данные и попробуйте снова.
        </p>
      ) : null}

      <form className="catalog-toolbar" method="get" role="search">
        <label className="catalog-search">
          <span>Найти проект или клиента</span>
          <input name="q" defaultValue={q} placeholder="Например, сайт Альфа" />
        </label>
        <label>
          <span>Показать</span>
          <select name="filter" defaultValue={filter}>
            <option value="current">Текущие</option>
            <option value="attention">Требуют внимания</option>
            <option value="completed">Завершённые</option>
            <option value="archived">Архивные</option>
            <option value="all">Все</option>
          </select>
        </label>
        <label>
          <span>Сначала</span>
          <select name="sort" defaultValue={sort}>
            <option value="priority">Важные</option>
            <option value="deadline">Ближайший срок</option>
            <option value="activity">Недавно обновлённые</option>
            <option value="name">По названию</option>
          </select>
        </label>
        <input type="hidden" name="view" value={view} />
        <button type="submit">Применить</button>
      </form>

      <div className="catalog-heading">
        <div>
          <p className="section-label">Доступные вам</p>
          <h2>{filter === 'attention' ? 'Требуют внимания' : 'Каталог проектов'}</h2>
        </div>
        <div className="catalog-view-switch" aria-label="Вид каталога">
          <Link
            aria-current={view === 'cards' ? 'page' : undefined}
            href={pageHref(slug, { view: 'cards', page: 1 }, currentQuery)}
          >
            Карточки
          </Link>
          <Link
            aria-current={view === 'compact' ? 'page' : undefined}
            href={pageHref(slug, { view: 'compact', page: 1 }, currentQuery)}
          >
            Компактно
          </Link>
        </div>
        <span className="count" aria-label={`Найдено проектов: ${filtered.length}`}>
          {filtered.length}
        </span>
      </div>

      {projects.length === 0 ? (
        <section className="empty-state">
          <p className="section-label">Пока пусто</p>
          <h2>{owner ? 'Создайте первый клиентский проект' : 'Проекты пока не назначены'}</h2>
          <p>
            {owner
              ? 'После создания здесь появятся маршрут, срок и следующее действие.'
              : 'Владелец рабочего пространства сообщит, когда откроет вам доступ.'}
          </p>
          {owner ? (
            <Link className="button-primary" href={`/workspace/${slug}/projects/new`}>
              Создать проект
            </Link>
          ) : null}
        </section>
      ) : visible.length === 0 ? (
        <section className="empty-state">
          <p className="section-label">Ничего не найдено</p>
          <h2>Измените запрос или фильтр</h2>
          <Link className="button-secondary" href={`/workspace/${slug}/projects`}>
            Сбросить фильтры
          </Link>
        </section>
      ) : (
        <ul className={view === 'cards' ? 'project-catalog-grid' : 'project-catalog-compact'}>
          {visible.map((item) => {
            const route = item.route;
            const cover = coverByProject.get(item.id);
            const responsibility = route?.nextAction
              ? route.nextAction.assigneeUserId === tenant.userId
                ? 'Вы'
                : route.blockingAction
                  ? 'Клиент'
                  : 'Команда проекта'
              : 'Команда проекта';
            return (
              <li
                className={item.attention ? 'catalog-project attention' : 'catalog-project'}
                key={item.id}
              >
                <Link
                  className="catalog-project-main"
                  href={`/workspace/${slug}/projects/${item.slug}`}
                >
                  <div className="project-cover">
                    {cover ? (
                      <Image
                        alt={`Обложка проекта «${item.name}»`}
                        fill
                        sizes={view === 'cards' ? '(max-width: 760px) 100vw, 50vw' : '176px'}
                        src={`/api/workspaces/${slug}/projects/${item.slug}/cover`}
                        unoptimized
                      />
                    ) : (
                      <span>Обложка пока не добавлена</span>
                    )}
                  </div>
                  <div className="catalog-project-body">
                    <div className="catalog-project-kicker">
                      <span>{item.companyName}</span>
                      <span>{projectStatusLabels[item.status]}</span>
                    </div>
                    <h3>{item.name}</h3>
                    <div className="project-stage-line">
                      <span>{route?.currentStage?.name ?? 'Этапы ещё не настроены'}</span>
                      <strong>{route?.progressPercent ?? 0}%</strong>
                    </div>
                    <progress
                      aria-label={`Прогресс проекта ${route?.progressPercent ?? 0}%`}
                      max={100}
                      value={route?.progressPercent ?? 0}
                    />
                    <dl className="catalog-route">
                      <div>
                        <dt>Сейчас действует</dt>
                        <dd>{responsibility}</dd>
                      </div>
                      <div>
                        <dt>Следующий шаг</dt>
                        <dd>{route?.nextAction?.title ?? 'Определить ближайшее действие'}</dd>
                      </div>
                      <div>
                        <dt>После этого</dt>
                        <dd>
                          {route?.nextAction?.description ??
                            'Появится понятный результат следующего шага'}
                        </dd>
                      </div>
                    </dl>
                    <div className="catalog-project-meta">
                      <span className={item.overdue ? 'deadline overdue' : 'deadline'}>
                        {item.overdue ? 'Срок прошёл' : 'Срок'} · {formatDate(item.plannedEndDate)}
                      </span>
                      <span>Обновлено {formatDate(item.lastActivityAt)}</span>
                    </div>
                    {route?.blockingAction ? (
                      <p className="project-blocker">
                        Ожидает клиента: {route.blockingAction.title}
                      </p>
                    ) : null}
                  </div>
                </Link>
                {item.canEdit ? (
                  <ProjectCoverActions
                    projectHref={`/workspace/${slug}/projects/${item.slug}#project-cover`}
                    refreshUrl={`/api/workspaces/${slug}/projects/${item.slug}/cover/capture`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="catalog-pagination" aria-label="Страницы каталога">
          {currentPage > 1 ? (
            <Link href={pageHref(slug, { page: currentPage - 1 }, currentQuery)}>Назад</Link>
          ) : (
            <span aria-disabled="true">Назад</span>
          )}
          <span>
            Страница {currentPage} из {pageCount}
          </span>
          {currentPage < pageCount ? (
            <Link href={pageHref(slug, { page: currentPage + 1 }, currentQuery)}>Далее</Link>
          ) : (
            <span aria-disabled="true">Далее</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
