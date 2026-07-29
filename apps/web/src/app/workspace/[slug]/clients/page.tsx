import Link from 'next/link';
import { notFound } from 'next/navigation';

import { can } from '@garun/core/identity';
import { listClientCompanies } from '@garun/core/projects';

import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ slug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  if (!can(tenant, 'clients.manage')) notFound();
  const companies = await listClientCompanies(database.db, tenant);
  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Клиенты</p>
          <h1>Компании заказчиков</h1>
          <p className="muted">Внутренние заметки доступны только вашей команде.</p>
        </div>
      </header>
      {feedback.error ? (
        <p className="notice error" role="alert">
          Клиента создать не удалось. Проверьте обязательные поля и формат сайта или email.
        </p>
      ) : null}
      <section className="overview-section" aria-labelledby="clients-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Список</p>
            <h2 id="clients-list-title">Все клиенты</h2>
          </div>
          <span className="count">{companies.length}</span>
        </div>
        {companies.length === 0 ? (
          <p className="empty">Пока нет ни одной компании. Создайте первую карточку ниже.</p>
        ) : (
          <ul className="project-grid">
            {companies.map((company) => (
              <li key={company.id}>
                <Link href={`/workspace/${slug}/clients/${company.id}`}>
                  <strong>{company.name}</strong>
                  <span>{company.status === 'archived' ? 'Архив' : 'Активный клиент'}</span>
                  <small>{company.email ?? company.website ?? 'Контакты не указаны'}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="panel disclosure-panel form-section" open={companies.length === 0}>
        <summary>
          <span className="disclosure-title">
            <small>НОВЫЙ КЛИЕНТ</small>
            <span id="create-client-title">Создать компанию</span>
          </span>
        </summary>
        <div className="disclosure-body">
          <form className="form-grid" action={`/api/workspaces/${slug}/clients`} method="post">
            <label>
              Название компании
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Юридическое название
              <input name="legalName" maxLength={240} />
            </label>
            <label>
              Email
              <input name="email" type="email" maxLength={320} />
            </label>
            <label>
              Телефон
              <input name="phone" maxLength={80} />
            </label>
            <label>
              Сайт
              <input name="website" type="url" placeholder="https://example.ru" maxLength={500} />
            </label>
            <label>
              Мессенджер
              <input name="messenger" maxLength={160} />
            </label>
            <label className="full-field">
              Внутренние заметки
              <textarea name="internalNotes" rows={5} maxLength={10_000} />
            </label>
            <SubmitButton pendingText="Создаём клиента…">Создать клиента</SubmitButton>
          </form>
        </div>
      </details>
    </main>
  );
}
