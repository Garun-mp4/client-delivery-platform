# Garun Workspace

Client Delivery Platform. **Milestone 10** завершает первый рабочий MVP для контролируемого пилота:
безопасный экспорт истории с разрешёнными оригиналами, handover/completion, performance и security
gates, backup/restore rehearsal и операционные runbooks. Публичный production/SaaS запуск не
разрешён до утверждения домена, providers, data region и privacy/retention решений.

## Требования

- Node.js `22.22.2` (см. `.nvmrc`);
- Corepack;
- pnpm `11.9.0` (версия закреплена в `package.json`);
- Docker Desktop с Docker Compose `2.20+` (корневой файл использует `include`);
- Google Chrome stable для Playwright-тестов;
- Git.

Проверить окружение:

```powershell
node --version
corepack --version
docker --version
docker compose version
```

## Быстрый запуск всего приложения

Все значения ниже предназначены только для локальной разработки. Они не являются production
credentials.

### 1. Подготовить единственный Compose env-файл

PowerShell:

```powershell
Copy-Item infra/.env.example infra/.env
```

Bash:

```bash
cp infra/.env.example infra/.env
```

Файлы `.env` игнорируются Git. Домены, endpoints, лимиты и retention-настройки нельзя переносить
из примеров в production без отдельного решения.

Замените локальные placeholder `APP_BETTER_AUTH_SECRET` и `APP_OUTBOX_ENCRYPTION_KEY` собственными
значениями. Ключ outbox должен декодироваться ровно в 32 байта:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### 2. Запустить весь стек одной командой

```powershell
docker compose up -d --build --wait
```

Команда собирает общий non-root development image с Chromium для worker, запускает PostgreSQL,
Redis, MinIO, Mailpit и ClamAV, создаёт приватный bucket, однократно применяет Drizzle migrations и
только после этого запускает web и worker. Первый build скачивает Node/pnpm dependencies, Chromium и
сигнатуры scanner и занимает больше времени; повторные запуски используют Docker cache и named
volumes. После изменения исходников повторите ту же команду с `--build`.

Проверить состояние и посмотреть логи:

```powershell
docker compose ps --all
docker compose logs -f web worker
```

Сервисы:

| Сервис         | Адрес                   |
| -------------- | ----------------------- |
| PostgreSQL     | `localhost:5432`        |
| Redis          | `localhost:6379`        |
| MinIO S3 API   | `http://localhost:9000` |
| MinIO Console  | `http://localhost:9001` |
| ClamAV TCP API | `localhost:3310`        |
| Mailpit SMTP   | `localhost:1025`        |
| Mailpit UI/API | `http://localhost:8025` |
| Web            | `http://localhost:3000` |
| Worker health  | `http://localhost:3001` |

### 3. Создать первого владельца

Bootstrap — непубличная CLI-команда. Она не печатает email, password или session token, отмечает
созданного владельца как подтверждённого и безопасно завершается при повторном запуске для того же
workspace owner. Повторный запуск восстанавливает отсутствующий credential account, но не
перезаписывает существующий пароль.

```powershell
$env:BOOTSTRAP_OWNER_EMAIL = 'owner@example.test'
$env:BOOTSTRAP_OWNER_NAME = 'Локальный владелец'
$env:BOOTSTRAP_OWNER_PASSWORD = 'replace-with-local-password-12+'
$env:BOOTSTRAP_WORKSPACE_NAME = 'Моя студия'
$env:BOOTSTRAP_WORKSPACE_SLUG = 'my-studio'
docker compose run --rm `
  -e BOOTSTRAP_OWNER_EMAIL `
  -e BOOTSTRAP_OWNER_NAME `
  -e BOOTSTRAP_OWNER_PASSWORD `
  -e BOOTSTRAP_WORKSPACE_NAME `
  -e BOOTSTRAP_WORKSPACE_SLUG `
  web pnpm --filter @garun/auth exec tsx src/bootstrap-owner.ts
```

После bootstrap откройте `http://localhost:3000/login`. Владелец может войти указанным паролем или
запросить magic link. Письма не уходят наружу: worker доставляет их в Mailpit по адресу
`http://localhost:8025`.

Чтобы проверить invitation flow, войдите владельцем, откройте раздел «Доступ», укажите email
участника, откройте письмо в Mailpit и примите приглашение. Одна ссылка создаёт membership,
безопасную Better Auth session и сразу открывает workspace; второе письмо не требуется. Обычный
magic link используется для последующих входов. Для Gmail, Mail.ru и Яндекс Почты экран ожидания
показывает необязательную ссылку на соответствующий webmail, не выполняя автоматический redirect.

Для проверки Milestones 03–07.5 откройте раздел «Клиенты», создайте компанию, затем в разделе
«Проекты» нажмите основную кнопку «Создать проект»: форма открывается отдельной страницей. Каталог
поддерживает поиск, фильтры, сортировку, карточный/компактный вид и сохраняет их в URL. В проекте
внутренний участник с `project.edit` может загрузить JPEG/PNG/WebP до 10 MiB. Старая обложка остаётся
до успешной проверки новой; удаление ручной раскрывает имеющийся автоснимок. Публикация безопасной
public SiteVersion создаёт автоматический снимок; worker не передаёт browser cookies или
preview-пароли и не открывает private/special IP.

Клиент не видит черновик. После проверки «глазами клиента» опубликуйте проект,
отправьте приглашение представителю и откройте его письмо в Mailpit. Одна ссылка создаёт клиентский
доступ и сразу открывает только этот проект. Внутренние заметки в клиентский DTO не входят. Затем
откройте вкладку проекта «План»: создайте scope, назначьте согласующего клиента, получите
согласование и добавьте блокирующее клиентское действие. После выполнения действия клиентом
`blockedByClient` должен исчезнуть, а прогресс должен соответствовать весам этапов.

Затем откройте в карточке проекта «Анкеты», создайте вопросы и назначьте участника клиента. Клиент
может заполнить часть, дождаться статуса «Сохранено», перезагрузить страницу и продолжить с того же
места. После отправки разработчик принимает revision или возвращает её с пояснением; повторная
отправка создаёт новую неизменяемую revision. Черновик до отправки разработчику не показывается.
File/image-поля анкеты теперь используют тот же безопасный файловый контур. После выбора файла
дождитесь завершения фоновой проверки; отправка анкеты до статуса `available` безопасно отклоняется.

В карточке проекта откройте «Материалы». Владелец создаёт запрос, назначает участника клиента,
категорию и срок. Клиент может загрузить до 10 файлов за один раз и видит ход передачи; до успешной
проверки отображается только состояние карантина без имени и download URL. Worker сверяет размер,
checksum и фактический MIME, запускает ClamAV, удаляет EXIF при создании image preview и только затем
публикует редакцию. Владелец принимает её как текущую/финальную либо запрашивает уточнение; предыдущие
редакции остаются в истории. Поиск работает по названию, категории и именам уже доступных файлов.

После входа владелец начинает с «Обзора»: верхний блок показывает один наиболее важный следующий
шаг. Клиент видит отдельную «Главную» только со своими проектами и требуемым действием. Настройки
проекта, участники, клиентские приглашения и архив находятся в раскрывающихся блоках на странице
проекта, чтобы не перегружать ежедневный рабочий путь.

Во вкладке проекта «Проверка» владелец публикует обновление и добавляет неизменяемую URL-версию с
описанием изменений и инструкцией. Пока worker не завершил SSRF-safe проверку, клиент версию не
видит. Безопасная, но недоступная извне preview-версия требует явного подтверждения; unsafe URL
никогда не публикуется. Клиент открывает версию в новой вкладке, оставляет структурированное
замечание и после исправления закрывает его. Обычный комментарий статус не меняет, internal reply
клиенту не передаётся. Подробный flow описан в `docs/REVIEW_LOOP.md`.

Статус версии последовательно показывает проверку ссылки, блокировку/недоступность, готовность к
публикации, публикацию клиенту и состояние автоматического снимка. Экран несколько раз обновляет
ожидающий статус сам, после чего оставляет ручную кнопку. «Добавить запись в ленту» создаёт только
новость проекта; именно «Показать клиенту» публикует SiteVersion и для публичной безопасной
доступной ссылки автоматически ставит первый снимок в очередь. На обзоре недоступная кнопка снимка
содержит конкретную безопасную причину и ссылку обратно на «Проверку».

Во вкладке «Согласования» внутренний участник выбирает готовый client-visible результат,
назначает одного или нескольких клиентов с правом согласования и правило `any_one`/`all_required`.
Клиент сначала раскрывает точный сохранённый снимок, подтверждает ознакомление и затем согласует
либо запрашивает изменения. Владелец не может решить за клиента: ему доступны отмена с причиной и
отдельная явная фиксация решения, полученного вне платформы. Подробности, permission matrix и схема
данных находятся в `docs/APPROVALS_AND_AUDIT.md`.

Раздел «Уведомления» показывает tenant-scoped события и ведёт только по повторно авторизуемым deep
links. Здесь можно отметить события прочитанными, отключить проектные письма/напоминания, выбрать
IANA timezone и тихие часы. In-app уведомления остаются мгновенными; локальные email по-прежнему
проверяются в Mailpit. Для завершения проекта откройте на его обзоре «Статус проекта» → «Проверить
готовность к завершению»: обязательны завершённые/обоснованно пропущенные этапы, отсутствие
блокирующих действий, финальное client approval и checklist передачи. После завершения проект можно
перевести в read-only архив и восстановить с прежним статусом. Подробный каталог и permission matrix
находятся в `docs/NOTIFICATIONS_AND_COMPLETION.md`.

Во вкладке проекта «Экспорт» владелец, участник или клиент может собрать собственную разрешённую
проекцию истории. Worker повторно проверяет доступ и создаёт приватный `tar.gz` с Markdown, безопасным
HTML, manifest и доступными clean originals. Клиентский пакет не содержит внутренних данных.
Готовая ссылка короткоживущая, пакет по умолчанию удаляется через 24 часа. Подробности —
`docs/EXPORTS_AND_HANDOVER.md`.

Локальные ограничения задаются в `infra/.env`: по умолчанию 100 MiB на файл, 10 GiB на workspace,
15 минут для upload URL, 60 секунд для download URL, 24 часа до очистки незавершённой загрузки и
24 часа хранения экспорта. Export ограничен 1 000 вложений и 1 GiB исходных файлов. MinIO bucket
остаётся приватным. Не добавляйте реальные R2/production credentials в эти файлы.

Health endpoints возвращают только service/check status и correlation ID. Connection strings,
credentials и тексты ошибок зависимостей в ответ не включаются.

## Разработка и проверки на host

Для lint, typecheck, tests, генерации migrations и запуска приложений без контейнеров дополнительно
подготовьте package-level env-файлы и установите зависимости:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/worker/.env.example apps/worker/.env
Copy-Item packages/db/.env.example packages/db/.env
corepack enable
pnpm install --frozen-lockfile
```

Применить или сгенерировать migration вручную:

```powershell
$env:DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
pnpm db:migrate
pnpm db:generate
```

Generated SQL необходимо прочитать до commit. При host-запуске web и worker по-прежнему можно
запускать отдельно через `pnpm --filter @garun/web dev` и
`pnpm --filter @garun/worker dev`.

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
pnpm test:security
pnpm test:performance
pnpm audit:deps
pnpm audit:secrets
```

Integration tests требуют запущенный Docker Compose; единый Compose уже применяет migration.

PowerShell:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
$env:TEST_REDIS_URL = 'redis://:local_only_change_me@localhost:6379'
$env:TEST_MINIO_ENDPOINT = 'http://localhost:9000'
$env:TEST_MINIO_ACCESS_KEY = 'garun_local'
$env:TEST_MINIO_SECRET_KEY = 'local_only_change_me'
$env:TEST_MAILPIT_URL = 'http://localhost:8025'
$env:TEST_SCANNER_HOST = 'localhost'
$env:TEST_SCANNER_PORT = '3310'
pnpm test:integration
```

Playwright использует установленный системный Google Chrome и запускает отдельный production web
server на `localhost:3100` и worker из готового build. Уже запущенный dev-server на порту 3000 не
переиспользуется. Отдельный браузерный binary не скачивается:

```powershell
pnpm test:e2e
pnpm test:a11y
```

Последовательный локальный rehearsal всего MVP требует URL публичного тестового сайта, доступного
worker напрямую без HTTP proxy. Значение не фиксируется в коде и не должно вести на реального
клиента или приватный preview:

```powershell
$env:PILOT_PUBLIC_SITE_URL = 'https://example.com/'
pnpm test:e2e:pilot
```

Прямой доступ обязателен намеренно: SSRF-safe checker и renderer сами проверяют DNS/IP каждого
redirect и subresource и закрепляют соединение за разрешённым публичным IP. Пропуск такого трафика
через обычный forward proxy сделал бы эту гарантию недостоверной. Если URL получает состояние
«Сайт недоступен», сначала проверьте прямой маршрут командой
`curl.exe --noproxy "*" -I https://example.com`; не отключайте SSRF-проверки ради прохождения теста.

Проверить реальное создание и восстановление локальной резервной копии:

```powershell
pnpm backup:verify --env compose
```

Подготовить идемпотентный демонстрационный проект после owner bootstrap:

```powershell
$env:PILOT_WORKSPACE_SLUG = 'my-studio'
$env:PILOT_OWNER_EMAIL = 'owner@example.test'
pnpm seed:pilot
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
docker compose down
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
  core/                 identity, TenantContext, clients/projects policies и application services
    questionnaires/     schema v1, autosave, immutable submissions и review services
  db/                   Drizzle schema, client и migrations
  observability/        Pino logger, redaction, correlation IDs
  ui/                   базовые доступные UI-компоненты
tooling/
  eslint/               единые flat ESLint configs
  integration-tests/    infrastructure, auth, projects, invitation и tenant/IDOR tests
  quality/              repository formatting task
  ops/                  secret scan, performance profile и restore rehearsal
  typescript/           единые strict TypeScript configs
infra/
  Dockerfile.local      общий non-root image для локальных web/worker/migrations
  compose.yaml          полный локальный стек
compose.yaml            корневая точка входа в локальный стек
docs/                   решения, план и статус
```

Приложения импортируют shared code только через workspace packages. Route Handlers выполняют
transport/composition, а project/client policies и мутации находятся в `packages/core`.

## Безопасность конфигурации

- Не коммитьте `.env`, tokens, passwords, magic links и production endpoints.
- `.env.example` содержит только явно локальные placeholder-значения.
- `workspaceId` из клиентского запроса никогда не является доверенным tenant context.
- Защищённый workspace разрешается только через session → active membership → server policy.
- `ClientMembership` не открывает все проекты компании: каждый проект требует отдельный активный
  `ProjectMembership`.
- Черновики скрыты от client/observer, архивы read-only, внутренние и клиентские DTO разделены.
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
- `docs/CLIENTS_AND_PROJECTS.md` — компании, проекты, memberships и публикация;
- `docs/SCOPE_STAGES_ACTIONS.md` — scope agreement, этапы, actions, progress и client next action;
- `docs/QUESTIONNAIRES.md` — schema, autosave/revision flow, permissions и privacy анкет;
- `docs/MATERIALS_AND_FILES.md` — quarantine, версии материалов, ACL и файловый worker;
- `docs/UX_FOUNDATION.md` — role-based shell, дизайн-система и performance baseline;
- `docs/REVIEW_LOOP.md` — updates, SiteVersion, SSRF-safe URL checks и feedback workflow;
- `docs/APPROVALS_AND_AUDIT.md` — snapshots, approvers, decisions, concurrency и client-safe audit;
- `docs/NOTIFICATIONS_AND_COMPLETION.md` — inbox/email, reminders, completion gate и архив;
- `docs/EXPORTS_AND_HANDOVER.md` — приватный export pipeline, ACL, retention и state diagram;
- `docs/ARCHITECTURE.md` и `docs/SECURITY_MODEL.md` — границы системы и threat controls;
- `docs/BACKUP_RESTORE.md`, `docs/DEPLOYMENT.md`, `docs/OBSERVABILITY.md` — operations runbooks;
- `docs/INCIDENT_RESPONSE.md` и `docs/PILOT_RUNBOOK.md` — инциденты, onboarding и поддержка пилота;
- `docs/API_CONVENTIONS.md`, `docs/STORAGE_MODEL.md`, `docs/NOTIFICATION_CATALOG.md` — технические
  контракты;
- `docs/CONTRIBUTING.md` и `docs/CHANGELOG.md` — правила изменений и история;
- `AGENTS.md` — правила работы Codex.
