import { inspectInvitation } from '@garun/auth';

import { database } from '@/lib/server';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await inspectInvitation(database, token);
  const messages = {
    accepted: [
      'Приглашение уже использовано',
      'Для входа запросите новую ссылку на странице входа.',
    ],
    revoked: ['Приглашение отозвано', 'Попросите владельца создать новое приглашение.'],
    expired: ['Срок приглашения истёк', 'Попросите владельца повторно отправить приглашение.'],
    invalid: [
      'Ссылка недействительна',
      'Проверьте адрес или попросите владельца создать новое приглашение.',
    ],
  } as const;
  if (state !== 'pending') {
    const [title, body] = messages[state];
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Доступ</p>
          <h1>{title}</h1>
          <p className="lede">{body}</p>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Приглашение в команду</p>
        <h1>Присоединиться к workspace</h1>
        <p className="lede">
          После подтверждения мы отправим отдельную одноразовую ссылку для безопасного входа.
        </p>
        <form action="/api/invitations/accept" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Принять приглашение</button>
        </form>
      </section>
    </main>
  );
}
