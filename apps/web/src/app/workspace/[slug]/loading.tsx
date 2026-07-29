export default function WorkspaceLoading() {
  return (
    <main className="workspace-shell" aria-busy="true" aria-label="Загрузка страницы">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="skeleton skeleton-panel" />
    </main>
  );
}
