# Garun Workspace

Client Delivery Platform. **Milestone 02** добавляет invitation-only identity, database-backed
sessions, workspace membership, deny-by-default RBAC, tenant isolation, audit trail и transactional
email outbox. Клиенты, проекты и другие продуктовые модули ещё не реализуются.

## Требования

- Node.js `22.22.2` (см. `.nvmrc`);
- Corepack;
- pnpm `11.9.0` (версия закреплена в `package.json`);
- Docker Desktop с Docker Compose;
- Google Chrome stable для Playwright-тестов;
- Git.

Проверить окружение:

```powershell
node --version
corepack --version
docker --version
docker compose version
```

## Первый локальный запуск

Все значения ниже предназначены только для локальной разработки. Они не являются production
credentials.

### 1. Подготовить конфигурацию

PowerShell:

```powershell
Copy-Item infra/.env.example infra/.env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/worker/.env.example apps/worker/.env
Copy-Item packages/db/.env.example packages/db/.env
```

Bash:

```bash
cp infra/.env.example infra/.env
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
cp packages/db/.env.example packages/db/.env
```

Файлы `.env` игнорируются Git. Домены, endpoints, лимиты и retention-настройки нельзя переносить
из примеров в production без отдельного решения.

Замените локальные placeholder `BETTER_AUTH_SECRET` и `OUTBOX_ENCRYPTION_KEY` собственными
значениями. Ключ outbox должен декодироваться ровно в 32 байта:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### 2. Установить зависимости

```powershell
corepack enable
pnpm install --frozen-lockfile
```

### 3. Запустить локальные сервисы

```powershell
docker compose -f infra/compose.yaml up -d --wait
docker compose -f infra/compose.yaml ps
```

Сервисы:

| Сервис         | Адрес                   |
| -------------- | ----------------------- |
| PostgreSQL     | `localhost:5432`        |
| Redis          | `localhost:6379`        |
| MinIO S3 API   | `http://localhost:9000` |
| MinIO Console  | `http://localhost:9001` |
| Mailpit SMTP   | `localhost:1025`        |
| Mailpit UI/API | `http://localhost:8025` |

### 4. Применить миграции

PowerShell загружает package-level `.env` явно:

```powershell
$env:DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
pnpm db:migrate
```

Bash:

```bash
DATABASE_URL='postgresql://garun:local_only_change_me@localhost:5432/garun_workspace' pnpm db:migrate
```

Создание новой миграции после осознанного изменения schema:

```powershell
$env:DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
pnpm db:generate
```

Generated SQL необходимо прочитать до commit.

### 5. Запустить приложения

В одном терминале:

```powershell
pnpm --filter @garun/web dev
```

Во втором:

```powershell
pnpm --filter @garun/worker dev
```

Адреса:

- web: `http://localhost:3000`;
- web liveness: `http://localhost:3000/api/health/live`;
- web readiness: `http://localhost:3000/api/health/ready`;
- worker liveness: `http://localhost:3001/health/live`;
- worker readiness: `http://localhost:3001/health/ready`.

### 6. Создать первого владельца

Bootstrap — непубличная CLI-команда. Она не печатает email, password или session token и безопасно
завершается при повторном запуске для того же workspace owner.

```powershell
$env:BOOTSTRAP_OWNER_EMAIL = 'owner@example.test'
$env:BOOTSTRAP_OWNER_NAME = 'Локальный владелец'
$env:BOOTSTRAP_OWNER_PASSWORD = 'replace-with-local-password-12+'
$env:BOOTSTRAP_WORKSPACE_NAME = 'Моя студия'
$env:BOOTSTRAP_WORKSPACE_SLUG = 'my-studio'
pnpm bootstrap:owner
```

После bootstrap откройте `http://localhost:3000/login`. Владелец может войти указанным паролем или
запросить magic link. Письма не уходят наружу: worker доставляет их в Mailpit по адресу
`http://localhost:8025`.

Чтобы проверить invitation flow, войдите владельцем, укажите email участника, откройте письмо в
Mailpit и примите приглашение. Одна ссылка создаёт membership, безопасную Better Auth session и
сразу открывает workspace; второе письмо не требуется. Обычный magic link используется для
последующих входов. Для Gmail, Mail.ru и Яндекс Почты экран ожидания показывает необязательную
ссылку на соответствующий webmail, не выполняя автоматический redirect.

Health endpoints возвращают только service/check status и correlation ID. Connection strings,
credentials и тексты ошибок зависимостей в ответ не включаются.

## Проверки

Форматирование и статические проверки:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
```

Unit tests и production build:

```powershell
pnpm test
pnpm build
pnpm verify:artifacts
```

Integration tests требуют запущенный Docker Compose и применённую миграцию.

PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
$env:TEST_REDIS_URL = 'redis://:local_only_change_me@localhost:6379'
$env:TEST_MINIO_ENDPOINT = 'http://localhost:9000'
$env:TEST_MINIO_ACCESS_KEY = 'garun_local'
$env:TEST_MINIO_SECRET_KEY = 'local_only_change_me'
$env:TEST_MAILPIT_URL = 'http://localhost:8025'
pnpm test:integration
```

Playwright использует установленный системный Google Chrome и запускает отдельный production web
server на `localhost:3100` и worker из готового build. Уже запущенный dev-server на порту 3000 не
переиспользуется. Отдельный браузерный binary не скачивается:

```powershell
pnpm test:e2e
```

Smoke test выполняется при уже запущенных production web и worker:

```powershell
pnpm --filter @garun/web start
pnpm --filter @garun/worker start
pnpm smoke
```

## Остановка локальной инфраструктуры

Остановить контейнеры без удаления данных:

```powershell
docker compose -f infra/compose.yaml down
```

Удаление локальных volumes намеренно не включено в обычную инструкцию: это разрушительная операция.

## Структура

```text
apps/
  web/                  Next.js application и HTTP health endpoints
  worker/               отдельный Node.js worker process и health server
packages/
  auth/                 Better Auth composition, invitation service и encrypted outbox
  config/               runtime validation и конфигурируемые defaults
  contracts/            transport DTO/error/health contracts
  core/                 identity primitives, RBAC policies и TenantContext
  db/                   Drizzle schema, client и migrations
  observability/        Pino logger, redaction, correlation IDs
  ui/                   базовые доступные UI-компоненты
tooling/
  eslint/               единые flat ESLint configs
  integration-tests/    infrastructure, auth, invitation и tenant-isolation tests
  quality/              repository formatting task
  typescript/           единые strict TypeScript configs
infra/
  compose.yaml          локальные зависимости
docs/                   решения, план и статус
```

Приложения импортируют shared code только через workspace packages. Бизнес-модули будут добавляться
в `packages/core` по milestones и не должны размещаться внутри UI или Route Handlers.

## Безопасность конфигурации

- Не коммитьте `.env`, tokens, passwords, magic links и production endpoints.
- `.env.example` содержит только явно локальные placeholder-значения.
- `workspaceId` из будущего клиентского запроса никогда не будет доверенным tenant context.
- Защищённый workspace разрешается только через session → active membership → server policy.
- Raw invitation/magic tokens не хранятся в БД, audit или structured logs.
- Логи используют структурированный JSON и redact известные credential fields.
- Локальный Mailpit не пересылает письма во внешние сервисы.
- MinIO, PostgreSQL и Redis слушают только loopback host.

## Документы проекта

- `PROJECT_SPEC.md` — источник продуктовых требований;
- `docs/IMPLEMENTATION_PLAN.md` — принятая последовательность milestones;
- `docs/DECISIONS.md` — текущие архитектурные решения;
- `docs/STATUS.md` — фактическое состояние реализации;
- `docs/IDENTITY_AND_TENANCY.md` — auth/invitation flows, permissions matrix и ER diagram;
- `AGENTS.md` — правила работы Codex.
