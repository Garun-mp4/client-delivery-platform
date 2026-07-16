import Link from 'next/link';

export default function SentPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Письмо подготовлено</p>
        <h1>Проверьте почту</h1>
        <p className="lede">
          Если этот адрес имеет доступ, ссылка для входа появится в письме. Она одноразовая и
          действует недолго.
        </p>
        <Link className="text-link" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
