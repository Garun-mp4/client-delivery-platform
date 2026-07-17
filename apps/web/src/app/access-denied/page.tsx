import Link from 'next/link';
export default function AccessDeniedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Доступ закрыт</p>
        <h1>Нет активного пространства</h1>
        <p className="lede">
          Ваша сессия действительна, но активное участие в workspace не найдено.
        </p>
        <form action="/api/logout" method="post">
          <button type="submit">Выйти</button>
        </form>
        <Link className="text-link" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
