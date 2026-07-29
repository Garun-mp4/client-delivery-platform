# Поэтапный план разработки Client Delivery Platform

Статус: принят владельцем продукта; Milestones 01–10 подтверждены как первый рабочий MVP
Дата: 2026-07-16
Источник требований: `PROJECT_SPEC.md`
Архитектурные решения: `docs/DECISIONS.md`

## 1. Правила исполнения плана

1. Milestones выполняются последовательно. Новый milestone не начинается, пока критерии предыдущего не выполнены или владелец явно не изменил план.
2. Каждый milestone — вертикальный рабочий срез: схема, server policies, UI states, audit/notifications (если применимо), тесты и документация завершаются вместе.
3. Незавершённая функция не показывается пользователю. Feature flag допустим для rollout, но не заменяет реализацию.
4. Tenant определяется только из проверенной сессии и membership. Любой идентификатор из URL/body повторно проверяется на сервере.
5. Все значимые мутации имеют validation, authorization, transaction, idempotency там, где возможен retry/double click, audit и стабильный error code.
6. После Milestone 01 стандартный quality gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`. Для изменённого критического пути дополнительно `pnpm test:e2e`.
7. Перед миграцией проверяются generated SQL, применение к пустой БД и обновление с предыдущей версии. Destructive migration требует отдельного плана и backup.
8. По завершении milestone обновляются `docs/STATUS.md`, README/тематическая документация, seed и traceability требований.
9. Команды ниже являются целевыми контрактами scripts. В Milestone 01 они должны быть реально добавлены; до этого не следует притворяться, что проверки существуют.

## 2. Карта релизов

| Milestone | Рабочий результат                                      | Релизная граница                |
| --------- | ------------------------------------------------------ | ------------------------------- |
| 00        | Утверждённый план и решения                            | Planning baseline               |
| 01        | Воспроизводимый skeleton и CI                          | Engineering foundation          |
| 02        | Безопасный вход и tenant isolation                     | Identity foundation             |
| 03        | Клиенты, проекты, участники и client shell             | First shared workspace          |
| 04        | Scope, этапы, действия и dashboards                    | Project control loop            |
| 05        | Анкеты с autosave и revisions                          | Information collection loop     |
| 06        | Материалы и безопасные versioned files                 | Asset collection loop           |
| 07        | Обновления, URL-версии и замечания                     | Review loop                     |
| 08        | Согласования и неизменяемая история                    | Decision loop                   |
| 09        | Уведомления, reminders и архив                         | End-to-end MVP feature complete |
| 10        | Export, hardening и pilot readiness                    | Первый рабочий MVP              |
| 11        | Templates, change requests, payments, search, Telegram | Professional workflow           |
| 12        | Feedback SDK и screenshot marker mode                  | Visual feedback release         |
| 13        | Интеграции, maintenance и SaaS readiness               | Post-MVP expansion              |

Milestones 01–10 образуют первый рабочий MVP. Milestones 11–13 сохраняют остальной scope ТЗ и не являются причиной задерживать пилот.

## 3. Milestone 00 — архитектурная baseline

**Цель.** Превратить ТЗ в согласованный, исполнимый план без начала продуктовой реализации.

**Функции/результат.** Полный анализ требований; список неоднозначностей; окончательный предлагаемый стек; MVP boundary; milestones; правила дальнейшей работы.

**Модули и файлы.** `PROJECT_SPEC.md` только читается; создаются `AGENTS.md`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/STATUS.md`.

**База данных.** Нет.

**Безопасность.** На уровне проекта фиксируются tenant isolation, deny-by-default, secret/PII redaction, безопасные файлы, SSRF boundary и запрет production до решения privacy/provider вопросов.

**Тесты.** Проверка структуры и ручная трассировка всех разделов ТЗ к milestones.

**Команды проверки.** `git diff --check`; `git status --short`; поиск обязательных секций через `rg`.

**Критерии приёмки.** Все четыре документа существуют; каждый будущий milestone содержит десять требуемых полей; открытые решения явно отделены от принятых; реализационного кода и зависимостей нет.

**Зависимости.** Нет.

**Не входит.** Scaffold, package manager, БД, UI, auth и любой product code.

## 4. Milestone 01 — engineering foundation

**Цель.** Получить минимальное приложение и worker, которые воспроизводимо запускаются локально и проходят CI.

**Функции.** pnpm/Turborepo; Next.js shell на русском; health/readiness endpoints; worker health; env validation; базовые design tokens и доступные компоненты; structured logger с redaction; единый error envelope/request ID; единый локальный Docker Compose для web, worker, migrations, PostgreSQL, Redis, MinIO и Mailpit; CI quality gates. Product name, public URLs, environment names, provider endpoints, limits и retention defaults задаются конфигурацией без production secrets.

**Модули и файлы.** Корневые `package.json`, `pnpm-workspace.yaml`, `turbo.json`, lockfile и `compose.yaml`; `apps/web`, `apps/worker`; `packages/config`, `packages/contracts`, `packages/ui`, `packages/observability`, `packages/db`; `infra/compose.yaml`, `infra/Dockerfile.local`; `.github/workflows/ci.yml`; `.env.example`; README и local setup.

**База данных.** Initial infrastructure migration с migration journal и единственной служебной таблицей `system_metadata`; проверка соединения. Бизнес-схемы ещё нет.

**Безопасность.** Fail-fast env schema; секреты только через environment/secret store; `.env*` игнорируются кроме package-level `.env.example`; домены не hardcode; CSP baseline, security headers, generic production errors; логи проходят redaction tests. Предварительные Vercel/Railway/R2/Resend настройки не создают production resources и не требуют реальных credentials.

**Тесты.** Unit для env/error/redaction/request ID; integration smoke PostgreSQL migration/Redis/S3/Mailpit; component smoke UI; Playwright desktop/mobile и axe smoke; production build и health smoke.

**Команды проверки.** `corepack enable`; `pnpm install --frozen-lockfile`; `pnpm format:check`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `docker compose up -d --build --wait`; `pnpm test:integration`; `pnpm build`; `pnpm test:e2e`; запуск production web/worker и `pnpm smoke`.

**Критерии приёмки.** Новый checkout поднимается по README одной Compose-командой после создания локального env; migrations применяются до старта приложений; web и worker healthy; PostgreSQL/Redis/MinIO/Mailpit доступны локально; повторный запуск сохраняет volumes; все команды зелёные в CI; отсутствуют hardcoded domain/secrets; Russian shell корректен на mobile/desktop; production build не требует dev-only service credentials.

**Зависимости.** Milestone 00 и подтверждение базового стека.

**Не входит.** Auth, workspace, бизнес-таблицы, dashboard, файлы и внешняя отправка email.

## 5. Milestone 02 — identity, workspace и tenant isolation

**Цель.** Безопасно идентифицировать владельца/клиента и гарантировать изоляцию workspace до появления бизнес-функций.

**Функции.** Bootstrap первого owner; workspace profile (name/logo reference/accent); Better Auth database sessions; email+password для owner; одношаговое принятие invitation с server-side Better Auth session issuance; обычный magic link для последующих входов; expiration/revoke/single-use; logout, revoke sessions, disable user; onboarding screen; WorkspaceMembership roles/permission schema; server policy layer; rate limits; audit security events.

**Модули и файлы.** `packages/auth`; `packages/core/src/modules/auth`, `workspaces`, `audit`; auth Route Handlers/pages; workspace settings UI; tenant-aware repository helpers; email outbox stub сохраняет событие, но dev transport выводит безопасный preview без токена в лог.

**База данных.** `User`, auth `Account/Session/Verification`, `Workspace`, `WorkspaceMembership`, `Invitation`, `InvitationProjectGrant` (пока grants могут быть пустыми), `AuditEvent`, `OutboxEvent`; normalized unique email; token hash/expiry/revocation indexes; workspace composite keys.

**Безопасность.** `storeToken: hashed`; атомарное consume; cookie secure/httpOnly/SameSite, Origin/CSRF checks; password hashing библиотекой; anti-enumeration response; per-IP+email rate limits; re-auth primitive; no public signup; actor/tenant never accepted from body; audit metadata allowlist.

**Тесты.** Unit permissions/session state; integration invite accept concurrency, expired/revoked token, disable/revoke, duplicate email, audit; cross-tenant/IDOR suite; CSRF/rate-limit/XSS smoke; E2E owner login and client invitation acceptance.

**Команды проверки.** Standard quality gate; `pnpm db:migrate:test`; `pnpm test:security -- auth tenancy`; `pnpm test:e2e --grep "auth|invitation"`.

**Критерии приёмки.** Повторное использование magic link невозможно; отключённый пользователь теряет активные сессии; запрос с подменённым workspace получает безопасный 404/403 без утечки; owner может отозвать сессии; audit не содержит токен/email сверх утверждённой маски.

**Зависимости.** Milestone 01; настроенный dev email sink. Production email provider ещё не нужен.

**Не входит.** Клиентские компании, проекты, project grants UI, social auth, public registration, 2FA и custom domain.

## 6. Milestone 03 — клиенты, проекты и участники

**Цель.** Создать первое реальное общее пространство: разработчик заводит клиента/проект, назначает доступ, клиент видит опубликованный проект.

**Функции.** CRUD/archive ClientCompany; internal notes; создание draft Project с обязательными полями; owner/employee/client/observer project memberships; publish/invite flow; списки и карточки проектов; developer/client layouts; preview client view; пустые/permission/read-only states; отдельный доступ к каждому проекту.

**Модули и файлы.** `clients`, `projects`, `memberships`; developer routes `/projects`, `/clients`; client project home shell; policy matrix fixtures; project/client forms and DTO.

**База данных.** `ClientCompany`, `ClientMembership`, `Project`, `ProjectMembership`; archive timestamps; unique `(workspaceId, slug)`, membership constraints, composite FK tenant ownership; invitation project grants начинают применяться.

**Безопасность.** Internal notes и billing placeholders исключаются из client DTO; project publish visibility проверяется сервером; client user видит только explicit grants; observer read-only; mass assignment tests для owner/status/workspace fields.

**Тесты.** Unit permission matrix; integration create/publish/archive client/project, duplicate memberships, invite grants; cross-role/cross-project/cross-tenant tests; E2E owner создаёт проект и клиент входит только в него; responsive/a11y layouts.

**Команды проверки.** Standard quality gate; `pnpm test:security -- projects memberships`; `pnpm test:e2e --grep "project access"`.

**Критерии приёмки.** Draft невидим клиенту; internal notes никогда не входят в client response; один пользователь имеет разные grants на разные проекты; повторное приглашение не создаёт дубликат; пустой client home объясняет следующее действие.

**Зависимости.** Milestone 02.

**Не входит.** Scope, этапы, actions, анкеты, файлы и сложные workspace branding settings.

## 7. Milestone 04 — scope, этапы, действия и dashboards

**Цель.** Дать сторонам прозрачный план, границу работ и одно актуальное следующее действие.

**Функции.** ProjectScopeRevision draft/review/agreed/superseded; понятная client summary; минимальный diff revisions; этапы со state machine, весами, dates, criteria, visibility и skip reason; actions со сроками/приоритетом/visibility; calculated blockedByClient; progress projection; developer overview и project dashboard; mobile-first client home с одним dominant CTA.

**Модули и файлы.** `projects/scope`, `stages`, `actions`, dashboard queries; policy/state-machine files; scope/stage/action screens; dashboard aggregate read model.

**База данных.** `ProjectScopeRevision` с недостающими contract/cost/date links; `ProjectStage`; `ActionItem`; revision uniqueness; positive integer weights; status checks; indexes по assignee/due/status; audit/outbox events. Scope agreement использует минимальный общий approval primitive с явным назначенным client approver и `any_one`, который Milestone 08 расширит без подмены уже записанных решений.

**Безопасность.** Только уполномоченный главный клиент подтверждает scope; agreed revision immutable; internal actions/criteria фильтруются DTO; status transitions только service methods; due dates/timezone нормализованы; dashboard queries tenant-scoped и не принимают owner ID от клиента.

**Тесты.** Unit stage/project state machines, точной формулы progress, skipped/zero/reopen edge rules, blockedByClient, overdue/date timezone, next-action ranking; integration scope revision concurrency, assigned approver, dashboard aggregates, immutable agreed scope; permission/tenant tests; E2E create scope → назначенный клиент agrees → stage/action → client completes action.

**Команды проверки.** Standard quality gate; `pnpm test -- state-machine progress policies`; `pnpm test:integration -- dashboard scope`; `pnpm test:e2e --grep "scope|next action"`.

**Критерии приёмки.** Agreed scope нельзя изменить; новая правка создаёт revision; scope принимает только назначенный client approver; проект не завершается при незавершённом обязательном этапе; dashboard ссылается на причину блокировки; клиент на телефоне понимает единственное следующее действие. Прогресс: сумма весов `approved` и `skipped` с причиной делится на сумму положительных весов всех учитываемых этапов; без этапов 0%; reopen уменьшает прогресс; клиент видит округлённое целое; transaction projection и recalculation совпадают.

**Зависимости.** Milestone 03.

**Не входит.** Шаблоны scope/project, полноценный approval strategy, change request pricing и payments.

## 8. Milestone 05 — анкеты и сбор информации

**Цель.** Клиент заполняет сложную анкету частями без потери данных, а разработчик принимает revision или просит уточнение.

**Функции.** Questionnaire templates внутри конкретного проекта (workspace reusable templates позднее); sections; все типы полей ТЗ, включая file/image reference, conditional visibility и repeating groups; hints/examples; validation; autosave status/progress; submit revision; accept/request clarification; comment к ответу; resume deep link.

**Модули и файлы.** `questionnaires`; versioned form schema/renderer; autosave API/service; developer builder с ограниченным безопасным набором элементов; client form; answer comment links.

**База данных.** `Questionnaire`, `QuestionnaireSubmission`, schema snapshot, separate mutable `QuestionnaireDraft` с optimistic version; template table можно создать, но reusable management UI не показывать; unique revisions and submission state constraints.

**Безопасность.** Schema и answers валидируются сервером по snapshot; hidden conditional answer не считается доверенным/обязательным; rich text отсутствует или санитизируется; file answers ссылаются только на доступные FileObject; autosave проверяет assignee/project/tenant; PII не идёт в logs/analytics.

**Тесты.** Unit conditional rules, repeating groups, validation/progress, schema version compatibility; integration concurrent autosave, refresh persistence, immutable submission, clarification/new revision, unauthorized answer access; component keyboard/forms; E2E partial save → reload → submit → clarification → resubmit.

**Команды проверки.** Standard quality gate; `pnpm test -- questionnaire`; `pnpm test:integration -- questionnaire-autosave`; `pnpm test:e2e --grep "questionnaire"`; `pnpm test:a11y -- questionnaire`.

**Критерии приёмки.** Offline/network error не уничтожает последний подтверждённый draft; UI показывает время сохранения; stale tab получает conflict и не перетирает новый ответ; submitted revision неизменяема; обязательность/условия совпадают client/server.

**Зависимости.** Milestone 04; file/image fields до Milestone 06 работают только после включения file subsystem и не показываются раньше feature readiness.

**Не входит.** Большая библиотека reusable templates, импорт анкет, AI generation и analytics answers.

## 9. Milestone 06 — материалы и безопасные файлы

**Цель.** Полностью заменить разрозненную передачу материалов приватным versioned workflow.

**Функции.** Material request/status/revisions; action+transactional notification outbox при запросе; upload с телефона, multi-upload/progress; image/PDF preview; категории/связи; replace/current/final; `quarantine/pending` scan через заменяемый ClamAV-compatible adapter; signed download; cleanup incomplete uploads; поиск по metadata; developer accept/clarify. Defaults 100 MiB/file и 10 GiB/workspace берутся из конфигурации/будущего тарифа.

**Модули и файлы.** `materials`, `files`; `packages/storage`; upload/download Route Handlers; worker scan/preview/cleanup jobs; mobile uploader; material screens.

**База данных.** `Material`, `MaterialRevision`, `FileObject`, `FileLink`; explicit `workspaceId/projectId`, upload state, scan engine/result timestamps, checksum, version/current constraints; indexes; outbox/job idempotency records.

**Безопасность.** MIME sniffing плюс allowlist, extension not trusted; normalized display name; random storage key; size/quota enforcement before and after upload; private bucket; no HTML inline; Content-Disposition attachment; download re-authorized; short TTL. Клиент не получает metadata/download до `available`; `quarantine/pending` и `scanning` недоступны. Scan required in production; EXIF policy documented; zip bombs/oversize rejected; scanner/provider заменяемы.

**Тесты.** Unit file policy/names/quota/state; integration presigned lifecycle, forged target/project, expired link, forbidden MIME, scan fail, replace atomicity, cleanup idempotency, cross-tenant download; E2E mobile upload/replace/accept; storage failure degradation.

**Команды проверки.** Standard quality gate; `pnpm test:integration -- files materials storage`; `pnpm test:security -- upload download`; `pnpm test:e2e --grep "material|file"`.

**Критерии приёмки.** Файл недоступен до scan success; запрет нельзя обойти изменением extension/MIME request; старая revision сохраняется; expired signed URL не работает; чужой tenant не получает ни metadata, ни download URL; failed upload можно безопасно повторить.

**Зависимости.** Milestone 05; production требует подтверждения storage/scanner/max size/retention.

**Не входит.** Content search, public shares, cloud-drive integrations, client-side editing и full ZIP export.

## 9.5. Milestone 06.5 — UX foundation, application shell и производительность

**Цель.** До расширения продукта привести реализованные Milestones 01–06 к состоянию, в котором
владелец и клиент без отдельной инструкции понимают текущее состояние, следующее действие и
навигацию, а обычные взаимодействия дают немедленную обратную связь.

**Функции.** Role-based workspace overview; единый application shell; project-local navigation;
signature `ProjectRoute`; понятный public entry; упрощённый login/invitation path без ослабления
security; empty/loading/success/error/read-only states; pending submit protection; mobile navigation;
performance baseline development/production и устранение измеренных узких мест.

**Модули и файлы.** `apps/web` layouts/pages/components/loading; `packages/ui`; существующие query
services только для безопасных role/tenant-scoped overview; `docs/UX_FOUNDATION.md`;
`.interface-design/system.md`; E2E/axe/performance smoke.

**База данных.** Новые business tables не требуются. Индексы допускаются только при подтверждённом
query plan; migration проходит обычный clean/upgrade review.

**Безопасность.** Shell и скрытие навигации не заменяют server policies. Overview получает данные
только через session → tenant context → project membership. Client copy/DTO не раскрывают internal
actions, workspace data или существование чужих объектов. Session/cookie/redirect/CSRF правила не
ослабляются ради сокращения шагов.

**Тесты.** Unit для navigation/copy/route derivation и pending controls; integration для
role/tenant-scoped overview; E2E owner/client first action, persistent session, no dead-end navigation,
mobile/keyboard/axe; production navigation/performance smoke; regression Milestones 01–06.

**Команды проверки.** Standard quality gate; существующие integration/E2E/security/axe suites;
production build smoke; измерение route timings документированной командой. Отдельные scripts не
создаются только ради названия, если покрытие уже находится в существующем suite.

**Критерии приёмки.** Public entry ведёт к одному понятному действию; действующая session не требует
повторного входа; владелец и клиент получают разные overview/navigation; ключевая функция доступна
не более чем за два осмысленных перехода; project overview показывает состояние, ответственность и
следующее действие; основные forms имеют pending/success/error и защиту от повторной отправки;
production показатели измерены до/после; desktop/mobile axe и E2E зелёные; tenant/security границы
не изменены.

**Зависимости.** Milestone 06. Milestone 07 начинается только после завершения этого milestone.

**Не входит.** Business scope Milestone 07, dark mode, real-time, сложная motion system, marketing
landing, public SaaS onboarding и визуальные изменения без практической UX-пользы.

## 10. Milestone 07 — обновления, версии сайта и review loop

**Цель.** Разработчик публикует проверяемый результат, клиент оставляет и закрывает структурированные замечания без SDK.

**Функции.** Project updates/feed/pin/visibility; SiteVersion с URL, changelog, check instructions, environment, old versions; async safe URL check до client publication; open new tab/iframe capability UX. `FeedbackItem` — отдельное замечание с page URL, optional screenshot, priority/assignee/status flow; `Comment` — только сообщение/ответ в контексте объекта, без самостоятельного workflow; edit marker/tombstone/internal visibility; feedback classification `potential_change`; review action.

**Модули и файлы.** `updates`, `versions`, `feedback`, `comments`; SSRF-safe URL checker package/worker; project feeds, version/review screens; screenshot attachment через file subsystem.

**База данных.** `ProjectUpdate`, `SiteVersion`, `FeedbackItem`, `Comment`, optional `CommentRevision`; version uniqueness; URL check attempts; status/visibility indexes; immutable URL/version publication events.

**Безопасность.** URL checker blocks local/private/metadata/non-HTTP, validates every redirect and enforces timeout/response cap; preview secrets encrypted/redacted; iframe allowlist exact; comment output escaped/sanitized; internal messages excluded at query and serializer levels; screenshot inherits file ACL.

**Тесты.** Unit feedback states, URL normalization/IP rules, comment visibility; integration SSRF incl. redirect/DNS cases, publish idempotency, old version retention, internal leak tests, comment tombstone; E2E publish → client feedback → developer fixes → client verifies/closes; CSP/iframe fallback smoke.

**Команды проверки.** Standard quality gate; `pnpm test:security -- ssrf comments`; `pnpm test:integration -- versions feedback`; `pnpm test:e2e --grep "version review"`.

**Критерии приёмки.** Version создаётся как `pending_check`; SSRF security result отделён от availability result; unsafe URL никогда не fetch/publish и не допускает override; client publication возможна только после safe result (`safe/reachable` либо явно отмеченное `safe_but_unreachable` для защищённого preview). Нельзя незаметно заменить URL; старая версия доступна согласно правам; comment не меняет feedback status; client не видит internal reply; закрытие замечания требует допустимого перехода; review работает без iframe и SDK.

**Зависимости.** Milestone 06.

**Не входит.** DOM locator, marker overlay, automated screenshot browsing, real-time, console capture и change-request proposal.

## 11. Milestone 08 — согласования и audit trail

**Цель.** Неизменяемо подтвердить конкретный scope/stage/version/file/final handover с правильной authority и конкурентностью.

**Функции.** ApprovalRequest; явные assigned approvers; `any_one` (default MVP) и `all_required`; approve/request changes confirmation; blocking feedback policy; outstanding decision UI; cancel/new request; отдельный `recorded_externally`; scope primitive расширяется до общего workflow; client-safe activity history; audit filters.

**Модули и файлы.** `approvals`, `audit`; policies/state machine; approval pages and confirmation dialog; entity snapshot builder/checksum; activity projections.

**База данных.** `ApprovalRequest`, `ApprovalRequestApprover`, `ApprovalDecision`; отдельный `ExternalDecisionRecord`/audit event с source, sourceDecisionAt, recordedByUserId и explanation; entity revision/snapshot metadata, configurable acknowledgement template snapshot, protected IP representation, user agent; unique decision per approver/request; active-request and concurrency constraints; audit indexes.

**Безопасность.** Только назначенный client approver с текущим project access; `canManageClientMembers` отдельно и default false; decision transaction uses row lock/serializable guard and idempotency key; stale revision blocked; no owner impersonation. Owner может cancel с причиной, создать новый request или записать отдельный `recorded_externally`, который нельзя представить как client action. Sensitive request metadata encrypted/HMAC per retention; client activity allowlist; audit has no app update/delete path; UI не называет решение юридически значимой ЭП.

**Тесты.** Unit strategies, blocking rules, stale revision, state errors; integration double click/concurrent approvers, revoke access before decision, atomic stage transition, immutable decision/cancel event, client audit filtering; E2E request → inspect artifacts → approve/request changes; security IDOR.

**Команды проверки.** Standard quality gate; `pnpm test -- approvals`; `pnpm test:integration -- approvals audit concurrency`; `pnpm test:security -- approvals`; `pnpm test:e2e --grep "approval"`.

**Критерии приёмки.** В `any_one` первое допустимое решение завершает request; в `all_required` ожидаются все назначенные пользователи. Повторный/конкурентный запрос не создаёт второе решение; решение содержит точную revision и snapshot настраиваемого нейтрального текста; owner не может принять его за клиента; `recorded_externally` явно показывает автора фиксации и источник; новая обязательная revision инвалидирует старое pending решение; история не раскрывает internal event.

**Зависимости.** Milestone 07.

**Не входит.** Юридическая ЭП, автоматическое согласование по сроку, payments gate и external approval integrations.

## 12. Milestone 09 — уведомления, reminders и архивирование

**Цель.** Завершить feature-complete MVP: критические события доходят, действия напоминаются без спама, завершённый проект безопасно архивируется.

**Функции.** NotificationEvent/Delivery; in-app inbox/read state; email invitation/action/material/version/comment/approval/project completion; deep links; dedupe/grouping; author suppression; retry/backoff/DLQ; reminder scheduler and stop-on-complete; minimal preferences/timezone/quiet hours; project completion gates; archive/restore/read-only.

**Модули и файлы.** `notifications`, `projects/completion`, `archive`; provider adapter/templates; BullMQ producers/consumers/job schedulers; inbox/settings; worker diagnostics log/health.

**База данных.** `NotificationEvent`, `NotificationDelivery`, preferences, read timestamps, dedupe keys, outbox dispatch state; completion/archive events; indexes by user/unread/status; retention metadata.

**Безопасность.** Deep link does not grant access; email contains minimum data; token/secrets absent from queue payload/log; provider webhook signatures verified if used; unsubscribe/preferences cannot disable security invitations incorrectly; archive policies enforced server-side; worker repeats tenant authorization/context reconstruction.

**Тесты.** Unit templates/dedupe/quiet hours/backoff; integration outbox atomicity, Redis/email failure, retry/DLQ, reminder cancellation, self-notification suppression, archive mutation denial/restore; E2E notification deep link and complete/archive project; timezone tests.

**Команды проверки.** Standard quality gate; `pnpm test:integration -- outbox notifications archive`; `pnpm test:e2e --grep "notification|archive|complete"`; `pnpm worker:smoke`.

**Критерии приёмки.** Бизнес-операция успешна при outage email; transactional outbox сохраняется с business mutation; событие позже доставляется ровно в видимом для пользователя экземпляре; reminder прекращается; unauthorized deep link безопасен; архив read-only. Completion разрешён только при `approved`/обоснованно `skipped` обязательных этапах, отсутствии blocking actions, принятом final approval и выполненном handover checklist. Payment gate действует лишь при включённом payment-модуле и обязательном unpaid milestone.

**Зависимости.** Milestone 08; production domain/email provider для реальной доставки.

**Не входит.** Telegram, push, advanced digest editor, notification analytics UI и physical delete workspace.

## 13. Milestone 10 — MVP hardening, export и pilot readiness

**Цель.** Превратить feature-complete сборку в безопасный первый рабочий MVP для одного реального клиентского проекта.

**Функции.** Читаемый Markdown/HTML export клиентской истории и оригинальные разрешённые вложения; handover checklist/final approval; глобальная UX-полировка mobile-first; empty/error/permission/archive states; accessibility; backup/restore runbook и rehearsal; observability dashboards/alerts; abuse limits; seed/demo; pilot onboarding and support procedure.

**Модули и файлы.** `exports`, `handover`; export worker; all UI modules QA; `docs/architecture`, security model, permissions/state diagrams, storage model, API conventions, notification catalog, backup/restore, deployment, incident response, contribution guide/changelog; staging manifests.

**База данных.** `ExportJob` и short-lived artifact metadata; handover checklist/revision link; retention indexes. Никаких крупных новых доменных таблиц.

**Безопасность.** Export повторно фильтруется по actor/visibility, не включает secrets/internal данные клиенту; encrypted artifact/private signed URL/expiry; backup encryption/access test; dependency/secret scan; CSP/CSRF/XSS/SSRF/IDOR review; production retention/privacy config утверждены.

**Тесты.** Полный critical E2E из §26.3; role/tenant matrix; security suite; axe + ручной keyboard/screen-reader smoke; performance datasets 100 projects/5k comments/10k files; restore drill; browser matrix; migration from previous milestone; post-deploy smoke.

**Команды проверки.** Все quality gates; `pnpm test:e2e`; `pnpm test:security`; `pnpm test:a11y`; `pnpm test:performance`; `pnpm audit:deps`; `pnpm audit:secrets`; `pnpm backup:verify --env staging`; `pnpm smoke --env staging`.

**Критерии приёмки.** Выполнены §30 MVP и применимые пункты §31; critical E2E зелёный; cross-tenant suite зелёный; p95 цели подтверждены на задокументированном staging profile; restore реально выполнен; экспорт читаем и безопасен; пилотный клиент проходит путь с телефона; нет P0/P1 дефектов.

**Зависимости.** Milestone 09; подтверждены C-01–C-09 из `DECISIONS.md`; доступна staging среда.

**Не входит.** Публичный SaaS launch, payments, full change requests, SDK и integrations. MVP допускается только для контролируемого пилота до отдельного production readiness review.

## 14. Milestone 11 — professional workflow

**Цель.** Добавить коммерческий и повторяемый workflow после подтверждения ценности MVP.

**Функции.** Project/questionnaire templates; полноценные ChangeRequest revisions/estimate/price/deadline/acceptance; связь с agreed scope и feedback; manual PaymentMilestone/Payment/partial/refund; financial permissions; Telegram opt-in; global search/filter; full ZIP/CSV/originals export; workspace white-label без custom domain; quotas и product analytics без content/PII.

**Модули и файлы.** `templates`, `change-requests`, `payments`, `search`, Telegram adapter, enhanced `exports`, `analytics`, quota policies; corresponding screens and workers.

**База данных.** `ProjectTemplate`, `QuestionnaireTemplate`; `ChangeRequest`, `ChangeRequestRevision`; payment ledger/milestones/refunds; Telegram connection encrypted identifiers; search indexes; quota usage/projection; analytics outbox. Scope link becomes explicit.

**Безопасность.** Financial permission separate; money integer minor units/currency metadata; accepted proposal immutable/transactional/idempotent; Telegram account linking signed/expiring/voluntary; search is tenant/project filtered before ranking; exports retain ACL; analytics excludes texts, answers, filenames and PII.

**Тесты.** State/amount/currency/refund rules; concurrent change acceptance; template snapshot isolation; search/exports tenant leakage; Telegram signature/deep link; quota races; E2E feedback → change request → accept → payment milestone → manual payment → new version.

**Команды проверки.** Standard/full gates; targeted payment/change/search security suites; full E2E; export load test.

**Критерии приёмки.** Ошибка исходного scope не становится платной автоматически; accepted proposal точно фиксирует price/time/deadline; partial/refund totals correct; search не раскрывает чужие snippets; template change не меняет существующий проект; Telegram outage не ломает action.

**Зависимости.** Первый MVP успешно использован в пилоте; подтверждена необходимость модулей и финансовая политика.

**Не входит.** Эквайринг, invoice accounting, custom domains, общий чат, CRM и визуальный SDK.

## 15. Milestone 12 — visual Feedback SDK

**Цель.** Добавить безопасные DOM-маркеры, сохранив fallback и существующий feedback workflow.

**Функции.** Lazy SDK bundle/Shadow DOM; short-lived reviewer token; allowed origins; hover/select marker; multiple locator signals; SPA navigation; marker restore/rebind; secure postMessage; masking; viewport/zoom; optional console errors; screenshot marker fallback (upload и разрешённый server capture); connection diagnostics; real-time only for active review sessions.

**Модули и файлы.** `packages/feedback-sdk`; SDK token/API routes; feedback locator services; screenshot worker; review host/overlay UI; real-time adapter; SDK security docs/sample integration.

**База данных.** Locator/context fields из ТЗ, token grants/nonce/revocation, marker revisions/rebind events, allowed domain config, capture job metadata; no raw secrets.

**Безопасность.** Exact origin/domain/token audience/version; short TTL and single-purpose scope; no cookies/localStorage/forms/password collection; sensitive selector/text masking; console allowlist; CSP/SRI guidance; postMessage schema validation; SDK cannot execute remote arbitrary code; screenshot SSRF rules.

**Тесты.** Unit locator ranking/masking/origin/token; integration forged origin/token/project/version, SPA routes, rebind, iframe/new-tab, screenshot SSRF; E2E SDK on static and SPA fixtures at zoom/viewports; bundle size budget; compatibility browsers; penetration-focused review.

**Команды проверки.** Standard gates; `pnpm --filter feedback-sdk build`; `pnpm sdk:size`; `pnpm test:sdk`; `pnpm test:security -- sdk postmessage screenshot`; `pnpm test:e2e --grep "visual feedback"`.

**Критерии приёмки.** SDK невидим обычному посетителю; marker survives supported SPA navigation/viewport; missing element remains in list and can rebind; forged origin/token fails without details; forms/passwords not captured; fallback works when iframe/SDK unavailable.

**Зависимости.** Milestone 11 не обязателен технически, но SDK начинается только после стабильного основного workflow; подтверждён product demand.

**Не входит.** Session replay, arbitrary DOM recording, remote code execution, production deployment automation.

## 16. Milestone 13 — integrations, maintenance и SaaS readiness

**Цель.** Расширять продукт только по подтверждённому спросу и подготовить безопасную публичную multi-workspace эксплуатацию.

**Функции.** GitHub/Vercel-compatible deployment adapters, automatic SiteVersion with commit/changelog; calendar; payment provider; cloud drives; maintenance/warranty/request flow; reports; custom domains; optional public studio registration and SaaS billing only after threat/model review.

**Модули и файлы.** `integrations/*`, `maintenance`, `warranty`, `reports`, custom-domain routing/certificates, SaaS onboarding/billing; provider webhooks and sync workers.

**База данных.** OAuth/provider connections encrypted; webhook receipt/idempotency; maintenance contracts/requests; custom domain verification; SaaS plan/subscription/usage only when approved.

**Безопасность.** Least-scope OAuth; encrypted/rotatable tokens; signed webhook and replay protection; provider tenant mapping; custom-domain takeover prevention; cookie/CSRF/CSP review; optional PostgreSQL RLS decision; legal/privacy/data residency review; incident/DR capacity update.

**Тесты.** Contract tests with providers; webhook replay/out-of-order; tenant mapping; token rotation/revoke; custom domain verification/takeover; billing/idempotency; maintenance E2E; load/capacity and disaster recovery.

**Команды проверки.** Full gates plus provider sandbox contract suites, webhook security, domain routing tests, load/DR rehearsals and staged rollout smoke.

**Критерии приёмки.** Integration outage degrades gracefully; duplicate/out-of-order webhooks do not duplicate versions/payments; provider token never reaches logs/client; custom domain isolation proven; SaaS launch has completed security/privacy/operations checklist.

**Зависимости.** Stable pilot metrics and explicit approval per integration. Public SaaS additionally depends on C-02, billing/support model and security review.

**Не входит.** Неограниченный marketplace интеграций, CRM, бухгалтерия, хостинг сайтов, GitHub replacement или общий messenger.

## 17. Трассировка требований к MVP

| Требование                                                                                 | Milestone |
| ------------------------------------------------------------------------------------------ | --------- |
| Auth, magic link, sessions, RBAC, tenant isolation                                         | 02        |
| Clients, projects, memberships, client layout                                              | 03        |
| Agreed scope, stages, actions, progress, dashboards                                        | 04        |
| Questionnaire, conditional/repeating, autosave/revisions                                   | 05        |
| Materials, files, signed URLs, versions, scan                                              | 06        |
| Updates, SiteVersion, normal feedback/comments                                             | 07        |
| Assigned approvers, `any_one`/`all_required`, external records, immutable decisions, audit | 08        |
| In-app/email/reminders, completion/archive                                                 | 09        |
| Export, handover, security/a11y/performance/ops                                            | 10        |
| Change requests, payments, templates, Telegram                                             | 11        |
| Feedback SDK/fallback marker/real-time                                                     | 12        |
| GitHub/Vercel/calendar/provider/maintenance/SaaS                                           | 13        |

## 18. MVP release gate

Первый рабочий MVP считается готовым только одновременно при следующих условиях:

- один реальный проект проходит путь create → invite → scope → questionnaire/materials → version → feedback → approval → handover → complete/archive;
- server-side permission и tenant tests покрывают каждую новую сущность;
- файлы приватны и проходят production scan pipeline;
- согласования и agreed revisions append-only;
- outbox/notifications переживают сбой внешнего канала;
- client critical path проверен на mobile Safari/Chrome Android и клавиатурой;
- lint, typecheck, unit, integration, security, E2E и build зелёные;
- staging migration, backup/restore и post-deploy smoke выполнены;
- утверждены production domain/provider/privacy/retention/legal text;
- `docs/STATUS.md` не содержит открытых P0/P1 проблем.

До выполнения gate продукт не маркируется production-ready, даже если основные экраны визуально готовы.
