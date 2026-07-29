import Link from 'next/link';
export default function AcceptedPage() {
  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-card">
        <p className="eyebrow">Приглашение принято</p>
        <h1>Доступ уже создан</h1>
        <p className="lede">
          Автоматический вход не завершился. Запросите обычную одноразовую ссылку — повторно
          принимать приглашение не потребуется.
        </p>
        <Link className="text-link" href="/login">
          Получить ссылку для входа
        </Link>
      </section>
    </main>
  );
}
