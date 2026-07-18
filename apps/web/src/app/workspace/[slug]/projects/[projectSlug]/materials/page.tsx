import Link from 'next/link';
import { notFound } from 'next/navigation';

import { listProjectMaterials } from '@garun/core/materials';
import { canAccessProject } from '@garun/core/projects';
import { listQuestionnaireAssignees } from '@garun/core/questionnaires';

import { MaterialUploader } from './material-uploader';
import { WorkspaceNav } from '../../../_components/workspace-nav';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const statusLabels = {
  requested: 'Нужно загрузить',
  uploaded: 'На проверке',
  clarification: 'Нужно уточнение',
  accepted: 'Принято',
  replaced: 'Заменено',
  not_required: 'Не требуется',
} as const;

const typeLabels = {
  text: 'Текст',
  contact: 'Контакты',
  link: 'Ссылка',
  file: 'Файл',
  image: 'Изображение',
  video: 'Видео',
  logo: 'Логотип',
  document: 'Документ',
  details: 'Реквизиты',
  service: 'Услуга',
  testimonial: 'Отзыв',
  employee: 'Сотрудник',
  legal_text: 'Юридический текст',
  other: 'Другое',
} as const;

export default async function MaterialsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string; q?: string; category?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  let result;
  try {
    result = await listProjectMaterials(database, tenant, projectSlug, {
      query: feedback.q,
      category: feedback.category,
    });
  } catch {
    notFound();
  }
  const canManage = canAccessProject(result.access, 'project.edit');
  const internal = canAccessProject(result.access, 'project.view.internal');
  const assignees = canManage
    ? await listQuestionnaireAssignees(database.db, tenant, projectSlug)
    : [];

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Передача контента</p>
          <h1>Материалы проекта</h1>
          <p className="lede">
            Все редакции сохраняются, а файлы становятся доступны только после проверки.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects/${projectSlug}`}>
          К проекту
        </Link>
      </header>
      <WorkspaceNav slug={slug} internal={internal} />
      {feedback.success ? (
        <p className="notice success" role="status">
          Операция выполнена.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте данные и состояние материала.
        </p>
      ) : null}
      <section className="panel" aria-labelledby="materials-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Запросы</p>
            <h2 id="materials-title">{internal ? 'Материалы клиента' : 'Что нужно передать'}</h2>
          </div>
          <span className="count">{result.materials.length}</span>
        </div>
        <form className="form-grid compact-form" method="get">
          <label>
            Поиск по материалам
            <input
              name="q"
              type="search"
              maxLength={120}
              defaultValue={feedback.q}
              placeholder="Название, категория или имя файла"
            />
          </label>
          <label>
            Категория
            <select name="category" defaultValue={feedback.category ?? ''}>
              <option value="">Все категории</option>
              {result.categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <button className="secondary" type="submit">
            Найти
          </button>
        </form>
        {result.materials.length === 0 ? (
          <p className="empty">
            {feedback.q || feedback.category
              ? 'По заданным условиям материалов не найдено.'
              : 'Запросов материалов пока нет.'}
          </p>
        ) : (
          <div className="stack">
            {result.materials.map((item) => (
              <article className="panel nested-panel" key={item.id}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      {typeLabels[item.type]} · {item.category ?? 'Без категории'}
                    </p>
                    <h3>{item.title}</h3>
                  </div>
                  <span className="status-pill">{statusLabels[item.status]}</span>
                </div>
                {!internal && item.requestedFromUserId === tenant.userId ? (
                  ['file', 'image', 'video', 'logo', 'document'].includes(item.type) ? (
                    <MaterialUploader
                      materialId={item.id}
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/materials/${item.id}/uploads`}
                      completeBaseUrl={`/api/workspaces/${slug}/projects/${projectSlug}/files`}
                      disabled={result.access.projectStatus === 'archived'}
                    />
                  ) : (
                    <form
                      className="form-grid"
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/materials/${item.id}/content`}
                      method="post"
                    >
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={`material_content_${crypto.randomUUID().replaceAll('-', '')}`}
                      />
                      <label>
                        {item.type === 'link' ? 'Ссылка' : 'Содержание'}
                        {item.type === 'link' ? (
                          <input name="value" type="url" required maxLength={2000} />
                        ) : (
                          <textarea name="value" required maxLength={20000} rows={6} />
                        )}
                      </label>
                      <button type="submit">Отправить редакцию</button>
                    </form>
                  )
                ) : null}
                {item.revisions.map((revision) => (
                  <div key={revision.id} className="revision-card">
                    <p>
                      <strong>Редакция {revision.revision}</strong> · {revision.status}
                    </p>
                    {revision.content.url ? (
                      <p>
                        <a href={revision.content.url} rel="noreferrer" target="_blank">
                          Открыть переданную ссылку
                        </a>
                      </p>
                    ) : revision.content.text ? (
                      <p className="preserve-lines">{revision.content.text}</p>
                    ) : null}
                    {revision.files.length === 0 ? (
                      <p className="muted">Файлы ещё не добавлены.</p>
                    ) : (
                      <ul>
                        {revision.files.map((file) => (
                          <li key={file.id}>
                            {file.status === 'available' && 'name' in file ? (
                              <>
                                <Link
                                  href={`/api/workspaces/${slug}/projects/${projectSlug}/files/${file.id}`}
                                >
                                  {file.name}
                                </Link>
                                {file.mimeType?.startsWith('image/') ||
                                file.mimeType === 'application/pdf' ? (
                                  <>
                                    {' · '}
                                    <Link
                                      href={`/api/workspaces/${slug}/projects/${projectSlug}/files/${file.id}?preview=1`}
                                      target="_blank"
                                    >
                                      Предпросмотр
                                    </Link>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <span>Файл в карантине: {file.status}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canManage && revision.status === 'submitted' ? (
                      <form
                        className="form-grid"
                        action={`/api/workspaces/${slug}/projects/${projectSlug}/materials/revisions/${revision.id}/review`}
                        method="post"
                      >
                        <label>
                          Комментарий
                          <textarea name="comment" maxLength={2000} />
                        </label>
                        <label className="confirm-control">
                          <input name="final" type="checkbox" value="yes" />
                          Отметить принятую редакцию финальной
                        </label>
                        <div className="row-actions">
                          <button name="decision" value="accepted" type="submit">
                            Принять
                          </button>
                          <button name="decision" value="clarification_requested" type="submit">
                            Запросить уточнение
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
      {canManage ? (
        <section className="panel" aria-labelledby="material-request-title">
          <p className="eyebrow">Новый запрос</p>
          <h2 id="material-request-title">Запросить материал</h2>
          {assignees.length === 0 ? (
            <p className="notice">В проекте нет активного участника клиента.</p>
          ) : (
            <form
              className="form-grid"
              action={`/api/workspaces/${slug}/projects/${projectSlug}/materials`}
              method="post"
            >
              <label>
                Название
                <input name="title" required maxLength={240} />
              </label>
              <label>
                Тип
                <select name="type" defaultValue="file">
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Категория или раздел сайта
                <input name="category" maxLength={120} />
              </label>
              <label>
                Кто передаёт
                <select name="requestedFromUserId" required>
                  {assignees.map((assignee) => (
                    <option key={assignee.userId} value={assignee.userId}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Срок
                <input name="dueDate" type="date" required />
              </label>
              <button type="submit">Создать запрос</button>
            </form>
          )}
        </section>
      ) : null}
    </main>
  );
}
