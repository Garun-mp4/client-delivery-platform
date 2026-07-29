import Link from 'next/link';

import { safeRelativeRedirect } from '@garun/core/identity';

import { LoginMethods } from './login-methods';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callback?: string }>;
}) {
  const { error, callback } = await searchParams;
  const safeCallback = safeRelativeRedirect(callback, '/workspace');
  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-card auth-card-wide" aria-labelledby="login-title">
        <Link className="auth-wordmark" href="/">
          Garun Workspace
        </Link>
        <p className="eyebrow">Продолжить работу</p>
        <h1 id="login-title">Войдите удобным способом</h1>
        <p className="lede">
          Владелец обычно использует пароль. Приглашённый клиент может получить одноразовую ссылку.
        </p>
        {error ? (
          <p className="notice error" role="alert">
            Не удалось войти. Проверьте данные или запросите новую ссылку.
          </p>
        ) : null}
        <LoginMethods callback={safeCallback} />
        <p className="fineprint">Нет приглашения? Обратитесь к владельцу пространства.</p>
      </section>
    </main>
  );
}
