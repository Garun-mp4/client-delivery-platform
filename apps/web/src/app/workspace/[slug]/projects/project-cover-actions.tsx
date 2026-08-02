'use client';

import Link from 'next/link';
import { useState } from 'react';

const unavailableMessages: Record<string, string> = {
  no_version: 'Сначала добавьте версию сайта.',
  check_pending: 'Проверка ссылки ещё не завершена.',
  unsafe: 'Ссылка заблокирована проверкой безопасности.',
  unreachable: 'Сайт недоступен для снимка.',
  password_protected: 'Нужна публичная версия без preview-пароля.',
  not_published: 'Сначала покажите проверенную версию клиенту.',
};

export function ProjectCoverActions({
  projectHref,
  refreshUrl,
}: {
  readonly projectHref: string;
  readonly refreshUrl: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  async function refresh() {
    setMessage('Ставим снимок в очередь…');
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: `manual:${crypto.randomUUID()}` }),
    });
    if (response.ok) {
      setMessage('Снимок обновится после обработки.');
      return;
    }
    const result = (await response.json().catch(() => null)) as {
      error?: { reason?: string };
    } | null;
    setMessage(
      (result?.error?.reason && unavailableMessages[result.error.reason]) ??
        'Откройте проект и проверьте состояние версии.',
    );
  }
  return (
    <details className="project-card-menu">
      <summary aria-label="Действия с обложкой">Обложка</summary>
      <div>
        <Link href={projectHref}>Изменить обложку</Link>
        <button type="button" onClick={() => void refresh()}>
          Обновить снимок
        </button>
        {message ? <small role="status">{message}</small> : null}
      </div>
    </details>
  );
}
