# Архитектурные решения

Статус документа: действующие решения проекта; production-провайдеры предварительные
Дата: 2026-07-16
Основание: `PROJECT_SPEC.md`, версия 1.0

## 1. Резюме

ТЗ реализуемо и в целом хорошо подготовлено: границы продукта, роли, критический путь, безопасность и критерии приёмки описаны значительно лучше типового исходного задания. Главный риск — не техническая невозможность, а объём: даже «рабочий MVP» является полноценным защищённым B2B-продуктом. Поэтому сохраняется весь scope ТЗ, но функции вводятся последовательными вертикальными срезами.

Рекомендуемая основа — TypeScript-монорепозиторий, модульный монолит, Next.js и отдельный worker, PostgreSQL как источник истины, Redis/BullMQ для фоновых задач, S3-совместимое хранилище и отдельный Feedback SDK после базового workflow. Публичная регистрация, общий чат, эквайринг и SDK не должны блокировать первый полезный релиз.

## 2. Найденные проблемы и уточнения

| ID   | Наблюдение                                                                                                                         | Риск                                                                              | Принятое решение                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01 | `ProjectScopeRevision` критичен для контроля объёма, но отсутствует в списке обязательного MVP и итерациях 1–9.                    | Запросы изменений не с чем сравнивать; продукт хуже решает одну из главных задач. | Включить минимальный versioned scope и его согласование до активной разработки в MVP. Полный diff и шаблоны — после MVP.                                                                                                                                                                                                                                                                                                    |
| Q-02 | Матрица разрешает владельцу «согласовывать этап», но процесс требует назначенного уполномоченного клиента.                         | Владелец сможет незаметно принять решение за клиента.                             | Клиентское согласование принимает только назначенный клиентский approver. Владелец может отменить запрос новым событием или зафиксировать внешнее решение отдельным явно помеченным действием, но не impersonate клиента.                                                                                                                                                                                                   |
| Q-03 | Для стратегий `any_one` и `all_required` нет сущности списка согласующих.                                                          | Нельзя корректно определить ожидаемые решения.                                    | Добавить `ApprovalRequestApprover` с состоянием каждого назначенного согласующего; `ApprovalDecision` остаётся append-only.                                                                                                                                                                                                                                                                                                 |
| Q-04 | Требование «все записи принадлежат workspace» не отражено во многих таблицах, где есть только `projectId`.                         | Ошибка join или фоновой задачи может дать cross-tenant доступ.                    | Хранить `workspaceId` на tenant-bound сущностях и использовать составные FK/unique constraints там, где это повышает защиту; все репозитории получают проверенный `TenantContext`.                                                                                                                                                                                                                                          |
| Q-05 | Полиморфные `entityType/entityId` в `FileLink`, `Comment`, approvals не имеют FK и не обеспечивают tenant integrity средствами БД. | Висячие и межтенантные ссылки.                                                    | Хранить `workspaceId` и `projectId`, валидировать target в транзакции, ограничить допустимые типы enum; для security-critical связей использовать явные link-таблицы.                                                                                                                                                                                                                                                       |
| Q-06 | `Invitation` описан как привязанный к компании и проектам, но схема связей не дана.                                                | Приглашённый получит лишний проект или не получит нужный.                         | `Invitation` относится к workspace/company, а `InvitationProjectGrant` перечисляет проекты и будущую роль. Принятие выполняется одной транзакцией.                                                                                                                                                                                                                                                                          |
| Q-07 | `User` не содержит auth-таблиц, пароль опционален, а magic link и приглашение смешиваются терминологически.                        | Ошибки жизненного цикла токенов и сессий.                                         | Использовать таблицы auth-библиотеки для accounts/sessions/verifications; бизнес-приглашение хранить отдельно. Invitation token и sign-in magic-link token — разные одноразовые секреты.                                                                                                                                                                                                                                    |
| Q-08 | В MVP упомянуты «обычные комментарии», а E2E и критерии требуют замечание со статусами исправления/проверки.                       | Комментарий без workflow не покрывает критический путь.                           | В MVP реализовать list-based `FeedbackItem` без DOM SDK: страница/URL, текст, опциональный скриншот, статусы и ветка комментариев. SDK добавит источник и привязку, не заменяя модель.                                                                                                                                                                                                                                      |
| Q-09 | `Project.progress` хранится, хотя он вычисляется из весов этапов.                                                                  | Рассинхронизация.                                                                 | Этапы — источник истины. `progress` — обновляемая в той же транзакции проекция; периодическая задача только сверяет и исправляет дрейф.                                                                                                                                                                                                                                                                                     |
| Q-10 | Не определены правила весов: нулевая сумма, skipped, возврат approved-этапа.                                                       | Разный процент в UI и тестах.                                                     | Вес — положительное целое; сумма автоматически нормализуется для отображения. `skipped` учитывается как завершённый только с причиной; возврат из `approved` создаёт новое событие/ревизию и требует права.                                                                                                                                                                                                                 |
| Q-11 | Не задано, публикуется ли URL до SSRF-проверки и что происходит при недоступности.                                                 | SSRF или блокировка нормальных preview с auth.                                    | Создание версии даёт `pending_check`. Worker до сетевого обращения выполняет SSRF-проверку и разделяет security result от availability result. Клиентская публикация разрешена только после безопасного результата; блокированный адрес нельзя override. Для защищённого preview допускается явно отмеченное `safe_but_unreachable`, если адрес прошёл security validation, но содержимое нельзя проверить без credentials. |
| Q-12 | Автивирус обязателен в production, но движок и состояние карантина не определены.                                                  | Вредоносный файл станет доступен до проверки.                                     | Upload проходит `initiated → uploaded → quarantine/pending → scanning → available/rejected`; metadata и скачивание клиентом до `available` запрещены. Scanner — заменяемый адаптер ClamAV или совместимого сервиса; production deployment scanner не входит в Milestone 01.                                                                                                                                                 |
| Q-13 | Архивный read-only режим не определяет исключения.                                                                                 | Либо архив нельзя восстановить, либо его продолжают менять.                       | После архивирования бизнес-мутации запрещены всем. Владелец может только восстановить, экспортировать и выполнить операции хранения/удаления.                                                                                                                                                                                                                                                                               |
| Q-14 | Сценарий завершения требует финальный платёж, но оплаты вынесены после MVP.                                                        | MVP невозможно завершить по собственному сценарию.                                | MVP требует: обязательные этапы завершены либо обоснованно пропущены, блокирующих действий нет, финальное согласование принято, checklist передачи выполнен. Финансовый gate применяется только при включённом payment-модуле и наличии обязательного неоплаченного платёжного этапа.                                                                                                                                       |
| Q-15 | Audit должен быть неизменяемым, но одновременно действуют удаление и минимизация персональных данных.                              | Конфликт аудита и privacy.                                                        | Audit append-only для приложения; при удалении PII содержимое редактируемых объектов удаляется/анонимизируется, а минимальный tombstone события сохраняется по утверждённой retention policy.                                                                                                                                                                                                                               |
| Q-16 | Событие уведомления должно создаваться атомарно с бизнес-операцией, но очередь внешняя.                                            | Commit прошёл, уведомление потеряно.                                              | Transactional outbox в PostgreSQL; dispatcher передаёт событие в BullMQ идемпотентно. Ошибка Redis не откатывает бизнес-операцию.                                                                                                                                                                                                                                                                                           |
| Q-17 | `PaymentMilestone.status`, `paidAt` и partial/refund могут противоречить сумме `Payment`.                                          | Неверная финансовая сводка.                                                       | Платежи append-only; агрегированный paid amount и статус выводятся из проводок. Возврат — отдельная отрицательная по смыслу, но положительная по величине запись с типом `refund`; суммы в API не принимаются как float.                                                                                                                                                                                                    |
| Q-18 | «Каждый экран имеет reconnecting» конфликтует с real-time после MVP.                                                               | Лишняя инфраструктура в MVP.                                                      | `reconnecting` обязателен только для экранов, где реально включён live transport. До этого используются обычные loading/error и обновление по навигации/refresh.                                                                                                                                                                                                                                                            |
| Q-19 | Цели p95 заданы без профиля окружения и методики.                                                                                  | Формально непроверяемая приёмка.                                                  | Зафиксировать staging-конфигурацию, seed-набор, concurrency и границы замера перед performance milestone. Цели ТЗ не ослабляются.                                                                                                                                                                                                                                                                                           |
| Q-20 | DoD требует code review, staging и post-deploy для каждой функции, но разработчик один.                                            | Процесс станет формальным или заблокируется.                                      | Code review — отдельный self-review/agent-review до merge; staging, миграции и smoke — критерий milestone/release, а не каждого локального коммита.                                                                                                                                                                                                                                                                         |
| Q-21 | Не определены date-only сроки и DST.                                                                                               | Дедлайн может сдвигаться на день.                                                 | Бизнес-дедлайн хранить как локальную дату + timezone области; точные события — `timestamptz` UTC. Просрочка наступает после конца локального дня, если действие не задаёт точное время.                                                                                                                                                                                                                                     |
| Q-22 | Политика CSP может конфликтовать с preview iframe, SDK и custom domains.                                                           | Небезопасное ослабление CSP.                                                      | Разделить CSP платформы и SDK; разрешённые frame origins задаются на уровне версии/проекта, без глобального `*`; `postMessage` проверяет точный origin.                                                                                                                                                                                                                                                                     |

Нереализуемых требований в ТЗ нет. Same-origin ограничение для произвольного iframe уже корректно признано; SDK и screenshot fallback являются реализуемым решением. Неопределённые юридические и инфраструктурные параметры нельзя безопасно «угадать» — они перечислены в разделе подтверждений.

## 3. Предлагаемый стек

Версии фиксируются lockfile при bootstrap. Архитектурно закрепляются major-линии; patch/minor обновляются через отдельный проверяемый PR. На 2026-07-16 рекомендуется стабильный Next.js 16.2, а не preview 16.3. Официальные основания: [Next.js releases](https://nextjs.org/blog), [Better Auth magic link](https://better-auth.com/docs/plugins/magic-link), [Better Auth sessions](https://better-auth.com/docs/concepts/session-management), [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [BullMQ](https://docs.bullmq.io/).

| Область          | Выбор                                                                                                                   | Обоснование                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Runtime          | Node.js 22.22 LTS, TypeScript strict                                                                                    | Один язык для web/worker/SDK; версия доступна локально и у целевых providers, обновление major выполняется отдельно.     |
| Monorepo         | pnpm workspaces + Turborepo                                                                                             | Строгий lockfile, быстрые локальные/CI задачи, без отдельного сервиса.                                                   |
| Web              | Next.js 16.2 App Router + React 19                                                                                      | SSR/RSC для dashboard, Route Handlers для API, зрелый full-stack deployment.                                             |
| UI               | Tailwind CSS 4, Radix UI primitives, локальные компоненты в стиле shadcn/ui                                             | Доступные primitives без зависимости от закрытого kit; компоненты принадлежат репозиторию.                               |
| Формы/валидация  | React Hook Form + Zod                                                                                                   | Общие схемы входа на клиенте и сервере; сложные/autosave формы без самописного form engine.                              |
| БД               | PostgreSQL 17+                                                                                                          | Транзакции, JSONB, полнотекстовый поиск, ограничения и зрелые managed-варианты.                                          |
| ORM/миграции     | Drizzle ORM + Drizzle Kit, `node-postgres`                                                                              | SQL-прозрачность и строгая схема; меньше магии для сложных tenant-aware запросов. Миграции проверяются как SQL.          |
| Auth             | Better Auth, database-backed sessions, magic-link plugin; invitation flow в доменном модуле                             | Одноразовые magic links, отзыв сессий и расширяемость. `storeToken: "hashed"`, signup отключён вне принятия приглашения. |
| API              | Route Handlers + application services + Zod DTO; REST для SDK                                                           | Без дополнительного RPC-фреймворка; одинаковые policy/service функции вызываются из web и API. Единый error envelope.    |
| Очередь          | Redis 7+ + BullMQ 5, отдельный worker                                                                                   | Delays, retries, scheduler и масштабирование; соответствует ТЗ. Transactional outbox закрывает разрыв БД/Redis.          |
| Файлы            | S3-compatible adapter; MinIO локально; предварительный production-кандидат Cloudflare R2                                | Приватные buckets, presigned upload/download, переносимость без зависимости бизнес-логики от provider.                   |
| Scan/preview     | Асинхронные adapters: ClamAV/managed scanner, image/PDF preview worker                                                  | Файл остаётся в карантине до результата; тяжёлая работа не выполняется web-процессом.                                    |
| Email            | React Email templates + provider adapter; Mailpit локально; предварительный production-кандидат Resend                  | Русские транзакционные шаблоны версионируются; локально реальные письма не отправляются; provider заменяем.              |
| Telegram         | Bot API adapter после MVP                                                                                               | Добровольное подключение и только deep-link уведомления.                                                                 |
| Логи/ошибки      | Pino JSON, OpenTelemetry, Sentry-compatible error adapter                                                               | Correlation/request ID, редактирование чувствительных полей, переносимая телеметрия.                                     |
| Unit/integration | Vitest, Testing Library, Testcontainers                                                                                 | Реальная PostgreSQL/Redis интеграция, быстрые domain tests.                                                              |
| E2E/a11y         | Playwright + axe-core                                                                                                   | Мобильные/desktop критические пути и автоматический accessibility smoke.                                                 |
| CI               | GitHub Actions, Docker Compose для service tests                                                                        | Проверки из ТЗ и воспроизводимое окружение.                                                                              |
| Deployment       | Предварительно Vercel для web; Railway или совместимый container provider для worker/PostgreSQL/Redis; OCI worker image | Покупка сервисов и production secrets не входят в текущий этап; adapters и конфигурация сохраняют переносимость.         |

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

**Решение:** `Comment` — сообщение/ответ, не имеющий самостоятельного workflow. MVP отдельно использует список `FeedbackItem` со статусом, приоритетом, исполнителем и веткой `Comment`; screenshot marker fallback относится к `FeedbackItem`. SDK позднее пишет в тот же `FeedbackItem`, добавляя locator context.
**Альтернатива:** ждать SDK или ошибочно использовать свободные комментарии как замечания.
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

### ADR-016. Назначенные согласующие и внешние решения

**Решение:** каждый `ApprovalRequest` имеет явный список `ApprovalRequestApprover`. Поддерживаются только `any_one` и `all_required`; для MVP default — `any_one`. Обычный `ApprovalDecision` может создать только назначенный client-side пользователь с актуальным разрешением. Workspace owner может отменить запрос с причиной или создать новый, но не согласовать от имени клиента. Решение из другого канала фиксируется отдельным append-only `ExternalDecisionRecord`/событием `recorded_externally` с источником, датой исходного решения, автором записи и пояснением; оно не маскируется под действие клиента и входит в audit trail.
**Альтернативы:** роль `primary_approver`; owner override; подмена `ApprovalDecision`.
**Причина:** режимы `any_one`/`all_required` покрывают MVP без двусмысленной роли, а история сохраняет реального автора действия.

### ADR-017. Правила прогресса проекта

**Решение:** источник истины — этапы. Каждый учитываемый этап имеет положительный целочисленный вес. Прогресс равен `sum(weight завершённых этапов) / sum(weight всех учитываемых этапов) × 100`; завершёнными считаются только `approved` и `skipped` с непустой причиной. При отсутствии этапов прогресс равен 0. Внутренне хранится точное значение/проекция, клиенту показывается округлённое целое. Возврат этапа из `approved` уменьшает прогресс и создаёт audit event. Проекция обновляется в транзакции, а background recalculation только сверяет дрейф.
**Альтернативы:** ручной процент; частичный процент по `in_progress`; считать `skipped` незавершённым.
**Причина:** формула детерминирована, тестируема и не создаёт ложной точности.

### ADR-018. Completion gate

**Решение:** проект можно завершить в MVP только если обязательные этапы `approved` либо `skipped` с причиной, нет открытых блокирующих действий, принято финальное согласование и выполнен checklist передачи. Финансовый gate включается только если payment-модуль активен для проекта и существует обязательный неоплаченный `PaymentMilestone`.
**Альтернативы:** всегда требовать оплату; разрешить owner force-complete без объяснения.
**Причина:** MVP не зависит от ещё не реализованного модуля, но сохраняет строгую передачу результата.

### ADR-019. Конфигурируемые продуктовые и retention параметры

**Решение:** product name, public/base URLs, environment names, email sender domain, provider endpoints, file limit, workspace quota, grace periods, log retention и approval template задаются типизированной конфигурацией. Defaults: `Garun Workspace`, 100 MiB на файл, 10 GiB на workspace, 30 дней grace для удалённых файлов и 90 дней технических логов. Незавершённые uploads очищаются автоматически; конкретный срок будет утверждён до Milestone 06. Значимые project decisions хранятся до явного удаления или отдельной retention policy. В коде и документации не заявляется соответствие конкретному законодательству без отдельной проверки.
**Альтернативы:** hardcoded constants/provider domains; неограниченное хранение всего.
**Причина:** переносимость между окружениями, будущие тарифы и минимизация юридически неподтверждённых утверждений.

### ADR-020. Инженерная основа и воспроизводимая сборка

**Решение:** использовать Node.js 22.22 LTS, pnpm workspace и Turborepo с одним lockfile; `web` собирается штатным Next.js build, `worker` — в ESM artifact через tsup с включёнными внутренними `@garun/*` пакетами и явными внешними runtime-зависимостями. Runtime environment проверяется Zod при использовании/старте процесса, а ошибки конфигурации содержат только имена некорректных полей. Production CSP использует request nonce; допустимые только в development `unsafe-eval`/inline styles не переходят в production. Readiness имеет ограниченные по времени подключения к зависимостям, тогда как liveness от них не зависит. Playwright использует системный stable Google Chrome, присутствующий локально и в GitHub-hosted runner, без загрузки браузера из CDN и без переиспользования dev-server. Generated `next-env.d.ts` не отслеживается согласно Next.js guidance и создаётся перед typecheck. pnpm разрешает lifecycle build только для явно перечисленных нативных пакетов, не хранит массовые исключения supply-chain policy, а уязвимые транзитивные версии временно фиксируются централизованным override до обновления upstream; GitHub Actions закреплены полными commit SHA.
**Альтернативы:** один package без workspace; Nx; публикация внутренних пакетов перед сборкой; скачиваемый Playwright Chromium; разрешение всех install scripts.
**Причина:** границы приложений и shared packages уже оправдывают лёгкую orchestration, но отдельная платформа монорепозитория не нужна. Настройка сохраняет строгий lockfile, запускаемый worker artifact, независимость browser tests от региональной доступности CDN и минимальную поверхность supply-chain scripts.

### ADR-021. Better Auth ограничен identity и session lifecycle

**Решение:** Better Auth 1.6.23 с Drizzle adapter хранит password account владельца, hashed magic-link verification и database-backed sessions. Публичные `sign-up`, прямые password/magic request endpoints отключены; приложение вызывает typed server API через собственные маршруты с одинаковыми пользовательскими ошибками. Cookie cache выключен, поэтому отзыв строки session действует немедленно. Workspace membership, роли и tenant authorization не делегируются auth-библиотеке.
**Альтернативы:** Better Auth organization/admin plugin; полностью самописная auth; JWT без server-side revocation.
**Причина:** библиотека закрывает сложный identity lifecycle, но доменные права остаются явными, scoped и тестируемыми.

### ADR-022. TenantContext и deny-by-default RBAC

**Решение:** защищённый запрос разрешает workspace только из проверенной session, активного пользователя, активного membership и server-side slug lookup. `workspaceId` из URL/body/query не становится контекстом. Централизованные policies выдают `owner` полный минимальный набор Milestone 02, а `member` — только `workspace.view`; неизвестное разрешение запрещено. Чужой и отсутствующий workspace отвечают одинаковым `404`.
**Альтернативы:** фильтр в каждом Route Handler; client-side role checks; RLS сейчас.
**Причина:** application isolation обязательна уже в MVP, а RLS остаётся отдельным pre-SaaS review.

### ADR-023. Encrypted transactional email outbox без BullMQ в Milestone 02

**Решение:** business transaction создаёт `outbox_event`; raw invitation/magic URL хранится только в AES-256-GCM envelope с отдельным конфигурируемым ключом и очищается после доставки. Worker забирает записи через `FOR UPDATE SKIP LOCKED`, сохраняет workspace context, использует стабильный Message-ID, bounded exponential backoff, восстанавливает stale claims и не логирует recipient/link/token. В Milestone 02 dispatcher опрашивает PostgreSQL напрямую; BullMQ не добавляется до появления нескольких очередей/каналов.
**Альтернативы:** raw token в JSON payload; синхронный SMTP; PostgreSQL outbox → BullMQ уже сейчас.
**Причина:** прямой dispatcher сохраняет transactional guarantee и заменяемый email adapter без преждевременной второй очереди.

### ADR-024. Принятие приглашения и вход — два разных одноразовых доказательства

**Решение:** invitation token атомарно создаёт user/membership, после чего система выпускает отдельный Better Auth magic link для session. Invitation token не становится session credential. Повторное, отозванное и истёкшее приглашение безопасно отклоняется. `InvitationProjectGrant` отложен до Milestone 03, потому что в Milestone 02 нет Project entity и разрешены только внутренние workspace invitations.
**Альтернативы:** создавать session непосредственно invitation token; заранее создавать membership; пустая project-grant таблица без Project FK.
**Причина:** разделение proof-of-invitation и proof-of-login уменьшает полномочия токена и не создаёт преждевременную проектную модель.

Статус: заменено ADR-025 по подтверждённому UX-решению владельца продукта.

### ADR-025. Одно действие пользователя при принятии приглашения

**Решение:** invitation token по-прежнему атомарно создаёт user/membership и не записывается как session credential. Сразу после успешной транзакции сервер через Better Auth выпускает отдельный hashed verification token, потребляет его внутри того же HTTP flow, устанавливает подписанную session cookie средствами Better Auth и перенаправляет пользователя в workspace. Второе письмо не отправляется. Если session issuance завершится ошибкой после acceptance, membership сохраняется, а пользователь может запросить обычный magic link. Экран ожидания входа может предложить только фиксированные ссылки Gmail, Mail.ru или Яндекс Почты по домену введённого email; автоматического перехода и произвольного webmail URL нет.
**Альтернативы:** два последовательных письма; превращение invitation token непосредственно в самописную session; автоматический redirect во внешний webmail.
**Причина:** один клик заметно снижает трение клиента, при этом session создаётся Better Auth, одноразовые secrets остаются hashed, а фиксированный allowlist webmail URL исключает open redirect.

### ADR-026. Единый локальный Compose stack

**Решение:** корневой `compose.yaml` является единственной пользовательской точкой запуска и включает полный локальный stack из `infra/compose.yaml`: PostgreSQL, Redis, MinIO, Mailpit, одноразовый migration service, web и worker. Web/worker используют один общий development image на Node.js 22.22.2/pnpm 11.9.0 и запускаются без root. Migrations завершаются успешно до старта приложений; зависимости и приложения имеют healthchecks; порты публикуются только на loopback; существующее Compose project name и именованные volumes сохраняются. Входные connection strings/secrets имеют Compose-specific `APP_` names, чтобы случайные host env не подменяли container DNS. CI запускает только четыре infrastructure services, поэтому containerized developer flow не дублирует CI host build.
**Альтернативы:** три ручных терминала; установка host Node/pnpm как обязательное условие просмотра; отдельные Compose-файлы для каждого процесса; production-like multi-stage images уже в Milestone 02.
**Причина:** одна команда снижает стоимость локального запуска и не меняет production deployment architecture; общий dev image избегает преждевременной упаковки Vercel web и отдельного worker runtime.

### ADR-027. Явный доступ к каждому проекту и раздельные DTO

**Решение:** принадлежность пользователя к компании клиента не открывает автоматически все проекты
этой компании. Доступ задаётся отдельной `ProjectMembership` с tenant-scoped composite foreign keys.
Внутренние роли — `owner`/`employee`, клиентские — `client`/`observer`; разрешения сотрудника
хранятся как versioned allowlist, неизвестные значения запрещены. Черновик не виден клиентской
стороне даже при наличии grant. Клиентский query возвращает отдельный allowlisted DTO без
`workspaceId`, внутренних заметок и внутренних участников. Удаление membership немедленно
закрывает проект; повторное приглашение может восстановить удалённую запись, не создавая дубликат.
`ClientMembership.canManageMembers` остаётся `false` по умолчанию.

**Альтернативы:** наследовать все проекты через `ClientMembership`; фильтровать общий DTO в Route
Handler; хранить роли только в workspace membership.

**Причина:** explicit grants дают минимальные полномочия, позволяют одному пользователю иметь разные
роли в разных проектах и уменьшают риск cross-project/IDOR утечки. Раздельные запросы не позволяют
случайно вернуть внутреннее поле при последующем расширении карточки.

### ADR-028. Архивирование вместо физического удаления клиентов и проектов

**Решение:** Milestone 03 не выполняет физическое удаление `ClientCompany` и `Project`. Архивация
проекта сохраняет предыдущий статус и переводит все операции изменения в read-only; восстановить
проект может владелец. Архивная компания сохраняет историю и не предлагается при создании нового
проекта. Все переходы записываются в audit trail.

**Альтернативы:** cascade delete; soft-delete без явного состояния; разрешать изменение архива.

**Причина:** связи проекта, доступы и audit нельзя безопасно терять из-за обычного действия UI, а
явный статус проще проверять политиками и тестами.

### ADR-029. Scope agreement как минимальный совместимый approval primitive

**Решение:** Milestone 04 хранит отдельные `ScopeRevisionApprover` и `ScopeApprovalDecision`.
Согласовать может только назначенный активный client project member с явным
`ClientMembership.canApprove`. Режим Milestone 04 — `any_one` с одним approver. Владелец не может
решить за клиента. Полная стратегия `any_one/all_required`, stage approvals и
`recorded_externally` добавляются в Milestone 08 поверх сохранённых решений.

**Альтернативы:** позволить owner выставить `agreed`; сразу реализовать общий approval engine;
считать главным клиента автоматически согласующим.

**Причина:** модель выполняет явное клиентское согласование и сохраняет upgrade path, не затягивая в
Milestone 04 весь scope Milestone 08.

### ADR-030. Точная транзакционная проекция прогресса

**Решение:** проект хранит `progressCompletedWeight` и `progressTotalWeight`, а процент округляет
только при чтении. После изменения этапа сервис пересчитывает оба значения в той же транзакции.
Завершёнными считаются `approved` и `skipped` с непустой причиной; этапы с
`countsTowardProgress=false` не входят в знаменатель.

**Альтернативы:** хранить процент; вычислять всё на каждом dashboard query; считать skipped
незавершённым.

**Причина:** числитель и знаменатель не теряют точность, хорошо диагностируются и совпадают с
зафиксированной формулой ADR-017.

### ADR-031. Date-only deadlines и безопасный domain outbox

**Решение:** текущий UX принимает due date без неоднозначного локального времени и сохраняет конец
дня как `23:59:59.999Z`. Domain events scope/actions создаются в одной транзакции с мутацией и несут
только tenant/project/entity IDs. Существующий worker отмечает такие события доставленными без
email; email events по-прежнему требуют encrypted secret.

**Альтернативы:** принимать `datetime-local` в timezone web server; помещать полные DTO в outbox;
добавить отдельный broker/микросервис.

**Причина:** UTC-правило воспроизводимо, payload не раскрывает содержание, а единый outbox сохраняет
надёжную границу для будущих notification consumers без преждевременной инфраструктуры.

### ADR-032. Project-local questionnaire schema snapshot

**Решение:** в Milestone 05 конструктор создаёт анкету непосредственно внутри проекта и сохраняет
валидированный `schemaSnapshot` версии 1. После открытия анкеты schema не редактируется; изменение
набора вопросов создаётся отдельной анкетой. Reusable `QuestionnaireTemplate` и библиотека шаблонов
не создаются до соответствующего milestone. Типы `file`/`image` входят в versioned contract, но
конструктор не предлагает их до готовности безопасного file subsystem Milestone 06.

**Альтернативы:** редактировать живую schema при уже существующих ответах; создать глобальную
библиотеку шаблонов заранее; показывать неработающие file controls.

**Причина:** submission всегда однозначно связан с вопросами, которые видел клиент, а продукт не
получает преждевременный template-management scope или небезопасные файловые заглушки.

### ADR-033. Отдельный optimistic draft и неизменяемые submissions

**Решение:** одна назначенная пользователю `QuestionnaireDraft` хранит mutable answers, монотонный
`version`, последний idempotency key и время подтверждённого сохранения. Autosave принимает только
expected version; stale tab получает conflict. Submit под блокировкой анкеты валидирует snapshot,
отбрасывает условно скрытые ответы и создаёт новую revision. DB trigger запрещает менять schema,
answers, revision, автора и время submission. Clarification меняет только review state и
переоткрывает тот же draft для следующей revision.

**Альтернативы:** обновлять submission; last-write-wins; создавать revision при каждом autosave;
копировать ответы в новый mutable submission при уточнении.

**Причина:** подтверждённый draft не теряется при сетевой ошибке, две вкладки не перетирают данные,
а история отправок остаётся проверяемой и компактной.

### ADR-034. Server-authoritative conditional validation и answer privacy

**Решение:** порядок полей является частью schema: condition может ссылаться только на предыдущее
поле, ID уникальны, repeating groups имеют один ограниченный уровень вложенности. Client renderer и
server validator используют одинаковый versioned contract, но authoritative результат вычисляет
сервер. Hidden answer не считается обязательным и не входит в submission. Черновик видит только
назначенный client project member; разработчик получает ответы после submit. Audit/outbox никогда
не содержат answers или comment body.

**Альтернативы:** доверять client-side validation; сохранять все hidden values в revision; показывать
разработчику незавершённый draft; помещать snapshot answers в event payload.

**Причина:** условия нельзя обойти подменой запроса, незавершённые персональные данные не раскрываются
раньше отправки, а служебные каналы не становятся копией содержимого анкеты.

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
7. Согласования конкретных ревизий с назначенными approvers, режимами `any_one` (default) и `all_required`, immutable decisions и отдельным `recorded_externally`.
8. In-app/email уведомления критического пути, reminders, transactional outbox и audit trail.
9. Архивный read-only режим, минимальный читаемый HTML/Markdown export истории, русский mobile-first UI.
10. Security, accessibility, backup/restore smoke, performance baseline и полный E2E критического пути.

В MVP намеренно отсутствуют, но не заменяются заглушками: общий чат, публичная регистрация, ручные оплаты, полноценные change requests, Telegram, white-label/custom domains, глобальный полнотекстовый поиск, Feedback SDK/DOM markers, real-time, GitHub/Vercel, эквайринг, SaaS billing и режим обслуживания. До полноценного change-request модуля потенциальное расширение scope помечается как `potential_change` и не переводится автоматически в работу; коммерческое решение фиксируется вне системы. Эта временная граница должна быть явно объяснена пользователю продукта.

## 7. Текущие решения владельца продукта

Решения подтверждены 2026-07-16. Инфраструктурные кандидаты предварительны: они не разрешают покупать сервисы, создавать production-ресурсы или добавлять реальные secrets.

| №    | Действующее решение                                                                                                                                                                                                                        | Статус                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| C-01 | Рабочее название — `Garun Workspace`; домен не выбран, URL/email domains/environment names только через конфигурацию.                                                                                                                      | Подтверждено                                      |
| C-02 | MVP только на русском, клиенты только по приглашению, публичной регистрации workspace нет; SaaS-ready multi-tenant архитектура сохраняется.                                                                                                | Подтверждено                                      |
| C-03 | Предварительно: Vercel web; Railway или совместимый container provider для worker/PostgreSQL/Redis; Cloudflare R2 для objects. Локально Docker Compose: PostgreSQL, Redis, MinIO, Mailpit. Все providers за adapters.                      | Предварительно для production                     |
| C-04 | Email: Mailpit локально без реальной отправки; Resend — production-кандидат; sender domain не выбран.                                                                                                                                      | Подтверждено локально / предварительно production |
| C-05 | Scanner — ClamAV или совместимый adapter. Файл `quarantine/pending` и недоступен клиенту до успешной проверки. Production scanner не требуется в Milestone 01.                                                                             | Подтверждено                                      |
| C-06 | Лимит файла 100 MiB, базовая quota workspace 10 GiB; оба значения конфигурируемы и позже зависят от тарифа.                                                                                                                                | Подтверждено                                      |
| C-07 | Deleted file grace — 30 дней; incomplete uploads очищаются автоматически; technical logs — 90 дней; project data/decisions — до явного удаления или отдельной policy. Всё конфигурируемо, без неподтверждённых legal claims.               | Предварительная policy подтверждена               |
| C-08 | Approval acknowledgement — настраиваемый шаблон; в development нейтральный demo text; интерфейс не называет его квалифицированной или юридически значимой ЭП.                                                                              | Подтверждено                                      |
| C-09 | `canManageClientMembers` существует как отдельное разрешение и выключено по умолчанию.                                                                                                                                                     | Подтверждено                                      |
| C-10 | `recorded_externally` — отдельный тип с source, source decision date, recorded-by author и explanation; входит в audit и не является `ApprovalDecision` клиента.                                                                           | Подтверждено                                      |
| C-11 | PostgreSQL RLS отложен до security review перед публичным SaaS. Уже сейчас обязательны application isolation, нужные `workspaceId`, deny-by-default server policies и cross-tenant/IDOR tests; client-supplied `workspaceId` недоверенный. | Подтверждено                                      |
| C-12 | Workspace owner не согласует вместо клиента: только cancel с причиной, новый request или `recorded_externally`. Внутреннее согласование выполняет явно назначенный client approver.                                                        | Подтверждено                                      |
| C-13 | Approval modes: `any_one` и `all_required`; default MVP — `any_one`; список назначенных approvers хранится явно.                                                                                                                           | Подтверждено                                      |
| C-14 | MVP completion gate: обязательные этапы, отсутствие blocking actions, final approval, handover checklist; payment gate только при активном payment-модуле и обязательном unpaid milestone.                                                 | Подтверждено                                      |
| C-15 | Milestones 00–13 и граница первого рабочего MVP Milestones 01–10 приняты.                                                                                                                                                                  | Подтверждено                                      |

До отдельного решения остаются открытыми точный домен, юрисдикция/регион данных, production accounts/тарифы, sender domain, конкретный deployment scanner, срок очистки incomplete uploads и финальный юридический текст. Они не блокируют локальный Milestone 01.
