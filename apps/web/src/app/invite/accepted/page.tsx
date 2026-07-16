import Link from 'next/link';
export default function AcceptedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Приглашение принято</p>
        <h1>Теперь проверьте почту</h1>
        <p className="lede">Мы отправили отдельную одноразовую ссылку для входа.</p>
        <Link className="text-link" href="/login">
          Перейти ко входу
        </Link>
      </section>
    </main>
  );
}
