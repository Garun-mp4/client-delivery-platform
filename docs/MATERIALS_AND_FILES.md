# Материалы и безопасные файлы

## Пользовательский workflow

1. Внутренний участник с `project.edit` создаёт запрос материала, назначает клиента, категорию и срок.
   В той же транзакции создаются `ActionItem`, audit event и notification outbox event.
2. Назначенный клиент создаёт новую `MaterialRevision`. Для каждого файла сервер резервирует quota,
   создаёт случайный object key и возвращает короткий presigned PUT.
3. Браузер загружает bytes прямо в приватное object storage и подтверждает завершение. Сервер через
   HEAD повторно проверяет размер, MIME declaration и checksum metadata.
4. До проверки `FileObject` имеет `pending/scanning`; имя, preview и download URL клиентскому DTO не
   выдаются. Worker сверяет SHA-256, определяет MIME по содержимому и вызывает scanner adapter.
5. Заражённый или несовместимый файл получает `rejected/failed`. Временный сбой повторяется до пяти
   раз с exponential backoff; зависшая scanning-задача возвращается в очередь через пять минут.
6. Для чистого изображения worker создаёт WebP preview через `sharp`: auto-rotation выполняется, EXIF
   и прочие исходные metadata не копируются. PDF preview открывает проверенный оригинал inline.
7. Перевод файла в `available`, завершение всей редакции, закрытие ActionItem, audit и domain outbox
   выполняются одной PostgreSQL-транзакцией.
8. Внутренний участник принимает редакцию или просит уточнение. Новая принятая редакция помечает
   предыдущую `replaced`, но не изменяет и не удаляет её.

## Границы доступа

- `workspaceId` не принимается из body. Tenant разрешается из session и active workspace membership;
  проект — через `resolveProjectAccess`.
- Upload разрешён только назначенному client project member. Идентификаторы material/file из URL
  повторно сопоставляются с tenant, project и uploader.
- До `available + clean` запрос файла возвращает одинаковый безопасный `404`.
- Download route не проксирует bytes и не возвращает storage key. После авторизации он выдаёт
  presigned GET на 60 секунд с `Content-Disposition: attachment`; inline разрешён только для
  проверенного image/PDF preview.
- Presigned PUT связывает content length, content type и `x-amz-meta-client-sha256`. CSP и MinIO CORS
  содержат только явно настроенные origins, без wildcard.
- Composite foreign keys не позволяют связать FileObject/MaterialRevision с другим workspace или
  project. `material.currentRevisionId` дополнительно связан с тем же material/project/workspace.
- Background processing всегда переносит tenant/project context из FileObject; raw file contents,
  signed URLs, credentials и имена файлов не попадают в логи/outbox.

## Ограничения и retention

- Defaults: `FILE_MAX_BYTES=104857600`, `WORKSPACE_QUOTA_BYTES=10737418240`.
- Quota резервируется по declared size под блокировкой workspace и учитывает initiated, uploaded,
  scanning и available objects. HEAD и worker не доверяют declared bytes.
- Незавершённые uploads после `INCOMPLETE_UPLOAD_RETENTION_HOURS` переводятся в deleted и удаляются
  из object storage идемпотентным cleanup job.
- Общая policy физического удаления пользовательских файлов после 30-дневного grace period
  остаётся конфигурируемой, но UI удаления файлов не входит в Milestone 06.
- ZIP и неизвестные бинарные форматы не входят в allowlist, поэтому archive bombs не поступают в
  scanner pipeline. HTML не разрешён. MP4 скачивается attachment и preview не генерируется.
- Production provider и scanner deployment пока предварительны; adapters совместимы с R2/S3 и
  ClamAV TCP protocol, но реальные accounts/credentials не создавались.

## Модель данных

```text
Project 1 ── * Material 1 ── * MaterialRevision
                           │          │
                           │          * FileLink * ── 1 FileObject
                           │
                           └── currentRevisionId (same material/project/workspace)

Questionnaire 1 ── * FileLink * ── 1 FileObject
```

`FileLink` имеет ровно один context: material revision либо questionnaire field. История версий
append-only на service layer; current/final — явные projections, а не удаление старой редакции.

## Проверка

```powershell
docker compose up -d --build --wait
pnpm test
pnpm test:integration
pnpm build
pnpm verify:artifacts
pnpm test:e2e
pnpm smoke
```

Integration suite проверяет clean/infected ClamAV, quota, quarantine privacy, idempotency,
cross-tenant/forged IDs и инфраструктуру. E2E реально выполняет browser PUT в MinIO, ожидает worker
scan, скачивает signed attachment, принимает редакцию и проверяет file field анкеты и axe-core.
