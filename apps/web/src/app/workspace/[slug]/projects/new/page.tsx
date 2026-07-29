import Link from 'next/link';
import { notFound } from 'next/navigation';

import { can } from '@garun/core/identity';
import { listActiveClientCompanies, listInternalWorkspaceMembers } from '@garun/core/projects';

import { projectTypeLabels } from '../project-copy';
import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

export default async function NewProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantPage(slug);
  if (!can(tenant, 'projects.create')) notFound();
  const [companies, members] = await Promise.all([
    listActiveClientCompanies(database.db, tenant),
    listInternalWorkspaceMembers(database.db, tenant),
  ]);
  return (
    <main className="workspace-shell project-create-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Новый проект</p>
          <h1>Создать черновик</h1>
          <p className="lede">
            Сначала задайте основу. Этапы, участники и обложка настраиваются после создания.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects`}>
          Вернуться к проектам
        </Link>
      </header>
      {companies.length === 0 ? (
        <section className="empty-state">
          <h2>Сначала добавьте клиента</h2>
          <p>Каждый проект должен принадлежать конкретной компании.</p>
          <Link className="button-primary" href={`/workspace/${slug}/clients`}>
            Перейти к клиентам
          </Link>
        </section>
      ) : (
        <section className="panel form-section" aria-labelledby="project-details-title">
          <div className="form-section-intro">
            <p className="section-label">Основа проекта</p>
            <h2 id="project-details-title">Название, клиент и срок</h2>
          </div>
          <form className="form-grid" action={`/api/workspaces/${slug}/projects`} method="post">
            <label>
              Название проекта
              <input name="name" required maxLength={180} autoFocus />
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
            <div className="form-actions">
              <SubmitButton pendingText="Создаём проект…">Создать черновик</SubmitButton>
              <Link className="button-secondary" href={`/workspace/${slug}/projects`}>
                Отмена
              </Link>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
