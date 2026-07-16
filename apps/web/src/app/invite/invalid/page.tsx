import Link from 'next/link';
export default function InvalidInvitePage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Ссылка недействительна</h1>
        <p className="lede">Она могла быть использована или отозвана.</p>
        <Link className="text-link" href="/login">
          Ко входу
        </Link>
      </section>
    </main>
  );
}
