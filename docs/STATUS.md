# Статус реализации

Последнее обновление: 2026-07-16
Общий статус: Milestones 00–02 завершены

## Текущий milestone

**Milestone 02 — identity, workspace, RBAC и tenant isolation — завершён.** Scope ограничен identity, sessions, workspace membership, internal invitations, policies, tenant isolation, audit и transactional email outbox. Milestone 03 не начат.

## Завершённые задачи

- Milestones 00–01 сохранены без изменения принятых границ.
- Добавлен `@garun/auth` с Better Auth 1.6.23, Drizzle adapter, password bootstrap flow, hashed single-use magic links и database-backed sessions.
- Публичные signup и прямые auth request paths отключены; UI использует безопасные server wrappers, generic errors, Origin/CSRF guard и rate limits.
- Создан идемпотентный непубличный owner/workspace bootstrap с audit event.
- Реализованы workspace, owner/member membership, централизованные permissions и deny-by-default `TenantContext`.
- Реализованы owner-only internal invitations: create, resend, revoke, expiry, atomic acceptance и защита от double consume.
- Raw tokens отсутствуют в БД/audit/log payload; email URL находится только в AES-256-GCM outbox envelope и удаляется после доставки.
- Worker отправляет Mailpit/SMTP email, использует stable Message-ID, bounded retry/backoff, stale-claim recovery и tenant-scoped recipient lookup.
- Реализованы own session list/revoke/logout, owner revoke member sessions и membership disable с немедленным session revoke.
- Добавлены русскоязычные mobile-friendly страницы login, sent, invitation states, access denied и минимальный workspace access UI.
- Полный локальный stack запускается одной командой `docker compose up -d --build --wait`: migrations, web и worker зависят от healthchecks PostgreSQL/Redis/Mailpit, работают в общем non-root development image и сохраняют прежние volumes.
- Добавлены unit, PostgreSQL integration, tenant/IDOR/security, desktop E2E и accessibility tests. Полный E2E проходит bootstrap → owner magic login → invitation email → одношаговое acceptance с session → owner denial → session/logout.
- Миграции `0001_robust_nova.sql` и `0002_yielding_micromax.sql` применены на чистой PostgreSQL 17 базе и безопасно запущены повторно; drift отсутствует.

## Текущие задачи

- Активных задач реализации нет. Ветка `feat/milestone-02-identity-workspace` готовится к Pull Request и не объединяется автоматически.

## Найденные проблемы

- Better Auth database rate limiting требует отдельную `rate_limit` table; она добавлена второй migration и проверена реальным magic-link flow.
- Первый outbox dispatcher мог оставить stale `processing` record и повторно брать terminal `failed`; добавлены recovery и bounded terminal state.
- Первоначальный E2E использовал `127.0.0.1`, тогда как auth links и cookie origin использовали `localhost`; тестовый canonical origin унифицирован на `localhost:3100`.
- Параллельный desktop/mobile critical-flow test потреблял один и тот же single-use owner magic token. Полный flow оставлен в desktop Chrome, а mobile проект отдельно проверяет responsive/a11y страницы.
- Direct member invitation request сначала возвращал redirect после policy exception. Owner permission теперь проверяется до mutation и чужой/запрещённый запрос получает одинаковый `404`.
- Production audit выявил уязвимые версии Nodemailer и транзитивного esbuild; Nodemailer обновлён до 9.0.3, esbuild закреплён на 0.28.1, `pnpm audit --prod` добавлен в CI.
- E2E global setup раньше зависел от переменных родительского shell, несмотря на подготовленный `apps/web/.env`; setup теперь безопасно загружает локальный env-файл, и документированная команда работает напрямую.
- Первый branch CI обнаружил, что strict Turbo build env не пропускал `DATABASE_URL` и `REDIS_URL` в Linux Next.js build; обе переменные явно добавлены в build allowlist.
- Self-review расширил redaction auth/outbox secrets, добавил deny-by-default parsing permission JSON и обязательное подтверждение опасных session/membership/invitation действий.
- Production deployment, sender domain, Resend credentials и реальные secrets намеренно не создавались.

## Принятые решения

- ADR-021: Better Auth отвечает за identity/session lifecycle, доменные права остаются в policy layer.
- ADR-022: TenantContext разрешается только из session + active membership + server lookup; client `workspaceId` недоверенный.
- ADR-023: Milestone 02 использует encrypted PostgreSQL outbox с прямым worker polling; BullMQ отложен до появления оправданной очереди.
- ADR-024 сохранён как история первоначального решения и заменён ADR-025.
- ADR-025 заменяет ADR-024 для пользовательского flow: отдельный verification proof потребляется server-side, поэтому invitation acceptance сразу открывает workspace без второго письма.
- ADR-026: корневой Compose — единая точка локального запуска полного stack; CI по-прежнему поднимает только infrastructure services.

## Выполненные проверки

- `docker compose up -d --build --wait` собрал общий image, применил migrations и дождался healthy web, worker, PostgreSQL, Redis, MinIO и Mailpit; migration service завершился с кодом 0.
- `docker compose down` → `docker compose up -d --wait` повторно поднял stack за 19 секунд без удаления named volumes; существующий owner сохранился.
- Container runtime проверен как non-root UID 1000; Compose logs не содержат настроенных локальных secret values; host `DATABASE_URL` не подменяет container service URL.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (10/10), `pnpm build`, `pnpm verify:artifacts`, `pnpm test:e2e` (13/13), повторный `pnpm smoke` и `pnpm audit --prod` прошли.
- Первый smoke сразу после параллельного E2E попал в пятосекундный timeout во время dev-компиляции `/`; readiness оставался healthy, повтор после завершения компиляции прошёл. Production build/E2E этой проблемы не показали.

## Следующие действия

1. Создать Pull Request из `feat/milestone-02-identity-workspace` и проверить итоговый GitHub Actions run.
2. Вручную проверить локальный Mailpit flow и UX owner/member на desktop/mobile.
3. После принятия владелец может объединить ветку с `main`.
4. Следующий milestone — 03 (клиенты и проекты), но работа над ним не начата.

## Известные ограничения

- RLS отложен до отдельного pre-SaaS security review; текущая защита — application-level policies и cross-tenant/IDOR tests.
- Email delivery имеет at-least-once semantics; stable Message-ID ограничивает дубликаты, но exactly-once SMTP не обещается.
- Локальный sender использует `.invalid`; production sender/domain/provider остаются конфигурацией без credentials.
- Owner password создаётся только bootstrap CLI; invited members входят magic link. Password reset, MFA и публичный SaaS onboarding вне Milestone 02.
- `InvitationProjectGrant` не создан до появления Project в Milestone 03; текущие invitations дают только workspace member access.
- Audit UI/export появятся по плану позже; Milestone 02 создаёт и тестирует append-only records в БД.
