# Статус реализации

Последнее обновление: 2026-07-17
Общий статус: Milestones 00–03 завершены

## Текущий milestone

**Milestone 03 — клиенты, проекты и участники — завершён.** Реализованы только компании клиентов,
проекты, явные memberships/grants, публикация, приглашение клиента, tenant policies и минимальные
внутренний/клиентский интерфейсы. Scope Milestone 04 не начат.

## Завершённые задачи

- Добавлены `ClientCompany`, `ClientMembership`, `Project`, `ProjectMembership`,
  `ClientInvitationContext` и `InvitationProjectGrant` с tenant composite foreign keys, indexes,
  uniqueness и state checks.
- Реализованы создание, редактирование, архивирование и восстановление компаний и проектов.
- Черновик скрыт от client/observer; архив read-only; клиентский DTO не содержит внутренних заметок
  и tenant/internal полей.
- Project access выдаётся отдельно для каждого проекта. Поддержаны owner, employee с versioned
  grants, client и read-only observer; неизвестные разрешения запрещены.
- Добавлены owner preview без impersonation, публикация, клиентское приглашение, повторная отправка,
  одношаговое принятие и немедленный отзыв project membership.
- Invitation acceptance транзакционно создаёт/восстанавливает company/project memberships и session.
  Повторное приглашение не создаёт дубликаты.
- `project-invitation` проходит через существующий encrypted transactional outbox и worker; raw token
  отсутствует в БД, обычном payload, audit и логах.
- Добавлены русскоязычные mobile-friendly списки/карточки клиентов и проектов, internal/client shells,
  empty/error/read-only states и подтверждения опасных действий.
- Добавлены mass-assignment, policy, cross-tenant, cross-project, IDOR, archive, invitation/outbox,
  access revocation, E2E и accessibility tests.
- Созданы ADR-027/ADR-028 и `docs/CLIENTS_AND_PROJECTS.md` с flow, permission matrix, tenant rules и ER
  diagram.

## Текущие задачи

- Активных задач реализации нет. Требуется зафиксировать и отправить ветку
  `feat/milestone-03-clients-projects`; она основана на commit Milestone 02 и должна объединяться
  после Milestone 02.

## Найденные проблемы

- Drizzle сначала сгенерировал composite foreign keys раньше необходимых composite unique indexes.
  SQL `0003` переупорядочен без изменения схемы; чистая PostgreSQL миграция и drift-check проходят.
- Первые integration-запуски использовали неверный пароль/контейнерный hostname с Windows host.
  После загрузки локальной конфигурации project suite прошёл 7/7.
- E2E сначала переиспользовал Docker-worker, созданный до project email template. Worker пересоздан из
  актуального общего image; письмо и одношаговый flow прошли.
- Прямой client POST создания проекта сначала возвращал redirect на конечную страницу. Endpoint
  теперь выполняет явный `projects.create` check до parsing/mutation и возвращает безопасный 404.
- Self-review выявил, что employee видел owner-only navigation и клиентский заголовок списка.
  Internal/management UI states разделены; серверные policies не изменялись.
- Первый полный integration-run после перезапуска Docker не нашёл остановленный MinIO. После
  `docker compose up -d --wait minio` полный набор прошёл 17/17.
- Первый Compose web smoke после пересборки попал в пятосекундный timeout во время загрузки
  development SWC/компиляции. После прогрева повторный web/worker smoke прошёл.

## Принятые решения

- ADR-021–026 Milestone 02 остаются действующими.
- ADR-027: company membership не открывает проекты автоматически; каждый проект требует явный
  `ProjectMembership`, а internal/client DTO и queries разделены.
- ADR-028: компании и проекты архивируются без физического удаления; архив проекта read-only и
  сохраняет предыдущий статус.
- `canManageClientMembers` остаётся выключенным по умолчанию; самостоятельное управление коллегами
  клиента в Milestone 03 не добавлено.

## Выполненные проверки

- `pnpm install --frozen-lockfile` — успешно, lockfile не менялся.
- `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` — успешно; core
  содержит 20 unit tests.
- `pnpm db:generate` — `No schema changes`; migrations `0000`–`0004` дважды применены на отдельной
  чистой PostgreSQL 17 базе.
- `pnpm test:integration` — 17/17, включая 7 project/tenant/IDOR тестов.
- `pnpm build` и `pnpm verify:artifacts` — успешно; worker artifact не импортирует workspace
  TypeScript sources.
- `pnpm test:e2e` — 15/15; project critical flow, mobile viewport и axe-core прошли.
- `docker compose up -d --build --wait` завершил сборку после превышения лимита вызывающей команды;
  последующая `docker compose up -d --wait` подтвердила healthy web, worker, PostgreSQL, Redis, MinIO,
  Mailpit и migration exit 0.
- Повторный `pnpm smoke` — web/worker успешно; `pnpm audit --prod` — известных уязвимостей нет.
- `git diff --check`, tracked artifact scan и high-confidence secret pattern scan — успешно.

## Следующие действия

1. Создать осмысленные commits и отправить `feat/milestone-03-clients-projects` в `origin`.
2. Дождаться успешного GitHub Actions run и создать Pull Request после/поверх Milestone 02.
3. Вручную проверить owner/client UX в Compose на desktop/mobile.
4. Следующий milestone — 04 (scope, этапы, действия и dashboards), но к нему не приступать до
   объединения и явного запроса.

## Известные ограничения

- Ветка Milestone 03 основана на ещё не объединённом commit Milestone 02 (`75fbbb7`); merge order
  обязателен: Milestone 02, затем Milestone 03.
- RLS по подтверждённому решению отложен; текущая защита — application-level scoped policies,
  composite constraints и автоматические tenant/IDOR tests.
- Клиентская компания не даёт неявный доступ ко всем проектам; это намеренная модель least
  privilege.
- Employee grants управляют только конкретным проектом. UI выдачи workspace-wide permissions и
  кастомные роли не входят в Milestone 03.
- Client self-management, scope/этапы/actions, анкеты, файлы, версии, approvals и оплаты отсутствуют
  до следующих milestones.
- Локальный Compose использует development image; первый web request после чистой пересборки может
  потребовать прогрева. Production build и Playwright используют готовый build и такого сбоя не
  показали.
