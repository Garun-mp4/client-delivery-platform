import { randomUUID } from 'node:crypto';

import { notFound } from 'next/navigation';

import {
  getProjectApprovals,
  listApprovalAudit,
  listApprovalTargets,
  listEligibleApprovers,
} from '@garun/core/approvals';
import { isOwner } from '@garun/core/identity';
import { canAccessProject } from '@garun/core/projects';

import { ProjectNav } from '../_components/project-nav';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const statusLabels = {
  pending: 'Ожидает решения',
  approved: 'Согласовано',
  changes_requested: 'Запрошены изменения',
  cancelled: 'Отменено',
  invalidated: 'Устарело',
} as const;

const entityLabels = {
  scope_revision: 'Границы проекта',
  project_stage: 'Этап',
  site_version: 'Версия сайта',
  file_object: 'Файл',
  final_handover: 'Финальная передача',
} as const;

const snapshotDetailLabels: Readonly<Record<string, string>> = {
  revision: 'Версия',
  goals: 'Цели',
  audience: 'Аудитория',
  pages: 'Страницы',
  features: 'Функции',
  integrations: 'Интеграции',
  deliverables: 'Результаты',
  responsibilities: 'Ответственность сторон',
  revisionLimits: 'Ограничения правок',
  exclusions: 'Не входит в проект',
  assumptions: 'Допущения',
  acceptanceCriteria: 'Критерии приёмки',
  plannedStartDate: 'Плановое начало',
  plannedEndDate: 'Плановое завершение',
  resultSummary: 'Описание результата',
  versionNumber: 'Номер версии',
  publicUrl: 'Опубликованный адрес',
  fileName: 'Имя файла',
  sizeBytes: 'Размер файла, байт',
  checksum: 'Контрольная сумма',
  completedStages: 'Завершённые этапы',
  requiredStages: 'Обязательные этапы',
};

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  let result;
  try {
    result = await getProjectApprovals(database, tenant, projectSlug);
  } catch {
    notFound();
  }
  const internal = canAccessProject(result.access, 'project.view.internal');
  const canManage = canAccessProject(result.access, 'project.edit');
  const owner = isOwner(tenant) && result.access.role === 'owner';
  const [approvers, targets, activity] = await Promise.all([
    internal ? listEligibleApprovers(database, tenant, projectSlug) : Promise.resolve([]),
    canManage ? listApprovalTargets(database, tenant, projectSlug) : Promise.resolve(null),
    listApprovalAudit(database, tenant, projectSlug),
  ]);
  const options = targets
    ? [
        ...targets.scopes.map((item) => ({
          value: `scope_revision:${item.id}`,
          label: `Границы проекта · версия ${item.revision}`,
        })),
        ...targets.stages.map((item) => ({
          value: `project_stage:${item.id}`,
          label: `Этап · ${item.name}`,
        })),
        ...targets.versions.map((item) => ({
          value: `site_version:${item.id}`,
          label: `Версия сайта · ${item.name} №${item.version}`,
        })),
        ...targets.files.map((item) => ({
          value: `file_object:${item.id}`,
          label: `Файл · ${item.name}`,
        })),
        { value: 'final_handover:', label: 'Финальная передача проекта' },
      ]
    : [];

  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Проверяемые решения</p>
          <h1>Согласования</h1>
          <p className="lede">
            Здесь зафиксировано, что именно передано на проверку, кому назначено решение и какой
            результат получен.
          </p>
        </div>
      </header>
      <ProjectNav projectSlug={projectSlug} workspaceSlug={slug} />

      {feedback.success ? (
        <p className="notice success" role="status">
          Операция выполнена.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте актуальность объекта и свои права.
        </p>
      ) : null}

      {!internal && result.requests.some((item) => item.status === 'pending') ? (
        <section className="client-summary" aria-labelledby="approval-next-title">
          <div>
            <p className="eyebrow">Требуется ваше решение</p>
            <h2 id="approval-next-title">Проверьте назначенный результат</h2>
            <p>
              Сначала внимательно изучите сохранённый снимок, затем подтвердите решение. После
              отправки изменить его нельзя.
            </p>
          </div>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="requests-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">История</p>
            <h2 id="requests-title">Запросы и решения</h2>
          </div>
          <span className="count">{result.requests.length}</span>
        </div>
        {result.requests.length === 0 ? (
          <p className="empty">
            {internal
              ? 'Согласований пока нет. Создайте запрос, когда результат будет готов.'
              : 'Вам пока не назначены согласования.'}
          </p>
        ) : (
          <div className="approval-list">
            {result.requests.map((item) => {
              const assigned = result.approvers.filter((entry) => entry.requestId === item.id);
              const decisions = result.decisions.filter((entry) => entry.requestId === item.id);
              const external = result.external.find((entry) => entry.requestId === item.id);
              const ownDecision = decisions.find((entry) => entry.approverUserId === tenant.userId);
              return (
                <article className="approval-card" key={item.id}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{entityLabels[item.entityType]}</p>
                      <h3>{item.entitySnapshot.title}</h3>
                    </div>
                    <span className={`status-pill status-${item.status}`}>
                      {statusLabels[item.status]}
                    </span>
                  </div>
                  {item.entitySnapshot.summary ? <p>{item.entitySnapshot.summary}</p> : null}
                  <dl className="detail-grid">
                    <div>
                      <dt>Режим</dt>
                      <dd>
                        {item.mode === 'any_one' ? 'Достаточно одного' : 'Нужны решения всех'}
                      </dd>
                    </div>
                    <div>
                      <dt>Назначены</dt>
                      <dd>{assigned.map((person) => person.name).join(', ')}</dd>
                    </div>
                    <div>
                      <dt>Создан</dt>
                      <dd>{item.requestedAt.toLocaleString('ru-RU')}</dd>
                    </div>
                  </dl>
                  <details>
                    <summary>Показать точный снимок результата</summary>
                    <dl className="detail-grid">
                      {Object.entries(item.entitySnapshot.details).map(([key, value]) => (
                        <div key={key}>
                          <dt>{snapshotDetailLabels[key] ?? 'Параметр результата'}</dt>
                          <dd>{value === null || value === '' ? 'Не указано' : String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  <div className="notice">
                    <strong>Текст подтверждения</strong>
                    <p>{item.acknowledgementText}</p>
                  </div>
                  {decisions.length > 0 ? (
                    <ul className="compact-list">
                      {decisions.map((entry) => {
                        const person = assigned.find(
                          (candidate) => candidate.userId === entry.approverUserId,
                        );
                        return (
                          <li key={entry.id}>
                            <span>
                              <strong>
                                {person?.name ?? 'Согласующий'} ·{' '}
                                {entry.decision === 'approved'
                                  ? 'согласовано'
                                  : 'запрошены изменения'}
                              </strong>
                              <small>{entry.decidedAt.toLocaleString('ru-RU')}</small>
                              {entry.comment ? <small>{entry.comment}</small> : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {external ? (
                    <p className="notice">
                      <strong>
                        Решение зафиксировано разработчиком как полученное вне платформы.
                      </strong>
                      <br />
                      Источник: {external.source}. Дата решения:{' '}
                      {external.sourceDecisionAt.toLocaleString('ru-RU')}. {external.explanation}
                    </p>
                  ) : null}
                  {item.status === 'pending' && !internal && !ownDecision ? (
                    <form
                      className="form-grid"
                      action={`/api/workspaces/${slug}/projects/${projectSlug}/approvals/${item.id}/decision`}
                      method="post"
                    >
                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                      <label className="full-field">
                        Комментарий (обязателен при запросе изменений)
                        <textarea name="comment" rows={4} maxLength={5000} />
                      </label>
                      <label className="confirm-control full-field">
                        <input
                          name="acknowledgementAccepted"
                          required
                          type="checkbox"
                          value="yes"
                        />
                        Я прочитал(а) снимок результата и текст подтверждения выше
                      </label>
                      <button name="decision" type="submit" value="approved">
                        Согласовать
                      </button>
                      <button
                        className="secondary"
                        name="decision"
                        type="submit"
                        value="changes_requested"
                      >
                        Запросить изменения
                      </button>
                    </form>
                  ) : null}
                  {item.status === 'pending' && owner ? (
                    <div className="approval-owner-actions">
                      <form
                        className="inline-form"
                        action={`/api/workspaces/${slug}/projects/${projectSlug}/approvals/${item.id}/cancel`}
                        method="post"
                      >
                        <label>
                          Причина отмены
                          <input name="reason" maxLength={2000} required />
                        </label>
                        <button className="secondary" type="submit">
                          Отменить запрос
                        </button>
                      </form>
                      <details>
                        <summary>Зафиксировать решение, полученное вне платформы</summary>
                        <form
                          className="form-grid"
                          action={`/api/workspaces/${slug}/projects/${projectSlug}/approvals/${item.id}/external`}
                          method="post"
                        >
                          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                          <label>
                            Решение
                            <select name="decision" defaultValue="approved">
                              <option value="approved">Согласовано</option>
                              <option value="changes_requested">Запрошены изменения</option>
                            </select>
                          </label>
                          <label>
                            Дата и время решения
                            <input name="sourceDecisionAt" type="datetime-local" required />
                          </label>
                          <label className="full-field">
                            Источник
                            <input
                              name="source"
                              placeholder="Например, видеозвонок"
                              maxLength={240}
                              required
                            />
                          </label>
                          <label className="full-field">
                            Пояснение
                            <textarea name="explanation" rows={4} maxLength={5000} required />
                          </label>
                          <button type="submit">Зафиксировать внешнее решение</button>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="panel" aria-labelledby="new-approval-title">
          <p className="eyebrow">Новый запрос</p>
          <h2 id="new-approval-title">Передать результат на согласование</h2>
          {options.length === 0 || approvers.length === 0 ? (
            <p className="notice">
              Нужен готовый client-visible результат и клиент с явно выданным правом согласования.
            </p>
          ) : (
            <form
              className="form-grid"
              action={`/api/workspaces/${slug}/projects/${projectSlug}/approvals`}
              method="post"
            >
              <input name="idempotencyKey" type="hidden" value={randomUUID()} />
              <label className="full-field">
                Что согласовываем
                <select name="target" required>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="full-field">
                <legend>Назначенные согласующие</legend>
                {approvers.map((person) => (
                  <label className="confirm-control" key={person.userId}>
                    <input name="approverUserIds" type="checkbox" value={person.userId} />
                    {person.name}
                  </label>
                ))}
              </fieldset>
              <label>
                Правило принятия решения
                <select name="mode" defaultValue="any_one">
                  <option value="any_one">Достаточно одного согласующего</option>
                  <option value="all_required">Нужны решения всех</option>
                </select>
              </label>
              <label className="full-field">
                Текст подтверждения
                <textarea
                  name="acknowledgementText"
                  rows={4}
                  maxLength={4000}
                  defaultValue="Я ознакомился(лась) с указанным результатом и подтверждаю своё решение."
                  required
                />
              </label>
              <button type="submit">Отправить на согласование</button>
            </form>
          )}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="approval-activity-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h2 id="approval-activity-title">История действий</h2>
          </div>
        </div>
        {activity.length === 0 ? (
          <p className="empty">Значимых действий пока нет.</p>
        ) : (
          <ol className="compact-list">
            {activity.map((event) => (
              <li key={event.id}>
                <span>
                  <strong>{event.action}</strong>
                  <small>
                    {event.actorName ?? 'Система'} · {event.createdAt.toLocaleString('ru-RU')}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
