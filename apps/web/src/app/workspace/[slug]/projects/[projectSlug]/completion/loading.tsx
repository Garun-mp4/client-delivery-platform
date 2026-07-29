export default function CompletionLoading() {
  return (
    <main className="workspace-shell completion-page" aria-busy="true" aria-live="polite">
      <header className="page-header">
        <div>
          <p className="eyebrow">Финальный контроль</p>
          <h1>Проверяем готовность…</h1>
        </div>
      </header>
      <div className="panel">
        <p className="muted">Проверяем этапы, действия, согласование и передачу.</p>
      </div>
    </main>
  );
}
