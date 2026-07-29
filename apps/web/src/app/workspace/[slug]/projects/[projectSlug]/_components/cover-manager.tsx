'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function put(url: string, file: File, checksum: string) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('content-type', file.type);
    request.setRequestHeader('x-amz-meta-client-sha256', checksum);
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('UPLOAD_FAILED'));
    request.onerror = () => reject(new Error('UPLOAD_FAILED'));
    request.send(file);
  });
}

export function CoverManager({
  coverUrl,
  uploadUrl,
  captureUrl,
  hasManualCover,
  hasCover,
  captureStatus,
  disabled,
}: {
  readonly coverUrl: string;
  readonly uploadUrl: string;
  readonly captureUrl: string;
  readonly hasManualCover: boolean;
  readonly hasCover: boolean;
  readonly captureStatus: string | null;
  readonly disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload() {
    const file = input.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage('Подготавливаем изображение…');
    try {
      const checksum = await sha256(file);
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          file: { name: file.name, mimeType: file.type, size: file.size, checksum },
        }),
      });
      if (!response.ok) throw new Error('INIT_FAILED');
      const result = (await response.json()) as { upload: { id: string; url: string } };
      await put(result.upload.url, file, checksum);
      const completed = await fetch(`${uploadUrl}/${result.upload.id}/complete`, {
        method: 'POST',
      });
      if (!completed.ok) throw new Error('COMPLETE_FAILED');
      setMessage('Изображение проверяется. Текущая обложка сохранится до завершения проверки.');
      if (input.current) input.current.value = '';
    } catch {
      setMessage('Не удалось загрузить изображение. Используйте JPEG, PNG или WebP до 10 MiB.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm('Удалить ручную обложку? Автоматический снимок останется доступен.'))
      return;
    setBusy(true);
    const response = await fetch(coverUrl, { method: 'DELETE' });
    setMessage(response.ok ? 'Ручная обложка удалена.' : 'Не удалось удалить обложку.');
    setBusy(false);
    router.refresh();
  }

  async function capture() {
    setBusy(true);
    const response = await fetch(captureUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: `manual:${crypto.randomUUID()}` }),
    });
    setMessage(
      response.ok
        ? 'Снимок поставлен в очередь. Предыдущая обложка останется до готовности.'
        : 'Нет подходящей опубликованной публичной версии сайта.',
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <section
      className="panel project-cover-manager"
      id="project-cover"
      aria-labelledby="cover-title"
    >
      <div className="project-cover-preview">
        {hasCover ? (
          <Image
            alt="Текущая обложка проекта"
            fill
            sizes="(max-width: 760px) 100vw, 480px"
            src={coverUrl}
            unoptimized
          />
        ) : (
          <span>Обложка пока не добавлена</span>
        )}
      </div>
      <div className="project-cover-controls">
        <p className="section-label">Обложка проекта</p>
        <h2 id="cover-title">Узнаваемый вид в каталоге</h2>
        <p>
          Ручное изображение всегда важнее автоматического снимка. Новая загрузка появится только
          после безопасной проверки.
        </p>
        <label>
          Выбрать изображение
          <input
            ref={input}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={disabled || busy}
          />
        </label>
        <div className="form-actions">
          <button type="button" onClick={() => void upload()} disabled={disabled || busy}>
            Загрузить обложку
          </button>
          <button type="button" onClick={() => void capture()} disabled={disabled || busy}>
            Обновить снимок сайта
          </button>
          {hasManualCover ? (
            <button
              type="button"
              className="button-danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              Удалить ручную
            </button>
          ) : null}
        </div>
        {captureStatus ? <small>Последний снимок: {captureStatus}</small> : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </section>
  );
}
