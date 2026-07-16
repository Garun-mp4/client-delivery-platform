# Статус реализации

Последнее обновление: 2026-07-16
Общий статус: Milestone 00 завершён; Milestone 01 разрешён и начат

## Текущий milestone

**Milestone 01 — engineering foundation.**

План и граница MVP Milestones 01–10 подтверждены владельцем. Scope текущей работы ограничен monorepo, web/worker foundation, локальной инфраструктурой, Drizzle, тестами, логированием, health endpoints, CI и документацией. Auth, workspace и бизнес-модули Milestone 02+ запрещены.

## Завершённые задачи

- Полностью прочитан и проанализирован `PROJECT_SPEC.md` (2 951 строка).
- Проверены роли, UX, lifecycle, функциональные и нефункциональные требования, модель данных, безопасность, тестирование, deployment, приёмка и исходная очередность работ.
- Выявлены противоречия и отсутствующие решения; предложены безопасные трактовки без удаления scope.
- Определены рекомендуемый стек, модульный монолит, границы процессов и структура репозитория.
- Определён минимальный первый рабочий MVP и явно перечислено, что переносится после него.
- Создан подробный последовательный план Milestones 00–13.
- Созданы практические правила работы Codex в корневом `AGENTS.md`.
- Владелец подтвердил структуру Milestones 00–13 и границу первого MVP Milestones 01–10.
- Зафиксированы текущие решения C-01–C-15, включая providers-as-adapters, quarantine, approval authority/modes, tenant isolation и completion gate.
- **Milestone 00 завершён.** Его документы и критерии приёмки утверждены.

## Текущие задачи

- Реализовать и проверить только Milestone 01.
- Создать pnpm/Turborepo structure, Next.js web, worker foundation и shared packages.
- Добавить локальные PostgreSQL, Redis, MinIO, Mailpit, Drizzle migration, тесты, CI и точный README.
- Выполнить обязательные проверки и self-review до объявления Milestone 01 завершённым.

## Найденные проблемы

- Scope revision критичен для цели продукта, но пропущен в исходном обязательном MVP/очередности.
- Матрица разрешений неоднозначно позволяет владельцу согласовать результат вместо клиента.
- В модели нет списка назначенных согласующих для `any_one`/`all_required`.
- Tenant ownership и полиморфные связи недостаточно защищены ограничениями схемы.
- Invitation → company/projects grants и auth schema описаны неполно.
- «Обычные комментарии» MVP не покрывают требуемый feedback status loop.
- Не определены progress edge cases, date-only semantics и completion gate до появления оплат.
- Не задана безопасная публикация URL до/после SSRF check.
- Не определены quarantine/scanner provider, file size/quota и retention.
- Нет атомарной связи business transaction → notification queue; предложен outbox.
- Audit immutability конфликтует с privacy deletion без retention/tombstone policy.
- Performance targets не имеют фиксированного staging profile и методики.
- Production domain, jurisdiction и финальный юридический текст не выбраны; production providers остаются предварительными.

Подробности и последствия: `docs/DECISIONS.md`, раздел 2.

## Принятые решения

Текущие решения подтверждены владельцем; инфраструктурные production-кандидаты предварительны:

- TypeScript modular monolith: Next.js web + отдельный BullMQ worker + PostgreSQL.
- pnpm/Turborepo monorepo; Drizzle ORM; Better Auth с database sessions и hashed magic links.
- S3-compatible private storage, quarantine scan и signed URLs.
- Server-side deny-by-default policies, explicit TenantContext и composite tenant constraints.
- Transactional outbox для audit/notifications/jobs.
- Versioned immutable scope/approvals и list-based feedback в MVP; SDK позже.
- Русский invitation-only MVP без общего чата, оплат, public signup и custom domains.
- Рабочее имя `Garun Workspace`; домены и URLs только через конфигурацию.
- Предварительно Vercel web, Railway-compatible worker/PostgreSQL/Redis, Cloudflare R2 и Resend; локально PostgreSQL/Redis/MinIO/Mailpit.
- 100 MiB/file, 10 GiB/workspace, 30-day deleted-file grace и 90-day technical logs через конфигурацию.
- `canManageClientMembers` default false; approvals только назначенными клиентами, modes `any_one` default и `all_required`.
- `recorded_externally` — отдельный audit type, не `ApprovalDecision` клиента.
- RLS отложен до pre-SaaS review при обязательной application isolation уже сейчас.
- Completion MVP: stages + no blocking actions + final approval + handover; financial gate только при активных payments.

## Следующие действия

1. Завершить документационный коммит Milestone 00 в planning-ветке.
2. Создать/продолжить `feat/milestone-01-foundation` без переписывания истории.
3. Выполнить Milestone 01 без расширения scope.
4. Пройти его quality gate, Docker/service smoke, migration и self-review.
5. Обновить этот файл фактическими результатами. Milestone 02 не начинать.

## Известные ограничения

- До завершения текущей работы в репозитории нет исходного foundation-кода; фактические результаты будут записаны после проверок Milestone 01.
- Стек указан на уровне рекомендуемых stable major/minor; точные версии будут зафиксированы lockfile только в Milestone 01.
- Production deployment заблокирован до выбора юрисдикции/region, создания approved accounts/secrets, sender domain, scanner deployment и утверждённого текста согласования. Предварительные providers не означают покупку или provisioning.
- Юридическая достаточность privacy/approval текстов не подтверждается техническим анализом и требует профильной проверки.
- Оценка сроков и бюджета не дана: она зависит от подтверждённого MVP, provider choices и доступности staging/production аккаунтов.
- Feedback SDK, payments, change requests, Telegram и integrations сохранены в плане, но намеренно не входят в первый MVP.
