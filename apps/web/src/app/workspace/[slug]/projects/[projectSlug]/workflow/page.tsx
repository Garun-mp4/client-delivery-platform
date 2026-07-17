import Link from 'next/link';
import { notFound } from 'next/navigation';

import { canAccessProject } from '@garun/core/projects';
import {
  getProjectWorkflow,
  diffScopeRevisions,
  isActionOverdue,
  isAssignedScopeApprover,
  listWorkflowAssignees,
} from '@garun/core/workflow';

import { WorkspaceNav } from '../../../_components/workspace-nav';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

const stageLabels = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  waiting_for_client: 'Ожидает клиента',
  ready_for_review: 'Готов к проверке',
  changes_requested: 'Нужны изменения',
  approved: 'Согласован',
  skipped: 'Пропущен',
} as const;

const actionLabels = {
  open: 'Открыто',
  in_progress: 'В работе',
  done: 'Выполнено',
  cancelled: 'Отменено',
} as const;

function Lines({ values }: { values: readonly string[] }) {
  if (values.length === 0) return <p className="empty">Не указано.</p>;
  return (
    <ul className="compact-list">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

export default async function WorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug, projectSlug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const workflow = await getProjectWorkflow(database.db, tenant, projectSlug);
  if (!workflow) notFound();
  const internal = canAccessProject(workflow.access, 'project.view.internal');
  const canManage = canAccessProject(workflow.access, 'project.edit');
  const assignees = internal ? await listWorkflowAssignees(database.db, tenant, projectSlug) : [];
  const approvers = assignees.filter(
    (person) => person.side === 'client' && person.canApprove === true,
  );
  const internalAssignees = assignees.filter((person) => person.side === 'internal');
  const latest = workflow.revisions[0];
  const canDecide =
    latest?.status === 'client_review'
      ? await isAssignedScopeApprover(database.db, tenant, latest.id)
      : false;
  const blockingClientAction = workflow.blockedByClient;
  const scopeDiff =
    workflow.revisions.length > 1
      ? diffScopeRevisions(workflow.revisions[1]!, workflow.revisions[0]!)
      : [];

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">План и выполнение</p>
          <h1>{workflow.project.name}</h1>
          <p className="lede">
            Границы проекта, этапы и действия собраны в одном проверяемом потоке.
          </p>
        </div>
        <Link className="text-link" href={`/workspace/${slug}/projects/${projectSlug}`}>
          К карточке проекта
        </Link>
      </header>
      <WorkspaceNav slug={slug} internal={internal} />
      {feedback.success ? (
        <p className="notice success" role="status">
          Изменения сохранены.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте данные и актуальное состояние.
        </p>
      ) : null}

      {!internal ? (
        <section className="client-summary" aria-labelledby="next-step-title">
          <div>
            <p className="eyebrow">Следующий шаг</p>
            <h2 id="next-step-title">
              {canDecide
                ? 'Проверьте и согласуйте границы проекта'
                : workflow.nextAction
                  ? workflow.nextAction.title
                  : 'От вас пока ничего не требуется'}
            </h2>
            <p>
              {canDecide
                ? 'Ниже показана версия, назначенная вам на согласование.'
                : (workflow.nextAction?.description ??
                  'Мы покажем здесь одно главное действие, когда оно появится.')}
            </p>
          </div>
          {workflow.nextAction && !canDecide ? (
            <form
              action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/actions/${workflow.nextAction.id}/transition`}
              method="post"
            >
              <input type="hidden" name="status" value="done" />
              <button type="submit">Отметить выполненным</button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="progress-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Прогресс</p>
            <h2 id="progress-title">{workflow.progressPercent}% проекта</h2>
          </div>
          <span className="count">
            {workflow.project.progressCompletedWeight}/{workflow.project.progressTotalWeight}
          </span>
        </div>
        <progress max={100} value={workflow.progressPercent}>
          {workflow.progressPercent}%
        </progress>
        {blockingClientAction ? (
          <p className="notice" role="status">
            Проект ожидает клиента: {blockingClientAction.title}
          </p>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="scope-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Scope</p>
            <h2 id="scope-title">Границы проекта</h2>
          </div>
          {latest ? (
            <span className="status-pill">
              Версия {latest.revision} · {latest.status}
            </span>
          ) : null}
        </div>
        {latest ? (
          <div>
            <p>{latest.summary}</p>
            <h3>Цели</h3>
            <Lines values={latest.goals} />
            <h3>Страницы</h3>
            <Lines values={latest.pages} />
            <h3>Результаты</h3>
            <Lines values={latest.deliverables} />
            <h3>Критерии приёмки</h3>
            <Lines values={latest.acceptanceCriteria} />
            {scopeDiff.length > 0 ? (
              <>
                <h3>Что изменилось с прошлой версии</h3>
                <ul className="compact-list">
                  {scopeDiff.map((change) => (
                    <li key={change.field}>{change.field}: значение обновлено</li>
                  ))}
                </ul>
              </>
            ) : null}
            {canManage && latest.status === 'draft' ? (
              approvers.length > 0 ? (
                <form
                  className="inline-form"
                  action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/scope/${latest.id}/submit`}
                  method="post"
                >
                  <label>
                    Назначенный согласующий
                    <select name="approverUserId" required>
                      {approvers.map((person) => (
                        <option key={person.userId} value={person.userId}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Отправить на согласование</button>
                </form>
              ) : (
                <p className="notice">
                  Для отправки нужен клиент с явно выданным правом согласования.
                </p>
              )
            ) : null}
            {canDecide ? (
              <form
                className="form-grid"
                action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/scope/${latest.id}/decision`}
                method="post"
              >
                <label className="full-field">
                  Комментарий (обязателен при запросе изменений)
                  <textarea name="comment" rows={4} />
                </label>
                <button name="decision" value="agreed" type="submit">
                  Согласовать версию
                </button>
                <button
                  className="secondary"
                  name="decision"
                  value="changes_requested"
                  type="submit"
                >
                  Запросить изменения
                </button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className="empty">Версия границ проекта ещё не создана.</p>
        )}
        {canManage && !latest ? (
          <form
            className="form-grid"
            action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/scope`}
            method="post"
          >
            <label className="full-field">
              Краткое описание
              <textarea name="summary" rows={4} required />
            </label>
            {[
              ['goals', 'Цели'],
              ['audience', 'Аудитория'],
              ['pages', 'Страницы'],
              ['features', 'Функции'],
              ['integrations', 'Интеграции'],
              ['deliverables', 'Результаты'],
              ['responsibilities', 'Ответственность сторон'],
              ['revisionLimits', 'Ограничения правок'],
              ['exclusions', 'Что не входит'],
              ['assumptions', 'Допущения'],
              ['acceptanceCriteria', 'Критерии приёмки'],
            ].map(([name, label]) => (
              <label key={name}>
                {label} — по одному пункту на строку
                <textarea name={name} rows={3} />
              </label>
            ))}
            <label>
              Плановое начало
              <input name="plannedStartDate" type="date" />
            </label>
            <label>
              Плановое завершение
              <input name="plannedEndDate" type="date" />
            </label>
            <label>
              Стоимость
              <input name="cost" inputMode="decimal" />
            </label>
            <label>
              Валюта
              <input name="currency" defaultValue="RUB" maxLength={3} />
            </label>
            <label>
              Ссылка на договор
              <input name="contractUrl" type="url" />
            </label>
            <label>
              Ссылка на предложение
              <input name="proposalUrl" type="url" />
            </label>
            <button type="submit">Создать версию scope</button>
          </form>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="stages-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">План</p>
            <h2 id="stages-title">Этапы</h2>
          </div>
          <span className="count">{workflow.stages.length}</span>
        </div>
        {workflow.stages.length === 0 ? (
          <p className="empty">Этапов пока нет.</p>
        ) : (
          <ol className="compact-list">
            {workflow.stages.map((stage) => (
              <li key={stage.id}>
                <span>
                  <strong>{stage.name}</strong>
                  <small>
                    {stageLabels[stage.status]} · вес {stage.weight} · до {stage.plannedEndDate}
                  </small>
                </span>
                {canManage ? (
                  <form
                    className="inline-form"
                    action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/stages/${stage.id}/transition`}
                    method="post"
                  >
                    <select name="status" aria-label={`Новый статус этапа ${stage.name}`}>
                      {stage.status === 'not_started' ? (
                        <option value="in_progress">Начать</option>
                      ) : null}
                      {stage.status === 'in_progress' || stage.status === 'waiting_for_client' ? (
                        <option value="ready_for_review">Передать на проверку</option>
                      ) : null}
                      {stage.status === 'in_progress' ? (
                        <option value="waiting_for_client">Ожидать клиента</option>
                      ) : null}
                      {stage.status === 'ready_for_review' ? (
                        <option value="changes_requested">Вернуть в работу</option>
                      ) : null}
                      {stage.status === 'changes_requested' ? (
                        <option value="in_progress">Продолжить работу</option>
                      ) : null}
                      {stage.status === 'skipped' ? (
                        <option value="not_started">Вернуть этап</option>
                      ) : null}
                      {['not_started', 'in_progress', 'waiting_for_client'].includes(
                        stage.status,
                      ) ? (
                        <option value="skipped">Пропустить</option>
                      ) : null}
                    </select>
                    <input name="resultSummary" placeholder="Результат для проверки" />
                    <input name="skipReason" placeholder="Причина пропуска" />
                    <button className="secondary" type="submit">
                      Обновить
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {canManage ? (
          <form
            className="form-grid"
            action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/stages`}
            method="post"
          >
            <label>
              Название этапа
              <input name="name" required />
            </label>
            <label>
              Ответственный
              <select name="ownerUserId" required>
                {internalAssignees.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Вес прогресса
              <input name="weight" type="number" min={1} defaultValue={1} required />
            </label>
            <label>
              Начало
              <input name="plannedStartDate" type="date" required />
            </label>
            <label>
              Завершение
              <input name="plannedEndDate" type="date" required />
            </label>
            <label className="full-field">
              Описание
              <textarea name="description" rows={3} />
            </label>
            <label className="full-field">
              Критерии завершения
              <textarea name="acceptanceCriteria" rows={3} />
            </label>
            <label className="confirm-control">
              <input name="clientVisible" type="checkbox" value="yes" defaultChecked />
              Видим клиенту
            </label>
            <label className="confirm-control">
              <input name="isRequired" type="checkbox" value="yes" defaultChecked />
              Обязательный этап
            </label>
            <label className="confirm-control">
              <input name="countsTowardProgress" type="checkbox" value="yes" defaultChecked />
              Учитывать в прогрессе
            </label>
            <button type="submit">Добавить этап</button>
          </form>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="actions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Действия</p>
            <h2 id="actions-title">Что нужно сделать</h2>
          </div>
          <span className="count">{workflow.actions.length}</span>
        </div>
        {workflow.actions.length === 0 ? (
          <p className="empty">Действий пока нет.</p>
        ) : (
          <ul className="compact-list">
            {workflow.actions.map((action) => (
              <li key={action.id}>
                <span>
                  <strong>{action.title}</strong>
                  <small>
                    {actionLabels[action.status]} · {action.assigneeName} · до{' '}
                    {action.dueAt.toLocaleDateString('ru-RU')}
                    {isActionOverdue(action) ? ' · просрочено' : ''}
                  </small>
                </span>
                {(canManage ||
                  (workflow.access.side === 'client' && action.assigneeUserId === tenant.userId)) &&
                (action.status === 'open' || action.status === 'in_progress') ? (
                  <form
                    action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/actions/${action.id}/transition`}
                    method="post"
                  >
                    <button name="status" value="done" type="submit">
                      Выполнено
                    </button>
                    {canManage ? (
                      <button className="secondary" name="status" value="cancelled" type="submit">
                        Отменить
                      </button>
                    ) : null}
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form
            className="form-grid"
            action={`/api/workspaces/${slug}/projects/${projectSlug}/workflow/actions`}
            method="post"
          >
            <label>
              Название действия
              <input name="title" required />
            </label>
            <label>
              Исполнитель
              <select name="assigneeUserId" required>
                {assignees.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.name} · {person.side === 'client' ? 'клиент' : 'команда'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Этап
              <select name="stageId" defaultValue="">
                <option value="">Без этапа</option>
                {workflow.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип
              <select name="type" defaultValue="other">
                <option value="other">Другое</option>
                <option value="upload_material">Загрузить материал</option>
                <option value="answer_question">Ответить на вопрос</option>
                <option value="review_version">Проверить версию</option>
                <option value="fix_feedback">Исправить замечание</option>
                <option value="internal">Внутренняя задача</option>
              </select>
            </label>
            <label>
              Приоритет
              <select name="priority" defaultValue="normal">
                <option value="low">Низкий</option>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочный</option>
              </select>
            </label>
            <label>
              Видимость
              <select name="visibility" defaultValue="internal">
                <option value="internal">Только команда</option>
                <option value="client">Клиенту</option>
              </select>
            </label>
            <label>
              Срок
              <input name="dueDate" type="date" required />
            </label>
            <label className="full-field">
              Описание
              <textarea name="description" rows={3} />
            </label>
            <label className="confirm-control">
              <input name="isBlocking" type="checkbox" value="yes" />
              Блокирует дальнейший ход проекта
            </label>
            <button type="submit">Создать действие</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
