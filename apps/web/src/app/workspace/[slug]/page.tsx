import { desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { can, resolveTenantContext } from '@garun/core/identity';
import {
  auditEvent,
  invitation,
  session,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

import { auth, database } from '@/lib/server';

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ slug }, feedback, requestHeaders] = await Promise.all([params, searchParams, headers()]);
  const identity = await auth.api.getSession({ headers: requestHeaders });
  if (!identity) redirect(`/login?callback=/workspace/${slug}`);
  const tenant = await resolveTenantContext(database.db, identity.user.id, slug);
  if (!tenant || !can(tenant, 'workspace.view')) {
    await database.db.insert(auditEvent).values({
      actorUserId: identity.user.id,
      action: 'access.denied',
      entityType: 'workspace',
      requestId: requestHeaders.get('x-request-id') ?? undefined,
      metadata: { reasonCode: 'TENANT_CONTEXT_NOT_RESOLVED' },
    });
    notFound();
  }
  const [space] = await database.db
    .select({ name: workspace.name, locale: workspace.locale, timezone: workspace.timezone })
    .from(workspace)
    .where(eq(workspace.id, tenant.workspaceId))
    .limit(1);
  if (!space) notFound();
  const members = await database.db
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
    .orderBy(user.name);
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
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Рабочее пространство</p>
          <h1>{space.name}</h1>
          <p className="muted">
            {identity.user.name} · {identity.user.email}
          </p>
        </div>
        <form action="/api/logout" method="post">
          <button className="secondary" type="submit">
            Выйти
          </button>
        </form>
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
                      <button className="danger" type="submit">
                        Отключить доступ
                      </button>
                    </form>
                    <form
                      action={`/api/workspaces/${slug}/members/${member.id}/revoke-sessions`}
                      method="post"
                    >
                      <label className="confirm-control">
                        <input name="confirm" type="checkbox" value="yes" required />
                        Подтверждаю завершение сеансов
                      </label>
                      <button className="secondary" type="submit">
                        Завершить сеансы
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {can(tenant, 'members.invite') ? (
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
            <button type="submit">Отправить приглашение</button>
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
                        <button className="secondary" type="submit">
                          Повторить
                        </button>
                      </form>
                      <form
                        action={`/api/workspaces/${slug}/invitations/${item.id}/revoke`}
                        method="post"
                      >
                        <label className="confirm-control">
                          <input name="confirm" type="checkbox" value="yes" required />
                          Подтвердить отзыв
                        </label>
                        <button className="danger" type="submit">
                          Отозвать
                        </button>
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
                <button className="secondary" type="submit">
                  Отозвать
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
