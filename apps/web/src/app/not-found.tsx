import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="public-shell">
      <section className="public-card" aria-labelledby="not-found-title">
        <p className="eyebrow">Страница недоступна</p>
        <h1 id="not-found-title">Здесь ничего нет</h1>
        <p>
          Ссылка могла устареть, либо у вас нет доступа. Мы не раскрываем существование чужих
          рабочих пространств и проектов.
        </p>
        <Link className="button-primary" href="/workspace">
          Вернуться в рабочее пространство
        </Link>
      </section>
    </main>
  );
}
