import Link from 'next/link';
import { notFound } from 'next/navigation';

import { can } from '@garun/core/identity';
import { getInternalClientCompany, listProjects } from '@garun/core/projects';

import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, id }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  if (!can(tenant, 'clients.manage')) notFound();
  const [company, allProjects] = await Promise.all([
    getInternalClientCompany(database.db, tenant, id),
    listProjects(database.db, tenant),
  ]);
  if (!company) notFound();
  const relatedProjects = allProjects.filter((item) => item.clientCompanyId === company.id);
  const archived = company.status === 'archived';
  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Карточка клиента</p>
          <h1>{company.name}</h1>
          <p className="muted">{archived ? 'Архив — изменения отключены' : 'Активный клиент'}</p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/clients`}>
          Ко всем клиентам
        </Link>
      </header>
      {feedback.success ? (
        <p className="notice success" role="status">
          Изменение сохранено.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Изменение сохранить не удалось.
        </p>
      ) : null}
      <section className="panel" aria-labelledby="client-data-title">
        <p className="eyebrow">Данные</p>
        <h2 id="client-data-title">Контакты и заметки</h2>
        <form className="form-grid" action={`/api/workspaces/${slug}/clients/${id}`} method="post">
          <label>
            Название компании
            <input name="name" defaultValue={company.name} required disabled={archived} />
          </label>
          <label>
            Юридическое название
            <input name="legalName" defaultValue={company.legalName ?? ''} disabled={archived} />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              defaultValue={company.email ?? ''}
              disabled={archived}
            />
          </label>
          <label>
            Телефон
            <input name="phone" defaultValue={company.phone ?? ''} disabled={archived} />
          </label>
          <label>
            Сайт
            <input
              name="website"
              type="url"
              defaultValue={company.website ?? ''}
              disabled={archived}
            />
          </label>
          <label>
            Мессенджер
            <input name="messenger" defaultValue={company.messenger ?? ''} disabled={archived} />
          </label>
          <label className="full-field">
            Внутренние заметки
            <textarea
              name="internalNotes"
              rows={6}
              defaultValue={company.internalNotes ?? ''}
              disabled={archived}
            />
          </label>
          {!archived ? <button type="submit">Сохранить карточку</button> : null}
        </form>
      </section>
      <section className="panel" aria-labelledby="client-projects-title">
        <p className="eyebrow">Проекты</p>
        <h2 id="client-projects-title">Проекты компании</h2>
        {relatedProjects.length === 0 ? (
          <p className="empty">Проектов пока нет.</p>
        ) : (
          <ul className="compact-list">
            {relatedProjects.map((item) => (
              <li key={item.id}>
                <Link href={`/workspace/${slug}/projects/${item.slug}`}>{item.name}</Link>
                <span>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel danger-zone" aria-labelledby="client-archive-title">
        <p className="eyebrow">Статус карточки</p>
        <h2 id="client-archive-title">
          {archived ? 'Восстановить клиента' : 'Архивировать клиента'}
        </h2>
        {archived ? (
          <form action={`/api/workspaces/${slug}/clients/${id}/restore`} method="post">
            <button className="secondary" type="submit">
              Восстановить
            </button>
          </form>
        ) : (
          <form action={`/api/workspaces/${slug}/clients/${id}/archive`} method="post">
            <label className="confirm-control">
              <input name="confirm" type="checkbox" value="yes" required />
              Подтверждаю архивирование карточки
            </label>
            <button className="danger" type="submit">
              Архивировать
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
