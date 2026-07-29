# Статус реализации

Последнее обновление: 2026-07-29
Общий статус: Milestones 00–10 и UX stabilization 06.5 объединены с `main`; внешний
staging/pilot ожидает инфраструктуру

## Текущий milestone

**Milestone 10 — production readiness и первый пилот: инженерная часть объединена с `main`.**
Экспорт истории, observability, backup/restore, performance/security automation и pilot runbook
готовы. Feature CI `30487810446` завершён успешно. Внешняя приёмка требует развёртывания
предварительно выбранной production-like инфраструктуры и проведения реального пилота; домен,
платные сервисы и production secrets не создавались.

## Завершённые задачи

- Добавлена project feed модель с client/internal visibility, важностью и одним pin на видимость.
- Добавлена append-only `SiteVersion`: последовательный номер, окружение, changelog, инструкции,
  публичный/password access и история старых опубликованных версий.
- Worker асинхронно выполняет SSRF-safe URL check: проверяет scheme/port, все DNS IPv4/IPv6,
  специальные диапазоны и каждый redirect, закрепляет соединение за проверенным IP и применяет
  timeout/redirect limits.
- Security и availability URL хранятся отдельно. Unsafe URL не имеет override; safe-but-unreachable
  требует явного подтверждения. Проверка старше 10 минут перед публикацией инвалидируется.
- Preview secret хранится только зашифрованным и раскрывается динамической server page после
  повторной tenant/project policy; URL, пароль и полный ответ сайта не пишутся в audit/log.
- Реализован `FeedbackItem` с version/page/screenshot/priority/classification и явной state machine
  `new → … → awaiting_verification → closed`.
- `potential_change` отделён от change request; Milestone 08 и коммерческий workflow не начаты.
- `Comment` отделён от workflow: client/internal visibility, edit marker и tombstone; client query
  исключает internal replies до serializer/render.
- Скриншот замечания может ссылаться только на собственный clean/available файл того же
  workspace/project.
- Добавлены русскоязычный mobile-friendly review screen, pending/empty/error states, new-tab fallback,
  owner publication controls и клиентские действия проверки.
- Каждая значимая мутация tenant-scoped, проходит server policy и создаёт audit/outbox event.
- Исправлена конкуренция Better Auth rate limit: публичный magic-link остаётся 5/min, внутреннее
  создание session после уже валидного invitation имеет отдельный защищённый лимит.
- Созданы миграции `0012`–`0014`, ADR-040–041 и `docs/REVIEW_LOOP.md`; README обновлён.
- Каталог проектов переработан в server-rendered карточный/компактный обзор с поиском, фильтрами,
  сортировкой, URL-state и пагинацией по 24 проекта без per-card N+1.
- Добавлены отдельная страница создания проекта, role-specific workflow projection и карточка со
  стадией, прогрессом, ответственностью, следующим результатом, сроком и активностью.
- Реализованы private manual/automatic project covers, quarantine activation, Sharp WebP,
  same-origin delivery, capture queue и SSRF-safe Chromium renderer adapter.
- Управление обложкой разделено на понятные сценарии: доступная с клавиатуры dropzone с
  drag-and-drop, проверкой типа/размера и состоянием выбранного файла; автоматический снимок и
  удаление ручной обложки вынесены в отдельные аккуратные действия с русскими статусами.
- Добавлена migration `0015`, ADR-043, cover permissions/ER и документация renderer flow.
- Добавлен общий approval workflow для scope/stage/site version/project-visible file/final
  handover: immutable snapshot/checksum, явные approvers, `any_one`/`all_required`.
- Решение выполняется назначенным client approver в serializable/idempotent transaction; owner
  может только отменить request или записать отдельный `recorded_externally`.
- Stage/scope outcome, progress, audit и outbox изменяются атомарно; blocking feedback и stale
  entity revision блокируются, новая revision инвалидирует pending request.
- Добавлены client-safe approvals/activity UI, HMAC network fingerprint без raw IP, migration
  `0016`, ADR-045 и `docs/APPROVALS_AND_AUDIT.md`.
- Старый экран scope также требует явного подтверждения ознакомления; клиентская activity
  ограничена только назначенными этому пользователю requests и не раскрывает чужие события.
- Добавлен tenant-scoped центр уведомлений с прочитанным состоянием, относительными deep links,
  безопасным role-specific содержимым, пользовательскими email/reminder-настройками, timezone и
  quiet hours.
- Transactional outbox передаёт задания в BullMQ с идемпотентными job ID, retry/backoff и
  диагностируемыми delivery statuses; доступ получателя повторно проверяется перед отправкой.
- Worker создаёт дедуплицированные уведомления о назначениях, материалах, согласованиях, review и
  завершении; автор события не уведомляется о собственном действии.
- Добавлены ежедневные due-soon/overdue reminders с подавлением после завершения, архивации,
  отключения preference или потери доступа.
- Реализован completion gate: обязательные этапы, отсутствие открытых blocking actions, финальное
  согласование и фиксированный checklist передачи. Финансовый gate не применяется без payment
  module.
- Завершение, archive и restore выполняются транзакционно и идемпотентно с audit/outbox; архив
  остаётся read-only и восстанавливает точный предыдущий статус.
- Добавлены migration `0017`, ADR-046 и `docs/NOTIFICATIONS_AND_COMPLETION.md`.
- Добавлен приватный tenant-scoped экспорт истории проекта: role-specific snapshot, Markdown/HTML,
  manifest и разрешённые clean/available вложения упаковываются worker в `tar.gz`.
- Export job имеет immutable audience, idempotency key, retry/backoff, лимиты размера/вложений,
  TTL 24 часа, audit/outbox и авторизованную same-origin выдачу без публичных object URL.
- Добавлены русскоязычный mobile-friendly экран экспорта, безопасные pending/failed/expired states,
  rate limit и E2E-проверка реального gzip-артефакта.
- Worker публикует безопасные агрегированные метрики очередей/ошибок без tenant, URL, payload,
  токенов и персональных данных.
- Добавлены автоматизированные performance fixtures на 100/5 000/10 000 записей, secret scan
  tracked/untracked файлов и реальная проверка backup → restore → required tables.
- Добавлены staging templates, deployment/rollback, incident response, backup/restore,
  observability, security, architecture, API/storage/notification справочники и pilot runbook.
- Добавлена pilot seed-команда с явными входными параметрами без встроенных credentials.
- Создана migration `0018` для `export_job`, ADR-047–048 и документация экспорта/передачи.
- Финальный review исправил SQL bind для project-wide notification events; зависшие локальные
  outbox-события повторно обработаны и перешли в `delivered`.

## Текущие задачи

- Подготовить реальные staging credentials/configuration только после выбора и создания внешней
  инфраструктуры владельцем проекта.
- Провести smoke, backup/restore drill и пилотный клиентский проект на staging по
  `docs/PILOT_RUNBOOK.md`.
- Не начинать Milestone 11 до завершения внешнего release gate или отдельного решения владельца.

## Найденные проблемы

- Первая версия migration создавала composite foreign keys раньше supporting unique indexes. SQL
  `0012` переупорядочен и полностью применён на чистой PostgreSQL 17.
- Integration cleanup выявил конфликт `RESTRICT` membership-author foreign keys при cascade удаления
  тестового workspace. Для новых сущностей добавлена явная migration `0013`, согласующая delete
  semantics с существующими domain tables; пользовательские memberships удаляются soft-disable.
- После добавления freshness gate integration fixture не задавала `checkedAt`; fixture исправлена и
  теперь проверяет актуальный safe result.
- Первый полный E2E не дождался письма за 5 секунд при параллельной outbox-нагрузке. Poll timeout
  приведён к уже используемому integration SLA без ослабления assertion.
- Второй полный E2E выявил общий Better Auth plugin limit для публичного magic-link и внутреннего
  session flow принятого invitation. Membership создавался, но session fallback уводил на общую
  страницу. Потоки получили отдельные лимиты; повторный полный E2E прошёл 20/20.
- Финальный review выявил конфликт повторной публикации уже видимой версии с freshness constraint и
  исчерпание retry counter при новой проверке. Публикация стала идемпотентной, новый check cycle
  сбрасывает счётчик, а история допускает одинаковый относительный номер попытки в разных циклах.
- Первый `pnpm db:generate` в текущей shell завершился ошибкой из-за отсутствующего `DATABASE_URL`.
  После явного test URL команда прошла и подтвердила отсутствие drift.
- Проверка после merge обнаружила новые runtime advisories Next.js и Sharp; зависимости обновлены
  до исправленных версий. Безопасного совместимого обновления dev-only ESLint-цепочки для
  `GHSA-mh99-v99m-4gvg` пока нет: глобальный override ломает minimatch 3, ESLint 10 — React plugin.
- Первая пересборка Docker завершилась внешней ошибкой Docker Desktop `rpc Unavailable: EOF`;
  повторная сборка с тем же lockfile и cache прошла. Первый integration run сразу после тяжёлой
  сборки исчерпал 10-секундный setup timeout; повторный прогон на прогретой БД прошёл 29/29 без
  изменения тестов или timeout.
- Первый E2E Milestone 07.5 выявил, что production CSP не включал локальный default storage origin,
  если он применялся runtime validator, а не был явно записан в `.env`. Локальный/test allowlist
  теперь использует тот же безопасный `127.0.0.1:9000`; тест проверяет точный `connect-src`.
- Первый PNG fixture имел libpng read error при полном Sharp decode, хотя header metadata читалась.
  Fixture заменена реальным Sharp-generated PNG; cover upload проверяет полный scanner/preview flow.
- Docker Desktop запрещает namespace sandbox non-root Chromium. Выдача `SYS_ADMIN` отклонена;
  локально browser остаётся non-root в container boundary и без прямой сети, а production hardened
  sandbox зафиксирован обязательным deployment review.
- После успешной постановки cover capture Docker DNS один раз вернул web-контейнеру
  `getaddrinfo EAI_AGAIN postgres`. Capture завершился и данные не пострадали, но read projection
  показал dev error overlay. ADR-044 добавляет узкий retry только для идемпотентного чтения страницы;
  SQL/domain errors и mutations не повторяются.
- Первый generate Milestone 08 без `DATABASE_URL` ожидаемо завершился validation error; повтор с
  явным local URL создал migration.
- Drizzle сгенерировал composite FK раньше supporting unique indexes. Migration `0016` вручную
  переупорядочена и успешно применена на чистой PostgreSQL 17; повторный generate подтвердил
  отсутствие schema drift.
- Первый integration run был запущен после неуспешной migration и без полного набора service env,
  поэтому таблицы/MinIO variables отсутствовали. После исправления migration и окружения полный
  прогон прошёл 34/34. При параллельном cold setup 10-секундный hook timeout оказался недостаточен;
  setup-only лимит поднят до 30 секунд, test timeout не ослаблялся.
- Первый финальный integration run был запущен в новой PowerShell-сессии без экспортированных
  `TEST_*` variables и завершился до выполнения тестов. Повтор с явным окружением Compose прошёл
  35/35.
- Первый полный E2E Milestone 08 выявил ошибку маршрута в расширенном тесте: после согласования он
  оставался на странице approvals, но проверял workflow action. Тест стал явно открывать workflow;
  целевой прогон прошёл 1/1, полный — 20/20.
- Compose rebuild дважды не вернул build output за десять минут из-за зависшего Docker Desktop.
  После безопасного restart выяснилось, что новый image был собран; запуск без повторной сборки
  завершил migration/storage-init и все healthchecks успешно.
- Финальный integration review Milestone 09 обнаружил запрос к несуществующей
  `workspace.owner_user_id`. Получатели-владельцы теперь определяются через активный
  `workspace_membership.role = owner`; полный повторный прогон прошёл 43/43.
- Первый smoke после свежей Compose-сборки превысил 30 секунд из-за холодной компиляции Turbopack.
  После завершения compile корень отвечал за 141 ms, повторный smoke прошёл без ошибок.
- Два integration запуска были некорректно начаты без полного `TEST_*` окружения и с неверным
  локальным паролем; тесты безопасно отказались работать. Повтор выполнен с документированным
  Compose-окружением и прошёл полностью.
- Первый CI Milestone 09 подтвердил все 39 integration assertions, но cleanup нового suite нарушил
  намеренный `RESTRICT` immutable approval history при удалении тестового workspace. Cleanup теперь
  явно удаляет tenant-scoped approval requests до workspace; production delete semantics не
  ослаблялись.
- Следующий CI подтвердил integration 43/43, но тот же явный cleanup требовался E2E-fixture перед
  удалением проекта. Browser-сценарий теперь также сначала удаляет созданный им approval request;
  production foreign keys остаются `RESTRICT`.
- Первый export E2E обнаружил PostgreSQL date, возвращаемый как `Date`, и несовместимый тип enum в
  retry update. Даты нормализуются на data boundary, статусы имеют явные casts; реальные jobs
  завершились `succeeded`.
- Параллельный export E2E сохранял rate-limit state между прогонами. Global setup теперь очищает
  только детерминированный test key после явного Redis connect; production limit не ослаблялся.
- Первый clean migration запуск использовал устаревший пароль старого Docker volume и не дошёл до
  БД. Независимая временная роль/БД подтвердила успешное применение migrations `0000`–`0018`.
- Review Compose-логов выявил SQL bind mismatch для событий `project.completed`,
  `project.archived`, `site_version.published` и `feedback.created`: передавался aggregate ID без
  ссылки на `$4` в общей ветке запроса. Запрос исправлен, добавлен regression integration test;
  шесть локальных failed событий безопасно повторены и доставлены.
- Security review автономного HTML-экспорта добавил собственный allowlist HTTP(S) для `href`:
  повреждённая legacy-запись с иной схемой остаётся текстом и не становится активной ссылкой.

## Принятые решения

- ADR-040: URL security и availability — разные оси; публикация использует свежий SSRF-safe result,
  версии append-only, а workflow принадлежит `FeedbackItem`, не `Comment`.
- ADR-041: внутренний invitation-to-session flow имеет отдельный rate limit, не ослабляя публичный
  magic-link и endpoint принятия приглашения.
- Основной review UX не зависит от iframe: new-tab всегда доступен, iframe capability оценивается
  консервативно по X-Frame-Options/CSP.
- PostgreSQL остаётся текущей лёгкой job queue; новая production dependency или микросервис не
  добавлялись.
- ADR-042: runtime advisories исправляются обновлением Next.js/Sharp; единственное исключение audit
  ограничено dev-only ESLint advisory и документировано до совместимого upstream-обновления.
- ADR-043: project covers приватны; приоритет manual → automatic → empty; renderer является
  adapter и загружает каждый browser resource только через SSRF-safe IP-pinned transport.
- ADR-044: временные DB connection errors повторяются только на границе цельного read-only server
  render; mutation retry по умолчанию запрещён.
- ADR-045: approval хранит exact entity/acknowledgement snapshot; решение client approver
  serializable и идемпотентно, `recorded_externally` остаётся отдельной immutable сущностью.
- ADR-046: PostgreSQL остаётся durable transactional outbox, BullMQ отвечает только за delivery
  scheduling/retries; notification content allowlisted, а completion/archive используют отдельные
  server policies и транзакционные gates.
- ADR-047: project history export создаётся асинхронно, фиксирует audience при запросе, хранится
  приватно с коротким TTL и никогда не расширяет права вызывающего пользователя.
- ADR-048: production readiness опирается на provider-neutral adapters, безопасные aggregate
  metrics, проверяемый backup/restore и конфигурационные staging templates без реальных секретов.

## Выполненные проверки

- `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` — успешно; core
  39/39, worker 18/18, web 14/14 и остальные suites зелёные.
- `pnpm db:generate` — `No schema changes`; migrations `0000`–`0014` применены к чистой базе
  `garun_m07_verify` без ошибок.
- `pnpm test:integration` — 29/29 на реальных PostgreSQL, Redis, MinIO, Mailpit и ClamAV.
- `pnpm build` — production Next.js и worker собраны; `pnpm verify:artifacts` подтвердил отсутствие
  workspace TypeScript imports в worker artifact.
- `pnpm test:e2e` — итоговый полный прогон 20/20; review path включает client invitation, publication,
  structured feedback, owner transitions, client close и axe.
- `docker compose up -d --build --wait` — migration/storage-init exited 0; web, worker, PostgreSQL,
  Redis, MinIO, Mailpit и ClamAV healthy.
- `pnpm smoke` — web/worker passed; `pnpm audit --prod` — runtime advisories отсутствуют, один
  документированный dev-only advisory ESLint toolchain игнорируется по ADR-042.
- Финальная post-merge проверка 2026-07-29: frozen install, format, lint, typecheck, unit tests,
  migration drift, build/artifact, integration 29/29, E2E/a11y 20/20, Compose healthchecks и smoke
  прошли на Next.js `16.2.11` и Sharp `0.35.3`.
- GitHub Actions run `29655680474` для commit `5eb60ef` — успешно; install, audit, format, lint,
  typecheck, migration drift/apply, unit, integration, build, artifact, browser/a11y и smoke зелёные.
- `git diff --check`, tracked env/artifact scan, high-confidence secret scan, type-suppression scan и
  Compose error/secret log scan — успешно.
- Milestone 07.5: frozen install, format, lint, strict typecheck и unit suites успешны; core 41/41,
  worker 19/19, web 14/14.
- Migration `0015` применена вместе с `0000`–`0014` на чистой `garun_m075_verify`; 16 migration
  records, повторный `db:generate` — `No schema changes`.
- Integration 30/30; production web/worker build и artifact verification успешны.
- Полный Playwright E2E/a11y 20/20; manual cover прошёл upload → quarantine → activation → private
  read → delete, а automatic capture `example.com` завершился за одну попытку и создал result asset.
- Compose rebuild/healthchecks и web/worker smoke успешны. `pnpm audit --prod` не нашёл runtime
  advisory; один документированный high dev-only ESLint advisory игнорируется по ADR-042.
- Regression после временного Docker DNS failure: новый unit suite для read retry 2/2, повторные
  format/lint/typecheck/unit/integration/build/artifact проверки, project E2E 1/1, Compose
  healthchecks и smoke успешны; свежие логи не содержат повторного `EAI_AGAIN` или чувствительных
  значений.
- UX review cover manager: format/lint/strict typecheck/unit/build успешны; project E2E 1/1
  подтверждает выбор файла, quarantine upload и axe без нарушений. Desktop 1440 px и mobile 390 px
  проверены по реальному server-rendered экрану после Compose rebuild.
- Milestone 08 промежуточно: migration `0000`–`0016` применены на чистой `garun_m08_verify`,
  повторный `pnpm db:generate` — `No schema changes`; integration 34/34.
- Milestone 08 итогово: frozen install, format/check, lint, strict typecheck и unit suites успешны;
  core 48/48, worker 19/19, web 14/14 и остальные пакеты зелёные.
- Migrations `0000`–`0016` применены на чистой `garun_m08_final` (17 записей), таблица
  `approval_request` создана, повторный `pnpm db:generate` — `No schema changes`.
- Integration 35/35 на PostgreSQL, Redis, MinIO, Mailpit и ClamAV; отдельный approval suite 5/5
  проверяет idempotency/concurrency, revoke access, immutable evidence, stale revision,
  blocking feedback, tenant isolation и client audit filtering.
- Production web/worker build и artifact verification успешны. Целевой approval/project E2E 1/1,
  полный Playwright/axe suite 20/20.
- Новый Compose image собран; migration/storage-init exited 0, web/worker и все зависимости healthy.
  Liveness/readiness вернули 200 без чувствительных данных; `pnpm smoke` прошёл.
- `pnpm audit --prod --audit-level=high` не нашёл runtime advisory; один документированный ignored
  high advisory остаётся только в dev-only ESLint toolchain по ADR-042. `git diff --check`,
  tracked-file hygiene и high-confidence secret scan прошли.
- Post-merge проверка `main`: frozen install, format, lint, strict typecheck, unit 48/19/14,
  migration drift, integration 35/35, production build/artifact, Playwright/axe 20/20 и smoke
  прошли без ошибок.
- Milestone 09: frozen install, format/check, lint, strict typecheck и unit suites прошли; core
  51/51, worker 22/22, web 14/14.
- Migrations `0000`–`0017` применены на существующей и чистой PostgreSQL 17, повторное применение
  идемпотентно, `pnpm db:generate` сообщает `No schema changes`.
- Integration 43/43: 39 domain/storage/security и 4 worker persistence/retry tests.
- Production web/worker build и artifact verification успешны; полный Playwright/axe suite 22/22.
- Compose migration/storage-init exited 0; web, worker, PostgreSQL, Redis, MinIO, Mailpit и ClamAV
  healthy. Liveness/readiness вернули 200; повторный `pnpm smoke` прошёл.
- Post-merge CI `30479044166` на `main`: install с frozen lockfile, production audit, format,
  lint, strict typecheck, migration drift, unit/integration, clean migrations, build, artifact
  verification, Playwright/axe и smoke завершены успешно.
- Milestone 10: frozen install, format check, lint, strict typecheck и unit suites прошли; core
  52/52, worker 26/26, web 14/14 и остальные пакеты зелёные.
- `pnpm db:generate` сообщает `No schema changes`; migrations `0000`–`0018` применены к отдельной
  чистой PostgreSQL 17, проверены таблицы `export_job`, `project`, `audit_event`, `outbox_event`.
- Integration: 41 domain/storage assertions и 5 worker assertions; security subset 22/22.
- Performance fixture: p95 catalog 5.01 ms, comments 7.70 ms, files 5.53 ms на локальном профиле;
  backup/restore восстановил 4 required tables, архив 906 728 bytes.
- Production Next.js/worker build и artifact verification успешны; Playwright E2E 26/26,
  accessibility 17/17, web/worker smoke — passed.
- Compose пересобран из текущих sources: web, worker, PostgreSQL, Redis, MinIO, Mailpit и ClamAV
  healthy; migration/storage-init завершились успешно.
- `pnpm audit --prod`: один документированный ignored high advisory dev-only ESLint toolchain по
  ADR-042, активных runtime advisories нет. Secret scan прошёл для 413 tracked/untracked файлов.
- Feature CI `30487810446` для commit `43470e6` успешно выполнил quality, migration, security,
  performance, build, browser/a11y, secret scan и smoke gates перед fast-forward merge в `main`.

## Следующие действия

1. Создать production-like staging только после подтверждения провайдеров, домена и бюджета.
2. Настроить внешние secrets/backup destination/alerts и выполнить staging deployment checklist.
3. Провести один реальный пилот, собрать обратную связь и зафиксировать go/no-go.
4. После внешней приёмки зафиксировать результат пилота; Milestone 11 не начинать автоматически.

## Известные ограничения

- iframe embedding намеренно не включён: внешние CSP/X-Frame-Options и platform CSP делают new-tab
  единственным гарантированным путем. Capability result хранится для будущего безопасного UX.
- URL checker использует консервативный HTTP `HEAD`; protected preview может быть
  `safe/unreachable` и требует ручного подтверждения, но unsafe security result не переопределяется.
- Автоматический project cover реализован только для public safe/reachable SiteVersion; protected
  preview, периодическое переснимание, crop/gallery, DOM locator/overlay, SDK и real-time не входят.
- Локальный worker image включает Chromium и поэтому стал заметно тяжелее; production provider и
  окончательный worker image остаются предварительными.
- `potential_change` — только явная классификация. Полноценный change request и коммерческое решение
  относятся к последующим milestones.
- Production domain, R2, scanner deployment, RUM/APM и credentials не создавались.
- PostgreSQL RLS отложен; isolation обеспечивается server policies, scoped queries, composite
  constraints и cross-tenant/IDOR tests.
- Старые `scope_revision_approver`/`scope_approval_decision` остаются только в migration history
  для совместимости существующих установок; новые scope requests используют общий approval
  primitive.
- Email остаётся локальным через Mailpit; production provider и credentials не подключались.
- Нет digest, push/Telegram, notification analytics и отдельного admin UI для failed BullMQ jobs.
- Completion gate не учитывает оплату до появления включённого payment module; это соответствует
  утверждённому условному финансовому gate.
- Production domain, Vercel/Railway/R2/Resend accounts, production scanner, monitoring destination
  и секреты отсутствуют; staging deployment и реальный pilot этим репозиторием не симулируются.
- Prometheus-compatible metrics доступны на worker endpoint, но внешний collector/dashboard/alerts
  появятся только при развёртывании инфраструктуры.
- Экспорт — point-in-time snapshot, а не юридически заверенная подпись или неизменяемый архив;
  артефакт автоматически истекает и требует повторного запроса.
