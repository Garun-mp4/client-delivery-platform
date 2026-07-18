# Статус реализации

Последнее обновление: 2026-07-18
Общий статус: Milestones 00–06 и UX stabilization Milestone 06.5 завершены

## Текущий milestone

**Milestone 06.5 — UX foundation, application shell и производительность — завершён в
`feat/milestone-06-5-ux-foundation`.** Реализованы role-based overview/navigation, signature
`ProjectRoute`, единая дизайн-система, упрощённый первый путь и production-oriented performance
review. Milestone 07 не начат.

## Завершённые задачи

- Добавлены понятный public entry, выбор password/magic-link без двух последовательных писем,
  role-based application shell и отдельные overview владельца и клиента.
- Созданы desktop sidebar, mobile header/bottom navigation, локальная навигация проекта и
  `ProjectRoute` с состоянием, ответственностью, следующим результатом и нативным progress.
- Настройки, участники, приглашения и archive вынесены в progressive disclosure; основные формы
  получили pending/duplicate-submit protection, а access actions возвращают пользователя в раздел
  «Доступ».
- Дизайн переведён на общие warm-paper/graphite/green tokens; UI package синхронизирован с системой,
  contrast исправлен по axe desktop/mobile.
- Tenant resolution внутри layout/page дедуплицирован через React `cache`; добавлены loading
  skeleton, skip targets и reduced-motion/mobile правила.
- Добавлены `Material`, `MaterialRevision`, `FileObject` и `FileLink` с tenant/project composite
  constraints, историей ревизий и отдельными current/final projections.
- Реализованы material requests, назначение клиенту, связанный `ActionItem`, audit/outbox событие,
  ответы файлом, текстом или ссылкой, review `accept/clarify`, замена версии и сохранение истории.
- Добавлен `packages/storage` с S3-compatible adapter для MinIO/R2, приватным bucket, короткими
  presigned PUT/GET, подписанными length/MIME/checksum metadata и повторной авторизацией download.
- Реализованы allowlist и server-side MIME sniffing, нормализация имени, random object key,
  конфигурируемые лимит 100 MiB и quota 10 GiB с резервированием initiated uploads.
- Worker выполняет claims через PostgreSQL `SKIP LOCKED`, SHA-256, MIME verification, ClamAV scan,
  retries/backoff, reclaim зависших jobs, WebP preview с удалением EXIF и атомарный переход в
  `available` вместе с revision/action/audit/outbox.
- Файлы `pending/scanning` не попадают в клиентские DTO и не получают download URL; заражённые и
  исчерпавшие retry файлы остаются недоступными.
- Добавлена безопасная очистка незавершённых uploads; временный сбой БД или storage логируется
  стабильным кодом и не создаёт необработанный background rejection.
- Поля анкет `file` и `image` включены через тот же quarantine pipeline и проверяются при submit.
- Добавлена русскоязычная mobile-friendly страница материалов с поиском по metadata/category,
  multi-upload, progress, review, preview image/PDF и signed download.
- Readiness web проверяет PostgreSQL, Redis и storage; readiness worker дополнительно проверяет
  scanner. Liveness не зависит от внешних сервисов.
- Локальный Compose дополнен ClamAV и idempotent storage initialization; CORS и CSP разрешают только
  настроенный origin object storage.
- Созданы миграции `0008`–`0011`, ADR-035–037, `docs/MATERIALS_AND_FILES.md` и обновлены README,
  env examples, CI и Docker build context.

## Текущие задачи

- Подготовить Pull Request и дождаться итогового CI для ветки Milestone 06.5.
- Milestone 07 не начат.

## Найденные проблемы

- UX E2E обнаружил недостаточный contrast вторичного текста; токены усилены до WCAG AA.
- После административных действий redirect возвращал владельца на overview вместо исходного раздела;
  invitation/member actions теперь возвращаются в «Доступ», а client invitation повторно раскрывает
  соответствующий блок.
- Внутренний member без project assignment видел ссылку «Сеансы», но получал 404. Tenant-backed
  session management больше не зависит от project membership.
- Первый локальный E2E-запуск выполнялся со старым `apps/web/.env` без storage-переменных и CSP
  блокировал browser PUT. Повторная проверка использовала полный набор из актуального `.env.example`;
  чистая установка и CI уже задают эти переменные явно.
- Generated migrations первоначально создавали tenant composite foreign keys раньше supporting
  unique indexes. SQL переупорядочен; полный путь `0000`–`0011` проверен на чистой PostgreSQL 17.
- Исторические membership foreign keys использовали `RESTRICT`, поэтому очистка integration fixtures
  конфликтовала с новыми material references. Добавлена явная upgrade migration `0011`, меняющая
  только нужные связи на `CASCADE`.
- MinIO не реализует S3 `PutBucketCors` и возвращает 501. Local CORS задаётся явной переменной
  контейнера с разрешёнными origins; adapter не маскирует другие ошибки.
- Первые presigned PUT не подписывали browser-controlled headers, из-за чего MinIO отвергал metadata
  и Content-Type. Headers переведены в signable/unhoistable contract и проверены реальной загрузкой.
- CSP сначала блокировал прямой browser PUT. Настроенный storage origin добавлен в `connect-src`;
  `upgrade-insecure-requests` включается только для HTTPS public application URL.
- Worker SQL имел неоднозначный вывод enum/JSON параметров в PostgreSQL. Добавлены явные casts,
  переход `available` сделан транзакционным.
- Questionnaire submit повторно разбирал schema с отключёнными file fields. Для Milestone 06
  серверный re-parse явно разрешает file/image и всё равно проверяет ownership/status.
- Stateful E2E-сценарии случайно дублировались mobile Playwright project. Они запускаются один раз со
  своей mobile viewport; foundation/axe остаются desktop+mobile.
- Финальный integration-запуск дважды остановился до полного набора из-за неполной локальной команды:
  сначала отсутствовал `TEST_DATABASE_URL`, затем `TEST_MINIO_*`. После задания документированного
  набора переменных тесты прошли 26/26; дефекта приложения эти попытки не выявили.
- Финальный review обнаружил возможность необработанного rejection при отказе БД во время записи
  retry-состояния или cleanup query. Оба пути теперь перехватываются и безопасно логируются.

## Принятые решения

- ADR-038: один role-based shell и `ProjectRoute` являются общей UX-основой без ослабления server
  policies или tenant isolation.
- ADR-039: performance оценивается на production build; development cold compilation фиксируется
  отдельно и не считается production latency.
- ADR-035: прямой приватный upload/download через заменяемый S3-compatible adapter; web не
  проксирует файлы до 100 MiB.
- ADR-036: обязательный асинхронный quarantine pipeline; публикация при недоступном scanner
  запрещена, PostgreSQL является текущей job queue.
- ADR-037: material revisions append-only, quota резервируется до upload, файловые поля анкет
  используют тот же `FileObject`.
- Local incomplete upload retention — 24 часа; значение конфигурируемо. Production storage/scanner и
  окончательная retention policy остаются предварительными.
- Новые production dependencies ограничены `packages/storage` (`@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`) и worker (`sharp`); причины и альтернативы записаны в ADR.

## Выполненные проверки

- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test` — успешно; core 35/35, storage 5/5, остальные unit suites зелёные.
- Чистая БД `garun_m06_final`: migrations `0000`–`0011` применены успешно; `pnpm db:generate`
  сообщил `No schema changes`.
- `pnpm test:integration` — 26/26 после корректной настройки test env; проверены реальные
  PostgreSQL, Redis, MinIO, Mailpit, clean/EICAR ClamAV, quota, transactions и tenant/IDOR.
- `pnpm build` и `pnpm verify:artifacts` — успешно; production web собран, worker artifact не
  импортирует workspace TypeScript source.
- `pnpm test:e2e` — 17/17; material path включает приглашение клиента, browser PUT, quarantine,
  реальный scan, signed download, acceptance, IDOR denial и axe smoke.
- UX regression suite — 19/19 на production build: entry/login desktop+mobile, role-based shell,
  password/magic-link, invitations, project workflow, questionnaires, materials, session loss и axe.
  Отдельный targeted identity rerun — 2/2 после исправления доступа member к собственным сессиям.
- `docker compose -f infra/compose.yaml up -d --build --wait` — успешно; migration/storage-init
  exited 0, web/worker/PostgreSQL/Redis/MinIO/Mailpit/ClamAV healthy.
- `pnpm smoke` — web и worker успешно. Liveness не раскрывает зависимости; readiness показывает
  только безопасные статусы `database/redis/storage/scanner`.
- `pnpm audit --prod` — известных уязвимостей нет.
- `git diff --check`, tracked artifact scan, high-confidence secret scan, Compose log scan,
  type-suppression scan — успешно.
- Workspace dependency graph проверен как ацикличный.

## Следующие действия

1. Создать Pull Request ветки `feat/milestone-06-5-ux-foundation` и дождаться зелёного CI.
2. После merge и отдельного подтверждения перейти к Milestone 07 — обновления, версии сайта и review
   loop.

## Известные ограничения

- Production RUM/APM ещё не подключён: окончательные latency percentiles появятся после выбора
  hosting и наблюдаемости. Локальные production E2E измерения зафиксированы в `docs/UX_FOUNDATION.md`.
- Cloudflare R2, production ClamAV deployment, домен и реальные credentials не создавались; они
  остаются предварительными provider choices.
- Multipart/resumable upload не входит в Milestone 06; один файл ограничен 100 MiB.
- PDF preview использует проверенный оригинал inline; отдельный raster thumbnail создаётся только для
  изображений.
- Physical purge после 30-day deleted-file grace и пользовательский UI удаления относятся к
  последующей retention/operations работе; очистка незавершённых uploads уже работает.
- Глубокий content search, public shares, cloud-drive integrations, client-side editing и ZIP export
  намеренно не входят в milestone.
- RLS отложен; isolation обеспечивается server policies, scoped services, composite constraints и
  cross-tenant/IDOR tests.
