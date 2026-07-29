'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type DragEvent, useRef, useState } from 'react';

const maxCoverSize = 10 * 1024 * 1024;
const acceptedCoverTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const captureStatusLabels: Record<string, string> = {
  pending: 'Снимок ожидает обработки',
  processing: 'Снимок создаётся',
  succeeded: 'Последний снимок готов',
  failed: 'Не удалось создать последний снимок',
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1).replace('.0', '')} МБ`;
}

function validateCover(file: File) {
  if (!acceptedCoverTypes.has(file.type)) return 'Выберите изображение JPEG, PNG или WebP.';
  if (file.size > maxCoverSize) return 'Размер изображения не должен превышать 10 МБ.';
  return null;
}

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busyAction, setBusyAction] = useState<'upload' | 'capture' | 'remove' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busy = busyAction !== null;

  function selectFile(file: File | undefined) {
    if (!file) return;
    const error = validateCover(file);
    if (error) {
      setSelectedFile(null);
      setMessage(error);
      if (input.current) input.current.value = '';
      return;
    }
    setSelectedFile(file);
    setMessage(null);
  }

  function clearSelection() {
    setSelectedFile(null);
    setMessage(null);
    if (input.current) input.current.value = '';
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    selectFile(event.dataTransfer.files[0]);
  }

  async function upload() {
    const file = selectedFile;
    if (!file) return;
    setBusyAction('upload');
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
      setSelectedFile(null);
      if (input.current) input.current.value = '';
    } catch {
      setMessage('Не удалось загрузить изображение. Используйте JPEG, PNG или WebP до 10 MiB.');
    } finally {
      setBusyAction(null);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm('Удалить ручную обложку? Автоматический снимок останется доступен.'))
      return;
    setBusyAction('remove');
    const response = await fetch(coverUrl, { method: 'DELETE' });
    setMessage(response.ok ? 'Ручная обложка удалена.' : 'Не удалось удалить обложку.');
    setBusyAction(null);
    router.refresh();
  }

  async function capture() {
    setBusyAction('capture');
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
    setBusyAction(null);
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
        <div className="cover-control-section">
          <div className="cover-control-heading">
            <strong>Своя обложка</strong>
            <span>JPEG, PNG или WebP · до 10 МБ</span>
          </div>
          <label
            className={`cover-dropzone${dragging ? ' is-dragging' : ''}${selectedFile ? ' has-file' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!disabled && !busy) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
          >
            <input
              ref={input}
              className="cover-file-input"
              type="file"
              aria-label="Выбрать изображение"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              disabled={disabled || busy}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <span className="cover-upload-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14" />
              </svg>
            </span>
            <span className="cover-dropzone-copy">
              <strong>{selectedFile ? selectedFile.name : 'Перетащите изображение сюда'}</strong>
              <span>
                {selectedFile
                  ? `${formatFileSize(selectedFile.size)} · готово к загрузке`
                  : 'или нажмите, чтобы выбрать файл'}
              </span>
            </span>
            <span className="cover-file-choice">{selectedFile ? 'Заменить' : 'Выбрать файл'}</span>
          </label>
          {selectedFile ? (
            <div className="cover-upload-actions">
              <button type="button" onClick={() => void upload()} disabled={disabled || busy}>
                {busyAction === 'upload' ? 'Загружаем…' : 'Загрузить обложку'}
              </button>
              <button
                type="button"
                className="button-link"
                onClick={clearSelection}
                disabled={busy}
              >
                Отменить выбор
              </button>
            </div>
          ) : null}
        </div>

        <div className="cover-automatic-section">
          <div>
            <strong>Автоматический снимок сайта</strong>
            <span>Первый экран последней опубликованной версии</span>
            {captureStatus ? (
              <small className={`cover-capture-status is-${captureStatus}`}>
                {captureStatusLabels[captureStatus] ?? 'Статус снимка обновлён'}
              </small>
            ) : null}
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => void capture()}
            disabled={disabled || busy}
          >
            {busyAction === 'capture' ? 'Ставим в очередь…' : 'Обновить снимок'}
          </button>
        </div>

        {hasManualCover ? (
          <div className="cover-management-footer">
            <span>Сейчас используется загруженная вручную обложка.</span>
            <button
              type="button"
              className="cover-remove-action"
              onClick={() => void remove()}
              disabled={busy}
            >
              {busyAction === 'remove' ? 'Удаляем…' : 'Удалить ручную обложку'}
            </button>
          </div>
        ) : null}
        {message ? (
          <p className="cover-feedback" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
