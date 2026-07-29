import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getQuestionnaire,
  type QuestionnaireField,
  type QuestionnaireSchema,
} from '@garun/core/questionnaires';
import { canAccessProject } from '@garun/core/projects';

import { QuestionnaireForm } from '../questionnaire-form';
import { ProjectNav } from '../../_components/project-nav';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const statusLabels = {
  open: 'Ждёт ответов',
  submitted: 'На проверке',
  completed: 'Принята',
  cancelled: 'Отменена',
} as const;

function displayValue(value: unknown): string {
  if (value === true) return 'Да';
  if (value === false) return 'Нет';
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) return value.join(', ');
    return value
      .map((row, index) =>
        row && typeof row === 'object'
          ? `${index + 1}. ${Object.values(row).map(displayValue).join(' · ')}`
          : displayValue(row),
      )
      .join('\n');
  }
  return value === undefined || value === null || value === '' ? 'Нет ответа' : String(value);
}

function schemaFields(schema: QuestionnaireSchema) {
  return schema.sections.flatMap((section) => section.fields);
}

function SubmissionAnswers({
  fields,
  answers,
  comments,
  commentAction,
  canComment,
  fileBaseUrl,
}: {
  fields: readonly QuestionnaireField[];
  answers: Record<string, unknown>;
  comments: readonly {
    id: string;
    fieldId: string;
    body: string;
    authorName: string;
    createdAt: Date;
  }[];
  commentAction: string;
  canComment: boolean;
  fileBaseUrl: string;
}) {
  return (
    <div className="answer-list">
      {fields
        .filter((field) => field.type !== 'info' && answers[field.id] !== undefined)
        .map((field) => (
          <article className="answer-card" id={`answer-${field.id}`} key={field.id}>
            <h3>{field.label}</h3>
            {['file', 'image'].includes(field.type) && typeof answers[field.id] === 'string' ? (
              <p className="answer-value">
                <Link href={`${fileBaseUrl}/${answers[field.id]}`}>Скачать отправленный файл</Link>
              </p>
            ) : (
              <p className="answer-value">{displayValue(answers[field.id])}</p>
            )}
            {comments
              .filter((comment) => comment.fieldId === field.id)
              .map((comment) => (
                <blockquote key={comment.id}>
                  <p>{comment.body}</p>
                  <footer>
                    {comment.authorName} · {comment.createdAt.toLocaleString('ru-RU')}
                  </footer>
                </blockquote>
              ))}
            {canComment ? (
              <form className="answer-comment-form" action={commentAction} method="post">
                <input name="fieldId" type="hidden" value={field.id} />
                <label>
                  Комментарий к ответу
                  <textarea name="body" rows={2} required maxLength={5_000} />
                </label>
                <button className="secondary" type="submit">
                  Добавить комментарий
                </button>
              </form>
            ) : null}
          </article>
        ))}
    </div>
  );
}

export default async function QuestionnairePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string; questionnaireId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug, questionnaireId }, feedback] = await Promise.all([
    params,
    searchParams,
  ]);
  const { tenant } = await requireTenantPage(slug);
  const result = await getQuestionnaire(database.db, tenant, projectSlug, questionnaireId);
  if (!result) notFound();
  const internal = canAccessProject(result.access, 'project.view.internal');
  const canReview = canAccessProject(result.access, 'project.edit');
  const item = result.questionnaire;
  const latest = result.submissions[0];
  const fields = schemaFields(item.schemaSnapshot);

  return (
    <main className="workspace-shell questionnaire-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Анкета · {statusLabels[item.status]}</p>
          <h1>{item.title}</h1>
          <p className="lede">{item.description ?? 'Ответьте на вопросы в удобном темпе.'}</p>
        </div>
        <Link
          className="text-link"
          href={`/workspace/${slug}/projects/${projectSlug}/questionnaires`}
        >
          Ко всем анкетам
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
          Операцию выполнить не удалось. Обновите страницу и попробуйте ещё раз.
        </p>
      ) : null}
      {latest?.status === 'clarification_requested' ? (
        <div className="notice" role="status">
          <strong>Нужно уточнение.</strong>
          <p>{latest.reviewComment}</p>
        </div>
      ) : null}

      {!internal && item.status === 'open' && result.draft ? (
        <>
          <QuestionnaireForm
            schema={item.schemaSnapshot}
            initialAnswers={result.draft.answers}
            initialVersion={result.draft.version}
            initialSavedAt={result.draft.lastSavedAt.toISOString()}
            initialProgress={result.draft.progress}
            draftUrl={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/draft`}
            submitUrl={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/submit`}
            fileUploadBaseUrl={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/fields`}
            completeBaseUrl={`/api/workspaces/${slug}/projects/${projectSlug}/files`}
          />
        </>
      ) : !internal && item.status === 'submitted' ? (
        <p className="notice success" role="status">
          Ответы отправлены разработчику. Здесь появится результат проверки.
        </p>
      ) : null}

      {result.submissions.map((submission) => {
        const comments = result.comments.filter(
          (comment) => comment.submissionId === submission.id,
        );
        const canComment =
          result.access.projectStatus !== 'archived' &&
          (internal ? canReview : result.access.role === 'client');
        return (
          <section
            className="panel submission-history"
            key={submission.id}
            aria-labelledby={`submission-${submission.id}`}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Редакция {submission.revision}</p>
                <h2 id={`submission-${submission.id}`}>
                  Отправлена {submission.submittedAt.toLocaleString('ru-RU')}
                </h2>
              </div>
              <span className="status-pill">
                {submission.status === 'accepted'
                  ? 'Принята'
                  : submission.status === 'clarification_requested'
                    ? 'Нужно уточнение'
                    : 'На проверке'}
              </span>
            </div>
            <SubmissionAnswers
              fields={fields}
              answers={submission.answers}
              comments={comments}
              canComment={canComment}
              commentAction={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/submissions/${submission.id}/comments`}
              fileBaseUrl={`/api/workspaces/${slug}/projects/${projectSlug}/files`}
            />
            {internal && canReview && submission.status === 'submitted' ? (
              <div className="review-actions">
                <form
                  action={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/submissions/${submission.id}/review`}
                  method="post"
                >
                  <input name="decision" type="hidden" value="accepted" />
                  <button type="submit">Принять ответы</button>
                </form>
                <form
                  action={`/api/workspaces/${slug}/projects/${projectSlug}/questionnaires/${item.id}/submissions/${submission.id}/review`}
                  method="post"
                >
                  <input name="decision" type="hidden" value="clarification_requested" />
                  <label>
                    Что нужно уточнить
                    <textarea name="comment" rows={3} required maxLength={5_000} />
                  </label>
                  <button className="secondary" type="submit">
                    Вернуть на уточнение
                  </button>
                </form>
              </div>
            ) : null}
          </section>
        );
      })}
      {internal && result.submissions.length === 0 ? (
        <section className="panel">
          <p className="empty">
            {item.assigneeName} ещё не отправил ответы. Черновик остаётся приватным до отправки.
          </p>
        </section>
      ) : null}
    </main>
  );
}
