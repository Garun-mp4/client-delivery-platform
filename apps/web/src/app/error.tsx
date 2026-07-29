'use client';

export default function ApplicationError({
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <main className="public-shell">
      <section className="public-card" aria-labelledby="application-error-title">
        <p className="eyebrow">Не удалось загрузить страницу</p>
        <h1 id="application-error-title">Попробуйте ещё раз</h1>
        <p>
          Данные не изменены. Проверьте подключение и повторите действие. Если ошибка повторяется,
          сообщите владельцу рабочего пространства время её появления.
        </p>
        <button type="button" onClick={reset}>
          Повторить
        </button>
      </section>
    </main>
  );
}
