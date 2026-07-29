'use client';

import Link from 'next/link';
import { useState } from 'react';

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
    setMessage(
      response.ok ? 'Снимок обновится после обработки.' : 'Нет подходящей опубликованной версии.',
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
