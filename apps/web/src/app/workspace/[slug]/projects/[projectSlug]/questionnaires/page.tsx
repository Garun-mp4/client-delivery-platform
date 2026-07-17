import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listQuestionnaireAssignees, listQuestionnaires } from '@garun/core/questionnaires';
import { canAccessProject } from '@garun/core/projects';

import { QuestionnaireBuilder } from './questionnaire-builder';
import { WorkspaceNav } from '../../../_components/workspace-nav';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const statusLabels = {
  open: 'Ждёт ответов',
  submitted: 'На проверке',
  completed: 'Принята',
  cancelled: 'Отменена',
} as const;

export default async function QuestionnairesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const result = await listQuestionnaires(database.db, tenant, projectSlug);
  if (!result) notFound();
  const internal = canAccessProject(result.access, 'project.view.internal');
  const canManage = canAccessProject(result.access, 'project.edit');
  const assignees = canManage
    ? await listQuestionnaireAssignees(database.db, tenant, projectSlug)
    : [];

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Сбор информации</p>
          <h1>Анкеты проекта</h1>
          <p className="lede">
            Ответы сохраняются частями, а каждая отправка остаётся отдельной редакцией.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects/${projectSlug}`}>
          К проекту
        </Link>
      </header>
      <WorkspaceNav slug={slug} internal={internal} />
      {feedback.error ? (
        <p className="notice error" role="alert">
          Анкету создать не удалось. Проверьте вопросы, варианты и назначенного участника.
        </p>
      ) : null}
      <section className="panel" aria-labelledby="questionnaires-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Текущие анкеты</p>
            <h2 id="questionnaires-title">
              {internal ? 'Сбор информации от клиента' : 'Что нужно заполнить'}
            </h2>
          </div>
          <span className="count">{result.rows.length}</span>
        </div>
        {result.rows.length === 0 ? (
          <p className="empty">
            {internal
              ? 'Анкет пока нет. Создайте первую после добавления клиента в проект.'
              : 'Для вас пока нет анкет.'}
          </p>
        ) : (
          <ul className="project-grid questionnaire-grid">
            {result.rows.map((item) => (
              <li key={item.id}>
                <Link href={`/workspace/${slug}/projects/${projectSlug}/questionnaires/${item.id}`}>
                  <strong>{item.title}</strong>
                  <small>{internal ? `Заполняет: ${item.assigneeName}` : item.description}</small>
                  <span>{statusLabels[item.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canManage ? (
        <section className="panel" aria-labelledby="questionnaire-create-title">
          <p className="eyebrow">Новая анкета</p>
          <h2 id="questionnaire-create-title">Собрать вопросы</h2>
          {assignees.length === 0 ? (
            <p className="notice">
              Сначала добавьте в опубликованный проект участника клиента с правом отвечать.
            </p>
          ) : (
            <QuestionnaireBuilder
              action={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires`}
              assignees={assignees}
            />
          )}
        </section>
      ) : null}
    </main>
  );
}
