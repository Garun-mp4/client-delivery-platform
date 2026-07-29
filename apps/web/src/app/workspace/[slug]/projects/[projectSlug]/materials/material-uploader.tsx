'use client';

import { useRef, useState } from 'react';

interface Props {
  readonly materialId: string;
  readonly action: string;
  readonly completeBaseUrl: string;
  readonly disabled?: boolean;
}

interface UploadState {
  readonly name: string;
  readonly percent: number;
  readonly state: 'preparing' | 'uploading' | 'pending' | 'error';
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function putFile(url: string, file: File, checksum: string, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    request.setRequestHeader('content-type', file.type);
    request.setRequestHeader('x-amz-meta-client-sha256', checksum);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('UPLOAD_FAILED'));
    request.onerror = () => reject(new Error('UPLOAD_FAILED'));
    request.send(file);
  });
}

export function MaterialUploader({ action, completeBaseUrl, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const files = [...(input.current?.files ?? [])];
    if (files.length === 0 || files.length > 10) {
      setMessage('Выберите от 1 до 10 файлов.');
      return;
    }
    setMessage(null);
    setUploads(files.map((file) => ({ name: file.name, percent: 0, state: 'preparing' })));
    try {
      const checksums = await Promise.all(files.map(sha256));
      const response = await fetch(action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID().replaceAll('-', ''),
          files: files.map((file, index) => ({
            name: file.name,
            mimeType: file.type,
            size: file.size,
            checksum: checksums[index],
          })),
        }),
      });
      if (!response.ok) throw new Error('INIT_FAILED');
      const result = (await response.json()) as {
        uploads: readonly { id: string; url: string }[];
      };
      for (const [index, upload] of result.uploads.entries()) {
        const file = files[index];
        const checksum = checksums[index];
        if (!file || !checksum) throw new Error('UPLOAD_RESPONSE_INVALID');
        setUploads((current) =>
          current.map((item, position) =>
            position === index ? { ...item, state: 'uploading' } : item,
          ),
        );
        await putFile(upload.url, file, checksum, (percent) =>
          setUploads((current) =>
            current.map((item, position) => (position === index ? { ...item, percent } : item)),
          ),
        );
        const completed = await fetch(`${completeBaseUrl}/${upload.id}/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (!completed.ok) throw new Error('COMPLETE_FAILED');
        setUploads((current) =>
          current.map((item, position) =>
            position === index ? { ...item, percent: 100, state: 'pending' } : item,
          ),
        );
      }
      setMessage('Файлы загружены и проверяются. Обновите страницу через несколько секунд.');
      if (input.current) input.current.value = '';
    } catch {
      setUploads((current) =>
        current.map((item) => (item.state === 'pending' ? item : { ...item, state: 'error' })),
      );
      setMessage('Загрузка не завершена. Проверьте тип и размер файлов и попробуйте снова.');
    }
  }

  return (
    <div className="form-grid">
      <label>
        Файлы
        <input
          ref={input}
          type="file"
          multiple
          disabled={disabled}
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.mp4,.txt,.csv"
        />
      </label>
      <p className="field-hint">До 10 файлов за раз, не более 100 MiB каждый.</p>
      <button type="button" onClick={() => void submit()} disabled={disabled}>
        Загрузить материалы
      </button>
      {uploads.length > 0 ? (
        <ul aria-label="Ход загрузки">
          {uploads.map((upload) => (
            <li key={upload.name}>
              <span>{upload.name}</span>{' '}
              <span>
                {upload.state === 'pending'
                  ? 'проверяется'
                  : upload.state === 'error'
                    ? 'ошибка'
                    : `${upload.percent}%`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className={uploads.some((item) => item.state === 'error') ? 'notice error' : 'notice'}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
