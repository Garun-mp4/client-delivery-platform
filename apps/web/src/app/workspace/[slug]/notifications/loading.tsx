export default function NotificationsLoading() {
  return (
    <main className="workspace-shell notification-page" aria-busy="true" aria-live="polite">
      <header className="page-header">
        <div>
          <p className="eyebrow">Центр внимания</p>
          <h1>Загружаем уведомления…</h1>
        </div>
      </header>
      <div className="panel">
        <p className="muted">Собираем последние события рабочего пространства.</p>
      </div>
    </main>
  );
}
