# Статус реализации

Последнее обновление: 2026-07-16
Общий статус: Milestone 00 и Milestone 01 завершены

## Текущий milestone

**Milestone 01 — engineering foundation — завершён.** Реализация ограничена monorepo, web/worker foundation, локальной инфраструктурой, Drizzle, тестами, observability, health endpoints, CI и документацией. Milestone 02 не начат.

## Завершённые задачи

- Milestone 00: полностью проанализирован `PROJECT_SPEC.md`; приняты документы, структура Milestones 00–13 и граница MVP Milestones 01–10.
- Зафиксированы решения C-01–C-15 и ADR-016–ADR-020: назначенные согласующие, external decision record, progress, completion gate, конфигурируемые параметры и инженерная основа.
- Создан pnpm/Turborepo monorepo с общими strict TypeScript, ESLint и Prettier configs.
- Созданы минимальные Next.js web и Node.js worker без auth и бизнес-модулей.
- Добавлены packages `config`, `contracts`, `core`, `db`, `observability`, `ui` и отделённые tooling packages.
- Добавлены runtime validation с безопасными ошибками, structured logging/redaction, безопасный request/correlation ID и live/ready endpoints с bounded dependency checks.
- Добавлен Docker Compose для PostgreSQL, Redis, MinIO и Mailpit; все четыре сервиса подтверждены healthy.
- Создана и применена initial Drizzle migration `0000_serious_mystique.sql` с одной служебной таблицей `system_metadata`.
- Добавлены Vitest unit/component tests, Compose integration tests, Playwright desktop/mobile tests и axe accessibility smoke.
- Добавлен GitHub Actions workflow с pinned action SHA, проверкой актуальности миграций и самостоятельности production artifacts; README содержит точную инструкцию локального запуска.
- Проведён финальный технический review Milestone 01: подтверждены отсутствие циклов между 12 workspace packages, strict TypeScript без suppressions, чистая повторная миграция, устойчивость Compose volumes, безопасное degraded health-поведение и отсутствие runtime secrets/build artifacts в Git.
- После review локально успешно выполнены clean/frozen install, audit, format check, lint, typecheck, 13 unit/component tests, 6 integration tests, production build, worker artifact verification, 8 browser/a11y/CSP tests и production artifact smoke.

## Текущие задачи

- Активных задач реализации нет. Ветка `feat/milestone-01-foundation` готова к финальной CI-проверке и ручному review/PR; merge в `main` автоматически не выполняется.

## Найденные проблемы

- Redis healthcheck сначала не раскрывал пароль из-за shell quoting; исправлен и повторно подтверждён через Compose `--wait`.
- ESM imports с `.js` проходили TypeScript, но не резолвились Turbopack из TypeScript source exports; внутренние импорты приведены к bundler-compatible виду.
- Первый worker artifact оставлял workspace TypeScript внешним, затем чрезмерно включал CommonJS `pg`; tsup настроен на bundle внутренних пакетов с явными внешними runtime dependencies, artifact smoke проходит.
- CDN Playwright возвращает HTTP 403 по геолокации; тесты переведены на установленный stable Chrome и проходят локально.
- Next.js перегенерирует `next-env.d.ts`; generated файл удалён из Git и игнорируется, а `next typegen` создаёт его перед typecheck.
- Первоначальный production CSP допускал inline script/style. Он заменён на request nonce CSP; E2E проверяет отсутствие `unsafe-inline`/`unsafe-eval` в production и единый nonce scripts.
- Zod-ошибки могли раскрывать значения конфигурации, а log redaction не покрывал вложенные connection strings; ошибки теперь содержат только имена полей, redaction проверяется regression-тестами.
- Readiness-подключения могли ждать дольше допустимого, а Playwright мог переиспользовать уже запущенный dev-server; добавлены bounded timeouts и отдельный production server на review-порту.
- Production audit обнаружил уязвимый транзитивный PostCSS; применён централизованный override на patched-версию, повторный `pnpm audit --prod` не находит известных уязвимостей.
- Production domain, jurisdiction/region, accounts, sender domain, scanner deployment и финальный юридический текст остаются открытыми и не блокируют Milestone 01.

## Принятые решения

- Runtime Milestone 01: Node.js 22.22 LTS, pnpm 11, Turborepo, strict TypeScript.
- Next.js 16/React 19 web и отдельный Node worker; общий код только через workspace packages.
- Drizzle/PostgreSQL, Redis, S3-compatible storage и email подключаются через будущие adapter boundaries; Milestone 01 не создаёт production resources.
- Health responses не возвращают connection strings или тексты ошибок зависимостей.
- Lifecycle install scripts deny-by-default с allowlist только необходимых native packages.
- Generated Next.js types создаются детерминированно перед typecheck; worker artifact отдельно проверяется на отсутствие workspace TypeScript imports.
- Playwright использует системный Chrome; accessibility smoke использует `@axe-core/playwright`.
- Все подтверждённые продуктовые решения C-01–C-15 остаются текущими; RLS перенесён на отдельный pre-SaaS security review.

## Следующие действия

1. Владелец вручную просматривает feature-ветку и успешный GitHub Actions run.
2. После принятия изменений ветка может быть объединена с `main` владельцем или отдельной явно разрешённой задачей.
3. Следующий milestone — 02 (identity, workspace, tenant isolation), но работа над ним не начинается без отдельного запроса.

## Известные ограничения

- Production providers являются предварительными; аккаунты, платные сервисы и реальные secrets не создавались.
- ClamAV/scanner adapter и quarantine workflow архитектурно запланированы на file milestone, но scanner не развёрнут в Milestone 01.
- `packages/core` содержит только проверяемую модульную границу; auth, tenants, clients, projects и прочие бизнес-модули отсутствуют намеренно.
- Проверка «чистого окружения» выполнена в GitHub-hosted Linux runner с frozen lockfile; отдельные provisional production providers и deployment не проверялись и не требуются для Milestone 01.
- Юридическая достаточность approval/privacy текстов не заявляется и требует профильной проверки.
