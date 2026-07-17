import Link from 'next/link';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">Garun Workspace</p>
        <h1 id="login-title">Вход в рабочее пространство</h1>
        <p className="lede">Доступ открыт только владельцу и приглашённым участникам.</p>
        {error ? (
          <p className="notice error" role="alert">
            Не удалось войти. Проверьте данные или запросите новую ссылку.
          </p>
        ) : null}
        <form className="stack" action="/api/auth/request-link" method="post">
          <label htmlFor="magic-email">Рабочий email</label>
          <input id="magic-email" name="email" type="email" autoComplete="email" required />
          <button type="submit">Получить ссылку для входа</button>
        </form>
        <div className="divider">
          <span>для владельца</span>
        </div>
        <form className="stack" action="/api/login/password" method="post">
          <label htmlFor="owner-email">Email</label>
          <input id="owner-email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="owner-password">Пароль</label>
          <input
            id="owner-password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            required
          />
          <button className="secondary" type="submit">
            Войти с паролем
          </button>
        </form>
        <p className="fineprint">
          Нет приглашения? Обратитесь к владельцу пространства. <Link href="/">На главную</Link>
        </p>
      </section>
    </main>
  );
}
