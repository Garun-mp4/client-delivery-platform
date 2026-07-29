import Link from 'next/link';
import { SubmitButton } from '@/app/_components/submit-button';

export default function AccessDeniedPage() {
  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-card">
        <p className="eyebrow">Доступ закрыт</p>
        <h1>Нет активного пространства</h1>
        <p className="lede">
          Ваша сессия действительна, но активное участие в workspace не найдено.
        </p>
        <form action="/api/logout" method="post">
          <SubmitButton pendingText="Выходим…">Выйти</SubmitButton>
        </form>
        <Link className="text-link" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
