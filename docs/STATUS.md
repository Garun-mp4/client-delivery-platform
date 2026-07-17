# Статус реализации

Последнее обновление: 2026-07-17
Общий статус: Milestones 00–04 завершены

## Текущий milestone

**Milestone 04 — scope, этапы, действия и dashboards — завершён.** Реализованы versioned scope,
явное клиентское согласование, этапы, actions, точный progress, calculated blockedByClient и
минимальные internal/client dashboards. Scope Milestone 05 не начат.

## Завершённые задачи

- Добавлены `ProjectScopeRevision`, `ScopeRevisionApprover`, `ScopeApprovalDecision`,
  `ProjectStage`, `ActionItem` и точная progress projection в `Project`.
- Agreed scope защищён от изменения DB trigger; один активный и один agreed revision на проект
  обеспечены partial unique indexes.
- Scope согласовывает только назначенный client project member с явным `canApprove`; owner не может
  решить за клиента. Запрос изменений создаёт следующий draft revision.
- Реализованы server-side state machines этапов/actions, обязательные result/skip reason, overdue,
  next-action ranking, blockedByClient и completion-gate rules.
- Все workflow services проверяют active tenant, workspace/project composite scope, permission и
  assignee/approver. Client DTO скрывает internal stages/actions и чужие назначения.
- Scope, stage и action mutations транзакционно создают audit/outbox events. Worker безопасно
  различает email и domain events.
- Добавлен русскоязычный mobile-friendly экран «План, этапы и действия» с одним dominant client CTA.
- Добавлены unit, integration, tenant/IDOR, immutable scope, exact progress, E2E и axe tests.
- Созданы ADR-029–031 и `docs/SCOPE_STAGES_ACTIONS.md`.

## Текущие задачи

- Активных задач реализации нет. Изменения Milestone 04 находятся в
  `feat/milestone-04-scope-stages-actions`.

## Найденные проблемы

- Первый generated SQL создавал composite foreign keys раньше необходимых unique indexes. Итоговая
  миграция `0005_smiling_kabuki.sql` переупорядочена и проверена на отдельной чистой PostgreSQL 17
  базе.
- `RESTRICT` на новых workspace membership references мешал каскадному физическому удалению всего
  workspace. Для сущностей Milestone 04 используется cascade; приложение по-прежнему только
  отключает/soft-removes отдельные memberships.
- Первый полный quality gate нашёл один неиспользуемый import и незапущенный после правки Prettier;
  import удалён, форматирование повторено.
- Первый расширенный E2E дошёл до конца workflow, но остался на workflow URL перед отзывом project
  access и исчерпал старый 30-секундный timeout. Тест явно возвращается в карточку проекта и имеет
  60-секундный лимит; повторный critical flow прошёл.

## Принятые решения

- ADR-029: минимальный scope approval primitive — один явный approver, `any_one`; общий approval
  engine остаётся Milestone 08.
- ADR-030: progress хранит точные completed/total weights, процент округляется только при чтении.
- ADR-031: due date сохраняется как однозначный UTC end-of-day; domain outbox не содержит business
  content или secrets.
- Stage `approved` намеренно недоступен через общий status endpoint до approval flow Milestone 08;
  owner не может подменить клиентское решение.

## Выполненные проверки

- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` —
  успешно.
- Миграция `0005` применена как upgrade локального Compose и на отдельной чистой PostgreSQL 17 базе.
- `pnpm test:integration` — 20/20, включая 3 workflow/tenant/immutability теста.
- `pnpm build` и `pnpm verify:artifacts` — успешно; web route tree и независимый worker artifact
  собраны.
- `docker compose up -d --build --wait` — успешно; migration exit 0, web/worker/PostgreSQL/Redis/
  MinIO/Mailpit healthy.
- `pnpm test:e2e` — 15/15 после ограничения Playwright двумя workers; workflow проверен на mobile
  viewport и axe-core.
- Первый web smoke после параллельных проверок превысил пятисекундный timeout dev-server; немедленный
  повторный `pnpm smoke` прошёл для web и worker.
- `pnpm audit --prod` — известных уязвимостей нет; `git diff --check`, tracked artifact scan и
  high-confidence secret scan — успешно.

## Следующие действия

1. Завершить финальный quality/security gate и push ветки Milestone 04.
2. Вручную проверить owner/client UX в Compose на desktop и телефоне.
3. Следующий milestone — 05 (анкеты и сбор информации), но не начинать без явного запроса.

## Известные ограничения

- Полная approval strategy, несколько approvers, `all_required`, stage approvals и
  `recorded_externally` относятся к Milestone 08.
- Completion gate определён и протестирован, но фактическое завершение проекта остаётся закрытым до
  handover/final approval модулей; payment gate включится только вместе с payment module.
- Изменение `canApprove` для уже приглашённого клиента пока не имеет отдельного UI: право задаётся
  при приглашении. Это не мешает критическому flow Milestone 04.
- RLS отложен; защита основана на application policies, composite constraints и tenant/IDOR tests.
- Локальный Compose использует development image; production build проверяется отдельно.
