# Статус реализации

Последнее обновление: 2026-07-29
Общий статус: Milestones 00–07.5 и UX stabilization 06.5 завершены

## Текущий milestone

**Milestone 07.5 — каталог проектов и обложки — завершён в
`feat/milestone-07-5-project-catalog`.** Milestone 08 не начат.

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
- Добавлена migration `0015`, ADR-043, cover permissions/ER и документация renderer flow.

## Текущие задачи

- Активной реализации нет.
- Milestone 08 не начинать без отдельного подтверждения.

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

## Следующие действия

1. Провести review/merge ветки Milestone 07.5.
2. После отдельного подтверждения перейти к Milestone 08.

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
