# Статус реализации

Последнее обновление: 2026-07-16
Общий статус: Milestone 00 завершён; Milestone 01 реализован и локально проверен, ожидается обязательный remote CI

## Текущий milestone

**Milestone 01 — engineering foundation.** Реализация ограничена monorepo, web/worker foundation, локальной инфраструктурой, Drizzle, тестами, observability, health endpoints, CI и документацией. Milestone 02 не начат.

Milestone 01 будет отмечен завершённым только после успешной проверки workflow GitHub Actions на опубликованной feature-ветке.

## Завершённые задачи

- Milestone 00: полностью проанализирован `PROJECT_SPEC.md`; приняты документы, структура Milestones 00–13 и граница MVP Milestones 01–10.
- Зафиксированы решения C-01–C-15 и ADR-016–ADR-020: назначенные согласующие, external decision record, progress, completion gate, конфигурируемые параметры и инженерная основа.
- Создан pnpm/Turborepo monorepo с общими strict TypeScript, ESLint и Prettier configs.
- Созданы минимальные Next.js web и Node.js worker без auth и бизнес-модулей.
- Добавлены packages `config`, `contracts`, `core`, `db`, `observability`, `ui` и отделённые tooling packages.
- Добавлены runtime validation, structured logging/redaction, безопасный request/correlation ID и live/ready endpoints.
- Добавлен Docker Compose для PostgreSQL, Redis, MinIO и Mailpit; все четыре сервиса подтверждены healthy.
- Создана и применена initial Drizzle migration `0000_serious_mystique.sql` с одной служебной таблицей `system_metadata`.
- Добавлены Vitest unit/component tests, Compose integration tests, Playwright desktop/mobile tests и axe accessibility smoke.
- Добавлен GitHub Actions workflow и точная инструкция локального запуска в README.
- Локально успешно выполнены frozen install, format check, lint, typecheck, 10 unit/component tests, 4 integration tests, production build, 6 browser/a11y tests и production artifact smoke.

## Текущие задачи

- Провести финальный diff/security review и повторный полный quality gate после документационных изменений.
- Создать осмысленные commits в `feat/milestone-01-foundation`, отправить ветку в `origin`.
- Проверить фактический результат GitHub Actions и только после зелёного workflow закрыть Milestone 01.

## Найденные проблемы

- Redis healthcheck сначала не раскрывал пароль из-за shell quoting; исправлен и повторно подтверждён через Compose `--wait`.
- ESM imports с `.js` проходили TypeScript, но не резолвились Turbopack из TypeScript source exports; внутренние импорты приведены к bundler-compatible виду.
- Первый worker artifact оставлял workspace TypeScript внешним, затем чрезмерно включал CommonJS `pg`; tsup настроен на bundle внутренних пакетов с явными внешними runtime dependencies, artifact smoke проходит.
- CDN Playwright возвращает HTTP 403 по геолокации; тесты переведены на установленный stable Chrome и проходят локально.
- Next.js перегенерирует `next-env.d.ts`; generated файл исключён из Prettier, чтобы build не делал format gate нестабильным.
- Production domain, jurisdiction/region, accounts, sender domain, scanner deployment и финальный юридический текст остаются открытыми и не блокируют Milestone 01.

## Принятые решения

- Runtime Milestone 01: Node.js 22.22 LTS, pnpm 11, Turborepo, strict TypeScript.
- Next.js 16/React 19 web и отдельный Node worker; общий код только через workspace packages.
- Drizzle/PostgreSQL, Redis, S3-compatible storage и email подключаются через будущие adapter boundaries; Milestone 01 не создаёт production resources.
- Health responses не возвращают connection strings или тексты ошибок зависимостей.
- Lifecycle install scripts deny-by-default с allowlist только необходимых native packages.
- Playwright использует системный Chrome; accessibility smoke использует `@axe-core/playwright`.
- Все подтверждённые продуктовые решения C-01–C-15 остаются текущими; RLS перенесён на отдельный pre-SaaS security review.

## Следующие действия

1. Завершить финальные локальные проверки и self-review.
2. Закоммитить и отправить `feat/milestone-01-foundation` без force push.
3. Дождаться GitHub Actions; при ошибке исправить причину в рамках Milestone 01.
4. После зелёного CI отметить Milestone 01 завершённым.
5. Следующий milestone — 02 (identity, workspace, tenant isolation), но работа над ним не начинается без отдельного запроса.

## Известные ограничения

- Production providers являются предварительными; аккаунты, платные сервисы и реальные secrets не создавались.
- ClamAV/scanner adapter и quarantine workflow архитектурно запланированы на file milestone, но scanner не развёрнут в Milestone 01.
- `packages/core` содержит только проверяемую модульную границу; auth, tenants, clients, projects и прочие бизнес-модули отсутствуют намеренно.
- CI может подтвердить Linux/browser/container reproducibility только после push; до этого Milestone 01 не считается завершённым.
- Юридическая достаточность approval/privacy текстов не заявляется и требует профильной проверки.
