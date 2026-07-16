# Архитектурные решения

Статус документа: предложено к подтверждению владельцем продукта
Дата: 2026-07-16
Основание: `PROJECT_SPEC.md`, версия 1.0

## 1. Резюме

ТЗ реализуемо и в целом хорошо подготовлено: границы продукта, роли, критический путь, безопасность и критерии приёмки описаны значительно лучше типового исходного задания. Главный риск — не техническая невозможность, а объём: даже «рабочий MVP» является полноценным защищённым B2B-продуктом. Поэтому сохраняется весь scope ТЗ, но функции вводятся последовательными вертикальными срезами.

Рекомендуемая основа — TypeScript-монорепозиторий, модульный монолит, Next.js и отдельный worker, PostgreSQL как источник истины, Redis/BullMQ для фоновых задач, S3-совместимое хранилище и отдельный Feedback SDK после базового workflow. Публичная регистрация, общий чат, эквайринг и SDK не должны блокировать первый полезный релиз.

## 2. Найденные проблемы и уточнения

| ID | Наблюдение | Риск | Предлагаемая трактовка |
|---|---|---|---|
| Q-01 | `ProjectScopeRevision` критичен для контроля объёма, но отсутствует в списке обязательного MVP и итерациях 1–9. | Запросы изменений не с чем сравнивать; продукт хуже решает одну из главных задач. | Включить минимальный versioned scope и его согласование до активной разработки в MVP. Полный diff и шаблоны — после MVP. |
| Q-02 | Матрица разрешает владельцу «согласовывать этап», но процесс требует назначенного уполномоченного клиента. | Владелец сможет незаметно принять решение за клиента. | Клиентское согласование принимает только назначенный клиентский approver. Владелец может отменить запрос новым событием или зафиксировать внешнее решение отдельным явно помеченным действием, но не impersonate клиента. |
| Q-03 | Для стратегий `any_one` и `all_required` нет сущности списка согласующих. | Нельзя корректно определить ожидаемые решения. | Добавить `ApprovalRequestApprover` с состоянием каждого назначенного согласующего; `ApprovalDecision` остаётся append-only. |
| Q-04 | Требование «все записи принадлежат workspace» не отражено во многих таблицах, где есть только `projectId`. | Ошибка join или фоновой задачи может дать cross-tenant доступ. | Хранить `workspaceId` на tenant-bound сущностях и использовать составные FK/unique constraints там, где это повышает защиту; все репозитории получают проверенный `TenantContext`. |
| Q-05 | Полиморфные `entityType/entityId` в `FileLink`, `Comment`, approvals не имеют FK и не обеспечивают tenant integrity средствами БД. | Висячие и межтенантные ссылки. | Хранить `workspaceId` и `projectId`, валидировать target в транзакции, ограничить допустимые типы enum; для security-critical связей использовать явные link-таблицы. |
| Q-06 | `Invitation` описан как привязанный к компании и проектам, но схема связей не дана. | Приглашённый получит лишний проект или не получит нужный. | `Invitation` относится к workspace/company, а `InvitationProjectGrant` перечисляет проекты и будущую роль. Принятие выполняется одной транзакцией. |
| Q-07 | `User` не содержит auth-таблиц, пароль опционален, а magic link и приглашение смешиваются терминологически. | Ошибки жизненного цикла токенов и сессий. | Использовать таблицы auth-библиотеки для accounts/sessions/verifications; бизнес-приглашение хранить отдельно. Invitation token и sign-in magic-link token — разные одноразовые секреты. |
| Q-08 | В MVP упомянуты «обычные комментарии», а E2E и критерии требуют замечание со статусами исправления/проверки. | Комментарий без workflow не покрывает критический путь. | В MVP реализовать list-based `FeedbackItem` без DOM SDK: страница/URL, текст, опциональный скриншот, статусы и ветка комментариев. SDK добавит источник и привязку, не заменяя модель. |
| Q-09 | `Project.progress` хранится, хотя он вычисляется из весов этапов. | Рассинхронизация. | Этапы — источник истины. `progress` — обновляемая в той же транзакции проекция; периодическая задача только сверяет и исправляет дрейф. |
| Q-10 | Не определены правила весов: нулевая сумма, skipped, возврат approved-этапа. | Разный процент в UI и тестах. | Вес — положительное целое; сумма автоматически нормализуется для отображения. `skipped` учитывается как завершённый только с причиной; возврат из `approved` создаёт новое событие/ревизию и требует права. |
| Q-11 | Не задано, публикуется ли URL до SSRF-проверки и что происходит при недоступности. | SSRF или блокировка нормальных preview с auth. | Создание версии даёт `pending_check`; worker безопасно проверяет URL. Публикация клиенту возможна после `safe/reachable` либо после явно записанного ручного подтверждения без серверного fetch. Блокированный адрес нельзя override. |
| Q-12 | Автивирус обязателен в production, но движок и состояние карантина не определены. | Вредоносный файл станет доступен до проверки. | Upload проходит `initiated → uploaded → scanning → available/rejected`; скачивание до `available` запрещено. Адаптер сканера: ClamAV или managed service; выбор провайдера требуется до production. |
| Q-13 | Архивный read-only режим не определяет исключения. | Либо архив нельзя восстановить, либо его продолжают менять. | После архивирования бизнес-мутации запрещены всем. Владелец может только восстановить, экспортировать и выполнить операции хранения/удаления. |
| Q-14 | Сценарий завершения требует финальный платёж, но оплаты вынесены после MVP. | MVP невозможно завершить по собственному сценарию. | До модуля оплат completion gate состоит из обязательных этапов и финальной передачи. После включения оплат workspace может явно потребовать погашение обязательных milestones. |
| Q-15 | Audit должен быть неизменяемым, но одновременно действуют удаление и минимизация персональных данных. | Конфликт аудита и privacy. | Audit append-only для приложения; при удалении PII содержимое редактируемых объектов удаляется/анонимизируется, а минимальный tombstone события сохраняется по утверждённой retention policy. |
| Q-16 | Событие уведомления должно создаваться атомарно с бизнес-операцией, но очередь внешняя. | Commit прошёл, уведомление потеряно. | Transactional outbox в PostgreSQL; dispatcher передаёт событие в BullMQ идемпотентно. Ошибка Redis не откатывает бизнес-операцию. |
| Q-17 | `PaymentMilestone.status`, `paidAt` и partial/refund могут противоречить сумме `Payment`. | Неверная финансовая сводка. | Платежи append-only; агрегированный paid amount и статус выводятся из проводок. Возврат — отдельная отрицательная по смыслу, но положительная по величине запись с типом `refund`; суммы в API не принимаются как float. |
| Q-18 | «Каждый экран имеет reconnecting» конфликтует с real-time после MVP. | Лишняя инфраструктура в MVP. | `reconnecting` обязателен только для экранов, где реально включён live transport. До этого используются обычные loading/error и обновление по навигации/refresh. |
| Q-19 | Цели p95 заданы без профиля окружения и методики. | Формально непроверяемая приёмка. | Зафиксировать staging-конфигурацию, seed-набор, concurrency и границы замера перед performance milestone. Цели ТЗ не ослабляются. |
| Q-20 | DoD требует code review, staging и post-deploy для каждой функции, но разработчик один. | Процесс станет формальным или заблокируется. | Code review — отдельный self-review/agent-review до merge; staging, миграции и smoke — критерий milestone/release, а не каждого локального коммита. |
| Q-21 | Не определены date-only сроки и DST. | Дедлайн может сдвигаться на день. | Бизнес-дедлайн хранить как локальную дату + timezone области; точные события — `timestamptz` UTC. Просрочка наступает после конца локального дня, если действие не задаёт точное время. |
| Q-22 | Политика CSP может конфликтовать с preview iframe, SDK и custom domains. | Небезопасное ослабление CSP. | Разделить CSP платформы и SDK; разрешённые frame origins задаются на уровне версии/проекта, без глобального `*`; `postMessage` проверяет точный origin. |

Нереализуемых требований в ТЗ нет. Same-origin ограничение для произвольного iframe уже корректно признано; SDK и screenshot fallback являются реализуемым решением. Неопределённые юридические и инфраструктурные параметры нельзя безопасно «угадать» — они перечислены в разделе подтверждений.

## 3. Предлагаемый стек

Версии фиксируются lockfile при bootstrap. Архитектурно закрепляются major-линии; patch/minor обновляются через отдельный проверяемый PR. На 2026-07-16 рекомендуется стабильный Next.js 16.2, а не preview 16.3. Официальные основания: [Next.js releases](https://nextjs.org/blog), [Better Auth magic link](https://better-auth.com/docs/plugins/magic-link), [Better Auth sessions](https://better-auth.com/docs/concepts/session-management), [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [BullMQ](https://docs.bullmq.io/).

| Область | Выбор | Обоснование |
|---|---|---|
| Runtime | Node.js 24 LTS, TypeScript strict | Один язык для web, worker и SDK; долгий LTS-горизонт. |
| Monorepo | pnpm workspaces + Turborepo | Строгий lockfile, быстрые локальные/CI задачи, без отдельного сервиса. |
| Web | Next.js 16.2 App Router + React 19 | SSR/RSC для dashboard, Route Handlers для API, зрелый full-stack deployment. |
| UI | Tailwind CSS 4, Radix UI primitives, локальные компоненты в стиле shadcn/ui | Доступные primitives без зависимости от закрытого kit; компоненты принадлежат репозиторию. |
| Формы/валидация | React Hook Form + Zod | Общие схемы входа на клиенте и сервере; сложные/autosave формы без самописного form engine. |
| БД | PostgreSQL 17+ | Транзакции, JSONB, полнотекстовый поиск, ограничения и зрелые managed-варианты. |
| ORM/миграции | Drizzle ORM + Drizzle Kit, `node-postgres` | SQL-прозрачность и строгая схема; меньше магии для сложных tenant-aware запросов. Миграции проверяются как SQL. |
| Auth | Better Auth, database-backed sessions, magic-link plugin; invitation flow в доменном модуле | Одноразовые magic links, отзыв сессий и расширяемость. `storeToken: "hashed"`, signup отключён вне принятия приглашения. |
| API | Route Handlers + application services + Zod DTO; REST для SDK | Без дополнительного RPC-фреймворка; одинаковые policy/service функции вызываются из web и API. Единый error envelope. |
| Очередь | Redis 7+ + BullMQ 5, отдельный worker | Delays, retries, scheduler и масштабирование; соответствует ТЗ. Transactional outbox закрывает разрыв БД/Redis. |
| Файлы | S3-compatible adapter; MinIO локально; production provider после подтверждения | Приватные buckets, presigned upload/download, переносимость. |
| Scan/preview | Асинхронные adapters: ClamAV/managed scanner, image/PDF preview worker | Файл остаётся в карантине до результата; тяжёлая работа не выполняется web-процессом. |
| Email | React Email templates + provider adapter; стартовый кандидат Resend | Русские транзакционные шаблоны версионируются; провайдер заменяем без доменной переработки. |
| Telegram | Bot API adapter после MVP | Добровольное подключение и только deep-link уведомления. |
| Логи/ошибки | Pino JSON, OpenTelemetry, Sentry-compatible error adapter | Correlation/request ID, редактирование чувствительных полей, переносимая телеметрия. |
| Unit/integration | Vitest, Testing Library, Testcontainers | Реальная PostgreSQL/Redis интеграция, быстрые domain tests. |
| E2E/a11y | Playwright + axe-core | Мобильные/desktop критические пути и автоматический accessibility smoke. |
| CI | GitHub Actions, Docker Compose для service tests | Проверки из ТЗ и воспроизводимое окружение. |
| Deployment | OCI images: `web` и `worker`; managed PostgreSQL, Redis и object storage | Не привязывает продукт к одному PaaS; scheduler работает через BullMQ Job Schedulers. |

### Почему не альтернативы

- Prisma: хорошая DX, но Drizzle выбран из-за SQL-прозрачности, составных tenant constraints и более прямого контроля запросов. Если команда предпочитает Prisma, это допустимая замена только до первой миграции.
- Auth.js: зрелый вариант, но Better Auth даёт более прямой готовый набор magic link/session management. Invitation и tenant authorization всё равно остаются нашей доменной логикой.
- tRPC: удобен для внутреннего UI, но создаёт второй контракт рядом с публичным SDK REST. Route Handlers + services проще для одного разработчика.
- PostgreSQL-only очередь: уменьшает инфраструктуру, но Redis уже нужен для rate limiting и BullMQ прямо покрывает delayed/retry/scheduler требования. Transactional outbox сохраняет надёжность.
- PostgreSQL RLS с первого дня: сильная дополнительная защита, но усложняет pool, migrations и worker. Для MVP выбираются обязательный `TenantContext`, составные ограничения, deny-by-default policies и cross-tenant тесты. RLS повторно оценивается до публичного SaaS.
- Микросервисы: не нужны при начальной нагрузке и противоречат требованию модульного монолита.

## 4. Архитектурные решения (ADR summary)

### ADR-001. Модульный монолит

**Решение:** один репозиторий и одна PostgreSQL-модель; `web` и `worker` — отдельные процессы, доменные правила общие. Feedback SDK — отдельный bundle.
**Альтернативы:** монолит в одном Next.js приложении; микросервисы.
**Причина:** worker нельзя надёжно выполнять в request lifecycle, а микросервисы преждевременны.

### ADR-002. Tenant context и deny by default

**Решение:** tenant берётся только из проверенной server session/project grant. Ни `workspaceId`, ни роль из request body не считаются доверенными. Repository/API методы требуют `ActorContext`; policy возвращает явное allow, иначе deny. Tenant-bound таблицы имеют `workspaceId`; URL использует UUID/ULID, но непредсказуемый ID не заменяет authorization.
**Альтернативы:** фильтрация только в UI; RLS с первого дня.
**Причина:** первая альтернатива небезопасна, вторая пока несоразмерна, но остаётся future hardening.

### ADR-003. Database-backed sessions и invitation-only

**Решение:** server-side revocable sessions в PostgreSQL; secure/httpOnly/SameSite cookies; magic tokens хешируются и атомарно потребляются; публичный signup выключен. Принятие приглашения создаёт membership/grants атомарно.
**Альтернативы:** stateless JWT; пароль как обязательный.
**Причина:** отзыв доступа и отключение пользователя должны действовать немедленно; magic link снижает трение клиента.

### ADR-004. Authorization не является частью auth-библиотеки

**Решение:** Better Auth подтверждает identity/session, но workspace/project roles, permissions и approval authority реализуются domain policies. Permission JSON валидируется versioned Zod schema, а не читается произвольно.
**Альтернатива:** доверить RBAC generic organization plugin.
**Причина:** матрица проекта и client/company grants специфичны продукту.

### ADR-005. Транзакционный outbox

**Решение:** бизнес-изменение, audit event и outbox event записываются одной DB-транзакцией. Worker доставляет событие в канал; consumer идемпотентен по event ID.
**Альтернативы:** прямой email/queue call внутри HTTP; distributed transaction.
**Причина:** внешняя ошибка не должна ломать или терять основную операцию.

### ADR-006. Append-only решения и ревизии

**Решение:** согласованный scope, approval decisions, change proposals и финансовые проводки не обновляются. Исправление — новая ревизия/компенсирующее событие. Редактирование комментария сохраняет revision metadata; удаление становится tombstone.
**Альтернатива:** mutable current row с audit diff.
**Причина:** продукт должен однозначно показывать, что именно было подтверждено.

### ADR-007. State transitions в доменных сервисах

**Решение:** допустимые переходы описываются pure policy/state-machine функциями и вызываются только application service в транзакции. UI никогда напрямую не задаёт произвольный final status.
**Альтернатива:** CRUD статусов.
**Причина:** тестируемость, понятные ошибки и отсутствие обхода правил.

### ADR-008. Файлы через quarantine pipeline

**Решение:** web выдаёт короткоживущую upload policy после authorization; metadata завершается сервером; worker проверяет checksum/MIME/scan; download URL выдаётся только после повторной проверки прав. Storage key не содержит оригинального имени или PII.
**Альтернативы:** upload через web server; публичные object URLs.
**Причина:** масштабирование и безопасность.

### ADR-009. Feedback сначала как доменная модель

**Решение:** MVP использует список замечаний и screenshot marker fallback. SDK позднее пишет в тот же `FeedbackItem`, добавляя locator context.
**Альтернатива:** ждать SDK или использовать только свободные комментарии.
**Причина:** полностью рабочий review loop появляется раньше без тупикового кода.

### ADR-010. Autosave с revision control

**Решение:** questionnaire draft autosave использует debounce, optimistic concurrency (`version`/`updatedAt`) и idempotency key. Submitted submission неизменяема; дальнейшее исправление создаёт новую revision.
**Альтернативы:** сохранять каждую клавишу; перезаписывать submission.
**Причина:** предотвращение потерь и гонок между вкладками.

### ADR-011. URL fetch как отдельная security boundary

**Решение:** URL нормализуется, DNS/IP проверяется до каждого соединения и redirect, разрешены только HTTP(S), действуют timeout/size limits; worker не использует общую permissive HTTP-функцию. Результат проверки не является постоянным разрешением: повторная публикация/снимок проверяется снова.
**Альтернатива:** HEAD/GET непосредственно из Route Handler.
**Причина:** SSRF и DNS rebinding.

### ADR-012. Русский MVP без преждевременной i18n-платформы

**Решение:** все пользовательские тексты вынесены из business logic в локализуемый слой, locale хранится в workspace/user; поставляется только `ru-RU`. Форматы дат/денег используют `Intl`.
**Альтернативы:** hardcoded strings повсюду; полная многоязычность сразу.
**Причина:** готовность к SaaS без лишней работы первого релиза.

### ADR-013. API и server boundaries

**Решение:** Route Handlers обслуживают внешние/deep-link/SDK запросы; Server Components могут читать через application service; mutation всегда проходит один и тот же service/policy/transaction path. DTO allowlist исключает internal fields.
**Альтернативы:** бизнес-логика в React actions или ORM calls из route components.
**Причина:** исключение mass assignment и дублирования правил.

### ADR-014. Архивирование и удаление

**Решение:** archive — обратимое read-only состояние. Delete — отдельный workflow с re-auth, grace period, background purge и минимальным audit tombstone. Hard delete напрямую из UI отсутствует.
**Альтернатива:** каскадное удаление по кнопке.
**Причина:** защита данных и соответствие ТЗ.

### ADR-015. Feature flags только server-controlled

**Решение:** незавершённые модули не показываются; server flag не даёт обходить authorization. Flags используются для rollout, а не для вечных заглушек.
**Альтернатива:** видимые «скоро» страницы.
**Причина:** каждый milestone должен оставлять рабочий продукт.

## 5. Планируемая структура репозитория

Каталоги создаются по мере появления рабочего кода, а не пустым scaffold заранее.

```text
client-delivery-platform/
├─ apps/
│  ├─ web/                    # Next.js UI, Route Handlers, composition root
│  └─ worker/                 # BullMQ consumers, scheduler, outbox dispatcher
├─ packages/
│  ├─ core/                   # modules/*: domain rules, policies, application services
│  ├─ db/                     # Drizzle schema, repositories, migrations, seed
│  ├─ contracts/              # Zod DTO, error codes, event contracts
│  ├─ auth/                   # Better Auth config and auth adapters
│  ├─ ui/                     # accessible shared components and tokens
│  ├─ storage/                # S3 and malware-scan interfaces/adapters
│  ├─ notifications/          # email/Telegram templates and channel adapters
│  ├─ observability/          # logging, tracing, redaction
│  ├─ feedback-sdk/           # создаётся только на этапе SDK
│  └─ test-utils/             # factories, tenant fixtures, integration helpers
├─ tooling/                   # shared TS/lint/test configuration
├─ docs/                      # plan, status, ADR, security and operating docs
├─ infra/                     # local compose and deployment manifests
├─ .github/workflows/         # CI/CD
├─ AGENTS.md
├─ PROJECT_SPEC.md
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

В `packages/core/src/modules` сохраняются доменные границы из ТЗ: `workspaces`, `clients`, `projects`, `stages`, `actions`, `questionnaires`, `materials`, `files`, `versions`, `feedback`, `approvals`, `change-requests`, `payments`, `notifications`, `audit`, `templates`. Межмодульное взаимодействие идёт через явные service/event contracts, а не через импорт внутренних repository деталей.

## 6. Минимальный первый рабочий MVP

MVP полезен для реального проекта, если позволяет без внешних таблиц провести путь от приглашения до финального подтверждения. В него входят:

1. Один invitation-only workspace с архитектурной multi-tenant изоляцией, owner и клиентскими ролями.
2. Клиентские компании, проекты, участники, безопасный magic-link вход и отзыв сессий.
3. Согласуемая ревизия scope, этапы, веса, действия, сроки, блокировка клиентом и два dashboard.
4. Анкеты: требуемые типы полей, sections, conditional fields, repeating groups, autosave, revisions и clarification flow.
5. Материалы и приватные versioned files с quarantine, scan status, signed links и mobile upload.
6. Обновления проекта, URL-версии с SSRF-safe проверкой и list-based замечания со скриншотом/комментариями.
7. Согласования конкретных ревизий с `primary_approver`, `any_one`, `all_required`, immutable decisions.
8. In-app/email уведомления критического пути, reminders, transactional outbox и audit trail.
9. Архивный read-only режим, минимальный читаемый HTML/Markdown export истории, русский mobile-first UI.
10. Security, accessibility, backup/restore smoke, performance baseline и полный E2E критического пути.

В MVP намеренно отсутствуют, но не заменяются заглушками: общий чат, публичная регистрация, ручные оплаты, полноценные change requests, Telegram, white-label/custom domains, глобальный полнотекстовый поиск, Feedback SDK/DOM markers, real-time, GitHub/Vercel, эквайринг, SaaS billing и режим обслуживания. До полноценного change-request модуля потенциальное расширение scope помечается как `potential_change` и не переводится автоматически в работу; коммерческое решение фиксируется вне системы. Эта временная граница должна быть явно объяснена пользователю продукта.

## 7. Решения, требующие подтверждения владельца

| № | Решение | Рекомендация по умолчанию | Почему нужно подтверждение |
|---|---|---|---|
| C-01 | Product name и домен | `Garun Workspace` как рабочее имя; домен не фиксировать в коде | Влияет на email, CSP, cookies, SDK origin и бренд. |
| C-02 | Целевая юрисдикция и место хранения данных | До решения использовать локальные/test данные; production не запускать | Определяет privacy notice, retention и выбор регионов/provider. Нужна юридическая проверка, не только техническое решение. |
| C-03 | Production hosting | Контейнерный PaaS с web+worker и managed PostgreSQL/Redis | Стоимость, регион, backup SLA и поддержка long-running worker. |
| C-04 | Object storage и malware scanner | S3-compatible EU-region + managed scanner либо ClamAV worker | Data residency, стоимость и operational burden. |
| C-05 | Email provider/from-domain | Resend через adapter как стартовый кандидат | Нужны домен, SPF/DKIM/DMARC и проверка доставки российским адресатам. |
| C-06 | Максимальный файл и квоты | 100 MiB на файл; 10 GiB на workspace для MVP | Влияет на UX, multipart upload, стоимость и abuse controls. |
| C-07 | Retention | 30 дней для незавершённых upload, 30 дней grace после delete, audit 1 год; backup по отдельной политике | Это продуктовая и юридическая политика. |
| C-08 | Юридический текст согласования | Продуктовый текст из ТЗ как placeholder только в non-production | Требуется проверка владельцем/юристом; платформа не является ЭП. |
| C-09 | MVP scope | Состав из раздела 6; оплаты и full change requests сразу после MVP | Определяет дату первого реального пилота. |
| C-10 | Клиент может приглашать коллег | Выключено по умолчанию; owner выдаёт `canManageMembers` | Риск ошибочной выдачи доступа. |
| C-11 | Owner фиксирует решение вне платформы | Разрешить отдельное `recorded_externally` событие с источником и доказательством, не approval от лица клиента | Нужен баланс практичности и достоверности истории. |
| C-12 | RLS до SaaS | Не в MVP; обязательный повторный security review перед публичным SaaS | Компромисс сложности и defense-in-depth. |

До ответа владельца план использует рекомендации по умолчанию только для проектирования. Решения C-02, C-04, C-05 и C-08 блокируют production, но не локальную разработку.
