import { desc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { can, isOwner } from '@garun/core/identity';
import { invitation, session, user, workspace, workspaceMembership } from '@garun/db/schema';

import { requireTenantPage } from '@/lib/page-tenant';
import { database } from '@/lib/server';
import { SubmitButton } from '@/app/_components/submit-button';

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug }, feedback] = await Promise.all([params, searchParams]);
  const { identity, tenant } = await requireTenantPage(slug);
  const owner = isOwner(tenant);
  const [space] = await database.db
    .select({ name: workspace.name, locale: workspace.locale, timezone: workspace.timezone })
    .from(workspace)
    .where(eq(workspace.id, tenant.workspaceId))
    .limit(1);
  if (!space) notFound();
  const members = owner
    ? await database.db
        .select({
          id: workspaceMembership.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          role: workspaceMembership.role,
          status: workspaceMembership.status,
        })
        .from(workspaceMembership)
        .innerJoin(user, eq(user.id, workspaceMembership.userId))
        .where(eq(workspaceMembership.workspaceId, tenant.workspaceId))
        .orderBy(user.name)
    : [];
  const invitations = can(tenant, 'members.invite')
    ? await database.db
        .select({
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(eq(invitation.workspaceId, tenant.workspaceId))
        .orderBy(desc(invitation.createdAt))
        .limit(20)
    : [];
  const sessions = await database.db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(eq(session.userId, identity.user.id))
    .orderBy(desc(session.createdAt));
  return (
    <main className="workspace-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{owner ? 'Управление доступом' : 'Безопасность'}</p>
          <h1>{owner ? 'Люди и приглашения' : 'Ваши сеансы'}</h1>
          <p className="muted">
            {owner
              ? 'Управляйте участниками отдельно от ежедневной работы по проектам.'
              : 'Проверьте устройства, на которых выполнен вход в Garun Workspace.'}
          </p>
        </div>
      </header>
      {feedback.success ? (
        <p className="notice success" role="status">
          Изменение сохранено.
        </p>
      ) : null}
      {feedback.error ? (
        <p className="notice error" role="alert">
          Операцию выполнить не удалось. Проверьте данные и повторите.
        </p>
      ) : null}
      <div className="access-line" aria-label="Текущая роль">
        <span>{tenant.role === 'owner' ? 'Владелец' : 'Участник'}</span>
        <span>
          {space.locale} · {space.timezone}
        </span>
      </div>
      {owner ? (
        <section className="panel" aria-labelledby="members-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Доступ</p>
              <h2 id="members-title">Участники</h2>
            </div>
            <span className="count">{members.length}</span>
          </div>
          <ul className="rows">
            {members.map((member) => (
              <li key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email}</span>
                </div>
                <div className="row-actions">
                  <span className="role">
                    {member.role === 'owner'
                      ? 'Владелец'
                      : member.status === 'active'
                        ? 'Участник'
                        : 'Отключён'}
                  </span>
                  {can(tenant, 'members.manage') &&
                  member.role !== 'owner' &&
                  member.status === 'active' ? (
                    <details>
                      <summary>Управление</summary>
                      <p>Участник сразу потеряет доступ, его сессии завершатся.</p>
                      <form
                        action={`/api/workspaces/${slug}/members/${member.id}/disable`}
                        method="post"
                      >
                        <label className="confirm-control">
                          <input name="confirm" type="checkbox" value="yes" required />
                          Подтверждаю отключение
                        </label>
                        <SubmitButton className="danger" pendingText="Отключаем…">
                          Отключить доступ
                        </SubmitButton>
                      </form>
                      <form
                        action={`/api/workspaces/${slug}/members/${member.id}/revoke-sessions`}
                        method="post"
                      >
                        <label className="confirm-control">
                          <input name="confirm" type="checkbox" value="yes" required />
                          Подтверждаю завершение сеансов
                        </label>
                        <SubmitButton className="secondary" pendingText="Завершаем…">
                          Завершить сеансы
                        </SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {owner && can(tenant, 'members.invite') ? (
        <section className="panel" aria-labelledby="invite-title">
          <p className="eyebrow">Только для владельца</p>
          <h2 id="invite-title">Пригласить участника</h2>
          <form
            className="inline-form"
            action={`/api/workspaces/${slug}/invitations`}
            method="post"
          >
            <div>
              <label htmlFor="invite-email">Email участника</label>
              <input id="invite-email" name="email" type="email" required />
            </div>
            <SubmitButton pendingText="Готовим приглашение…">Отправить приглашение</SubmitButton>
          </form>
          {invitations.length === 0 ? (
            <p className="empty">Активных и недавних приглашений пока нет.</p>
          ) : (
            <ul className="compact-list">
              {invitations.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.email}
                    <small>
                      {item.status} · до {item.expiresAt.toLocaleString('ru-RU')}
                    </small>
                  </span>
                  {item.status === 'pending' ? (
                    <span className="mini-actions">
                      <form
                        action={`/api/workspaces/${slug}/invitations/${item.id}/resend`}
                        method="post"
                      >
                        <SubmitButton className="secondary" pendingText="Отправляем повторно…">
                          Повторить
                        </SubmitButton>
                      </form>
                      <form
                        action={`/api/workspaces/${slug}/invitations/${item.id}/revoke`}
                        method="post"
                      >
                        <label className="confirm-control">
                          <input name="confirm" type="checkbox" value="yes" required />
                          Подтвердить отзыв
                        </label>
                        <SubmitButton className="danger" pendingText="Отзываем…">
                          Отозвать
                        </SubmitButton>
                      </form>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section className="panel" aria-labelledby="sessions-title">
        <p className="eyebrow">Безопасность</p>
        <h2 id="sessions-title">Ваши активные сессии</h2>
        <ul className="rows">
          {sessions.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.userAgent || 'Неизвестное устройство'}</strong>
                <span>
                  Создана {item.createdAt.toLocaleString('ru-RU')} · до{' '}
                  {item.expiresAt.toLocaleString('ru-RU')}
                </span>
              </div>
              <form action={`/api/sessions/${item.id}/revoke`} method="post">
                <label className="confirm-control">
                  <input name="confirm" type="checkbox" value="yes" required />
                  Подтвердить
                </label>
                <SubmitButton className="secondary" pendingText="Отзываем…">
                  Отозвать
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
