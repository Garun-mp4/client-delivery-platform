import Link from 'next/link';

import { getNotificationPreference, listNotifications } from '@garun/core/notifications';

import { SubmitButton } from '@/app/_components/submit-button';
import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';

function minuteToTime(value: number | null): string {
  if (value === null) return '';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug }, feedback] = await Promise.all([params, searchParams]);
  const { tenant } = await requireTenantPage(slug);
  const [items, preference] = await Promise.all([
    listNotifications(database, tenant),
    getNotificationPreference(database, tenant),
  ]);
  const unread = items.filter((item) => item.readAt === null).length;
  return (
    <main className="workspace-shell notification-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Центр внимания</p>
          <h1>Уведомления</h1>
          <p className="lede">
            Здесь собраны только события, которые помогают продолжить работу по проектам.
          </p>
        </div>
        {unread > 0 ? <span className="status-pill">{unread} непрочитанных</span> : null}
      </header>
      {feedback.success ? (
        <p className="notice success" role="status">
          Настройки сохранены.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Не удалось сохранить настройки. Проверьте время и часовой пояс.
        </p>
      ) : null}
      <section className="notification-stream" aria-labelledby="notification-list-title">
        <div className="section-heading notification-heading">
          <div>
            <p className="eyebrow">Входящие</p>
            <h2 id="notification-list-title">Последние события</h2>
          </div>
          {unread > 0 ? (
            <form action={`/api/workspaces/${slug}/notifications/read-all`} method="post">
              <SubmitButton className="button-secondary" pendingText="Отмечаем…">
                Прочитать всё
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="empty notification-empty">
            <strong>Пока всё спокойно</strong>
            <span>Новые действия, версии и согласования появятся здесь автоматически.</span>
          </div>
        ) : (
          <ol className="notification-list">
            {items.map((item) => (
              <li className={item.readAt ? 'is-read' : 'is-unread'} key={item.id}>
                <div className="notification-copy">
                  <span className="notification-state" aria-hidden="true" />
                  <div>
                    <p className="notification-meta">
                      {item.projectName ?? 'Рабочее пространство'} ·{' '}
                      {item.createdAt.toLocaleString('ru-RU')}
                    </p>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    {item.actorName ? <small>Инициатор: {item.actorName}</small> : null}
                  </div>
                </div>
                <div className="notification-actions">
                  <Link className="text-link" href={item.deepLinkPath}>
                    Открыть
                  </Link>
                  {!item.readAt ? (
                    <form
                      action={`/api/workspaces/${slug}/notifications/${item.id}/read`}
                      method="post"
                    >
                      <SubmitButton className="button-link" pendingText="Отмечаем…">
                        Прочитано
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <details className="panel disclosure-panel notification-settings">
        <summary>
          <span className="disclosure-title">
            <small>ДОСТАВКА</small>
            <span>Настроить письма и тихие часы</span>
          </span>
        </summary>
        <div className="disclosure-body">
          <form
            className="form-grid"
            action={`/api/workspaces/${slug}/notifications/preferences`}
            method="post"
          >
            <label className="confirm-control">
              <input
                defaultChecked={preference.emailEnabled}
                name="emailEnabled"
                type="checkbox"
                value="yes"
              />
              Получать письма о событиях проектов
            </label>
            <label className="confirm-control">
              <input
                defaultChecked={preference.remindersEnabled}
                name="remindersEnabled"
                type="checkbox"
                value="yes"
              />
              Напоминать о приближающихся и просроченных действиях
            </label>
            <label>
              Часовой пояс
              <input defaultValue={preference.timezone} name="timezone" required />
              <small>Например, Europe/Moscow.</small>
            </label>
            <div className="quiet-hours-fields">
              <label>
                Не присылать письма с
                <input
                  defaultValue={minuteToTime(preference.quietHoursStartMinute)}
                  name="quietHoursStart"
                  type="time"
                />
              </label>
              <label>
                До
                <input
                  defaultValue={minuteToTime(preference.quietHoursEndMinute)}
                  name="quietHoursEnd"
                  type="time"
                />
              </label>
            </div>
            <p className="muted full-field">
              Уведомления внутри приложения остаются доступными всегда. Приглашения и письма
              безопасности нельзя отключить этими настройками.
            </p>
            <SubmitButton pendingText="Сохраняем…">Сохранить настройки</SubmitButton>
          </form>
        </div>
      </details>
    </main>
  );
}
