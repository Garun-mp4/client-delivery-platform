import Link from 'next/link';
import { notFound } from 'next/navigation';

import { canAccessProject } from '@garun/core/projects';
import { getProjectReview } from '@garun/core/review';

import { ProjectNav } from '../_components/project-nav';
import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const environmentLabels = {
  prototype: 'Прототип',
  design: 'Дизайн',
  preview: 'Версия для проверки',
  staging: 'Тестовый сайт',
  production: 'Опубликованный сайт',
  archived: 'Архивная версия',
} as const;

const statusLabels = {
  new: 'Новое',
  accepted: 'Принято в работу',
  clarification: 'Нужно уточнение',
  in_progress: 'Исправляется',
  fixed: 'Исправлено',
  awaiting_verification: 'Ожидает вашей проверки',
  closed: 'Закрыто',
  rejected: 'Отклонено',
} as const;

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedbackState] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const review = await getProjectReview(database, tenant, projectSlug).catch(() => null);
  if (!review) notFound();
  const internal = review.access.side === 'internal';
  const editable = canAccessProject(review.access, 'project.edit');
  const archived = review.access.projectStatus === 'archived';
  const visibleVersions = review.versions.filter(
    (version) => internal || (version.clientVisible && version.securityStatus === 'safe'),
  );

  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Проверка результата</p>
          <h1>Версии и замечания</h1>
          <p className="lede">
            {internal
              ? 'Опубликуйте результат, объясните, что проверить, и ведите замечания до подтверждения клиента.'
              : 'Откройте последнюю версию, проверьте результат и оставьте конкретные замечания.'}
          </p>
        </div>
      </header>
      <ProjectNav projectSlug={projectSlug} workspaceSlug={slug} />
      {feedbackState.success ? (
        <p className="notice success" role="status">
          Изменение сохранено. Следующий шаг уже отражён ниже.
        </p>
      ) : null}
      {feedbackState.error ? (
        <p className="notice error" role="alert">
          Не удалось выполнить действие. Проверьте данные и текущее состояние.
        </p>
      ) : null}

      <section className="panel" aria-labelledby="updates-title">
        <p className="eyebrow">Лента проекта</p>
        <h2 id="updates-title">Обновления</h2>
        {review.updates.length === 0 ? (
          <p className="empty">Обновлений пока нет.</p>
        ) : (
          <ol className="timeline-list">
            {review.updates.map((update) => (
              <li key={update.id}>
                <span>
                  {update.pinnedAt ? 'Закреплено · ' : ''}
                  {update.importance === 'important' ? 'Важное обновление' : 'Обновление'}
                </span>
                <h3>{update.title}</h3>
                <p className="pre-wrap">{update.body}</p>
                <small>{update.publishedAt.toLocaleString('ru-RU')}</small>
              </li>
            ))}
          </ol>
        )}
        {editable && !archived ? (
          <details className="disclosure-panel form-section">
            <summary>
              <span className="disclosure-title">Опубликовать обновление</span>
            </summary>
            <div className="disclosure-body">
              <form
                className="form-grid"
                action={`/api/workspaces/${slug}/projects/${projectSlug}/review/updates`}
                method="post"
              >
                <label>
                  Заголовок
                  <input name="title" maxLength={160} required />
                </label>
                <label className="full-field">
                  Что изменилось
                  <textarea name="body" rows={5} maxLength={10000} required />
                </label>
                <label>
                  Видимость
                  <select name="visibility" defaultValue="client">
                    <option value="client">Видно клиенту</option>
                    <option value="internal">Только команда</option>
                  </select>
                </label>
                <label className="confirm-control">
                  <input name="importance" type="checkbox" value="important" />
                  Важное обновление
                </label>
                <label className="confirm-control">
                  <input name="pinned" type="checkbox" value="yes" />
                  Закрепить первым
                </label>
                <SubmitButton pendingText="Публикуем…">Опубликовать</SubmitButton>
              </form>
            </div>
          </details>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="versions-title">
        <p className="eyebrow">Результат</p>
        <h2 id="versions-title">Версии сайта</h2>
        {visibleVersions.length === 0 ? (
          <p className="empty">
            {internal
              ? 'Добавьте первую ссылку. Клиент увидит её только после безопасной проверки и публикации.'
              : 'Версия для проверки ещё не опубликована.'}
          </p>
        ) : (
          <ol className="version-list">
            {visibleVersions.map((version) => (
              <li className="review-card" key={version.id}>
                <header>
                  <div>
                    <small>
                      №{version.versionNumber} · {environmentLabels[version.environmentType]}
                    </small>
                    <h3>{version.name}</h3>
                  </div>
                  <span className="status-pill">
                    {version.clientVisible
                      ? 'Доступна клиенту'
                      : version.securityStatus === 'pending' ||
                          version.securityStatus === 'checking'
                        ? 'Проверяем ссылку'
                        : version.securityStatus === 'unsafe'
                          ? 'Ссылка заблокирована'
                          : 'Готова к публикации'}
                  </span>
                </header>
                {version.description ? <p>{version.description}</p> : null}
                <div className="review-instructions">
                  <strong>Что изменилось</strong>
                  <p className="pre-wrap">{version.changeLog}</p>
                  <strong>Что проверить</strong>
                  <p className="pre-wrap">{version.checkInstructions}</p>
                </div>
                {version.securityStatus === 'safe' ? (
                  <div className="row-actions">
                    <Link
                      className="button-secondary"
                      href={version.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Открыть сайт в новой вкладке
                    </Link>
                    {version.accessMode === 'password' ? (
                      <Link
                        className="text-link"
                        href={`/workspace/${slug}/projects/${projectSlug}/review/versions/${version.id}/access`}
                      >
                        Показать пароль preview
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {internal && !version.clientVisible && version.securityStatus === 'safe' ? (
                  <form
                    action={`/api/workspaces/${slug}/projects/${projectSlug}/review/versions/${version.id}/publish`}
                    method="post"
                  >
                    {version.availabilityStatus === 'unreachable' ? (
                      <label className="confirm-control">
                        <input name="acknowledgeUnreachable" type="checkbox" value="yes" required />
                        Адрес безопасен, но недоступен без preview-доступа
                      </label>
                    ) : null}
                    <SubmitButton pendingText="Публикуем версию…">Показать клиенту</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {editable && !archived ? (
          <details className="disclosure-panel form-section">
            <summary>
              <span className="disclosure-title">Добавить версию</span>
            </summary>
            <div className="disclosure-body">
              <form
                className="form-grid"
                action={`/api/workspaces/${slug}/projects/${projectSlug}/review/versions`}
                method="post"
              >
                <label>
                  Название версии
                  <input name="name" maxLength={160} required />
                </label>
                <label>
                  Окружение
                  <select name="environmentType" defaultValue="preview">
                    {Object.entries(environmentLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="full-field">
                  Безопасный URL
                  <input name="url" type="url" inputMode="url" required />
                </label>
                <label>
                  Доступ
                  <select name="accessMode" defaultValue="public">
                    <option value="public">Без пароля</option>
                    <option value="password">Пароль preview</option>
                  </select>
                </label>
                <label>
                  Пароль preview, если нужен
                  <input name="accessSecret" type="password" autoComplete="new-password" />
                </label>
                <label className="full-field">
                  Краткое описание
                  <textarea name="description" rows={2} />
                </label>
                <label className="full-field">
                  Список изменений
                  <textarea name="changeLog" rows={5} required />
                </label>
                <label className="full-field">
                  Что именно проверить
                  <textarea name="checkInstructions" rows={5} required />
                </label>
                <SubmitButton pendingText="Ставим ссылку на проверку…">
                  Добавить и проверить
                </SubmitButton>
              </form>
            </div>
          </details>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="feedback-title">
        <p className="eyebrow">Обратная связь</p>
        <h2 id="feedback-title">Замечания</h2>
        {review.feedback.length === 0 ? (
          <p className="empty">Замечаний пока нет.</p>
        ) : (
          <ol className="feedback-list">
            {review.feedback.map((item) => (
              <li className="review-card" key={item.id}>
                <header>
                  <div>
                    <small>
                      {item.priority === 'blocking' ? 'Блокирующее · ' : ''}
                      {item.classification === 'potential_change'
                        ? 'Возможное расширение работ'
                        : 'В рамках проекта'}
                    </small>
                    <h3>{item.title}</h3>
                  </div>
                  <span className="status-pill">{statusLabels[item.status]}</span>
                </header>
                <p className="pre-wrap">{item.body}</p>
                {item.pageUrl ? (
                  <Link href={item.pageUrl} target="_blank" rel="noopener noreferrer">
                    Открыть указанную страницу
                  </Link>
                ) : null}
                {item.comments.length > 0 ? (
                  <ol className="comment-thread" aria-label="Обсуждение замечания">
                    {item.comments.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.authorName}</strong>
                        {entry.visibility === 'internal' ? <small> · Только команда</small> : null}
                        <p>
                          {entry.deletedAt ? 'Сообщение удалено.' : entry.body}
                          {entry.editedAt ? ' · изменено' : ''}
                        </p>
                        {entry.authorUserId === tenant.userId && !entry.deletedAt && !archived ? (
                          <details className="comment-actions">
                            <summary>Изменить сообщение</summary>
                            <form
                              className="inline-form"
                              action={`/api/workspaces/${slug}/projects/${projectSlug}/review/feedback/${item.id}/comments/${entry.id}`}
                              method="post"
                            >
                              <label>
                                Текст
                                <textarea name="body" rows={2} defaultValue={entry.body} required />
                              </label>
                              <SubmitButton name="intent" value="edit" pendingText="Сохраняем…">
                                Сохранить правку
                              </SubmitButton>
                              <SubmitButton
                                className="danger"
                                name="intent"
                                value="delete"
                                formNoValidate
                                pendingText="Удаляем…"
                              >
                                Удалить с пометкой
                              </SubmitButton>
                            </form>
                          </details>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {!archived && review.access.role !== 'observer' ? (
                  <>
                    <form
                      className="inline-form"
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/review/feedback/${item.id}/comments`}
                      method="post"
                    >
                      <label>
                        Ответ
                        <textarea name="body" rows={2} required />
                      </label>
                      {internal ? (
                        <label className="confirm-control">
                          <input name="internal" type="checkbox" value="yes" />
                          Только команда
                        </label>
                      ) : null}
                      <SubmitButton pendingText="Отправляем…">Ответить</SubmitButton>
                    </form>
                    <form
                      className="inline-form"
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/review/feedback/${item.id}/status`}
                      method="post"
                    >
                      <input name="classification" type="hidden" value={item.classification} />
                      <label>
                        Следующий статус
                        <select name="status" required defaultValue="">
                          <option value="" disabled>
                            Выберите действие
                          </option>
                          {internal ? (
                            <>
                              <option value="accepted">Принять</option>
                              <option value="clarification">Запросить уточнение</option>
                              <option value="in_progress">Начать исправление</option>
                              <option value="fixed">Отметить исправленным</option>
                              <option value="awaiting_verification">
                                Передать клиенту на проверку
                              </option>
                              <option value="rejected">Отклонить</option>
                            </>
                          ) : (
                            <>
                              <option value="accepted">Уточнение предоставлено</option>
                              <option value="closed">Подтвердить и закрыть</option>
                              <option value="in_progress">Вернуть в работу</option>
                            </>
                          )}
                        </select>
                      </label>
                      {internal ? (
                        <label className="confirm-control">
                          <input name="potentialChange" type="checkbox" value="yes" />
                          Возможно, это изменение согласованного объёма
                        </label>
                      ) : null}
                      <SubmitButton pendingText="Обновляем…">Изменить статус</SubmitButton>
                    </form>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {!internal &&
        !archived &&
        review.access.role !== 'observer' &&
        visibleVersions.length > 0 ? (
          <details className="disclosure-panel form-section">
            <summary>
              <span className="disclosure-title">Оставить замечание</span>
            </summary>
            <div className="disclosure-body">
              <form
                className="form-grid"
                action={`/api/workspaces/${slug}/projects/${projectSlug}/review/feedback`}
                method="post"
              >
                <label>
                  Версия
                  <select name="siteVersionId" required>
                    {visibleVersions.map((version) => (
                      <option key={version.id} value={version.id}>
                        №{version.versionNumber} · {version.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Важность
                  <select name="priority" defaultValue="normal">
                    <option value="low">Низкая</option>
                    <option value="normal">Обычная</option>
                    <option value="high">Высокая</option>
                    <option value="blocking">Блокирует проверку</option>
                  </select>
                </label>
                <label className="full-field">
                  Коротко о проблеме
                  <input name="title" maxLength={200} required />
                </label>
                <label className="full-field">
                  Что именно не так и какой результат ожидается
                  <textarea name="body" rows={5} required />
                </label>
                <label className="full-field">
                  URL страницы, если отличается от версии
                  <input name="pageUrl" type="url" inputMode="url" />
                </label>
                {review.screenshots.length > 0 ? (
                  <label>
                    Проверенный файл или скриншот
                    <select name="screenshotFileId" defaultValue="">
                      <option value="">Не прикладывать</option>
                      {review.screenshots.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <SubmitButton pendingText="Создаём замечание…">Отправить замечание</SubmitButton>
              </form>
            </div>
          </details>
        ) : null}
      </section>
    </main>
  );
}
