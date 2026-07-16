# Статус реализации

Последнее обновление: 2026-07-16
Общий статус: архитектурное планирование, реализация продукта не начата

## Текущий milestone

**Milestone 00 — архитектурная baseline.**

Содержательная работа завершена. Milestone ожидает ревью владельца и подтверждения открытых решений из `docs/DECISIONS.md`. Переход к Milestone 01 запрещён до явного разрешения начать реализацию.

## Завершённые задачи

- Полностью прочитан и проанализирован `PROJECT_SPEC.md` (2 951 строка).
- Проверены роли, UX, lifecycle, функциональные и нефункциональные требования, модель данных, безопасность, тестирование, deployment, приёмка и исходная очередность работ.
- Выявлены противоречия и отсутствующие решения; предложены безопасные трактовки без удаления scope.
- Определены рекомендуемый стек, модульный монолит, границы процессов и структура репозитория.
- Определён минимальный первый рабочий MVP и явно перечислено, что переносится после него.
- Создан подробный последовательный план Milestones 00–13.
- Созданы практические правила работы Codex в корневом `AGENTS.md`.

## Текущие задачи

- Ревью документов владельцем продукта.
- Подтверждение или корректировка решений C-01–C-12 из `docs/DECISIONS.md`.
- После явной команды на реализацию — начать только Milestone 01.

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
- Production domain, jurisdiction, providers и юридический текст не выбраны.

Подробности и последствия: `docs/DECISIONS.md`, раздел 2.

## Принятые решения

На текущем шаге решения являются **предложенными**, пока владелец не подтвердил их:

- TypeScript modular monolith: Next.js web + отдельный BullMQ worker + PostgreSQL.
- pnpm/Turborepo monorepo; Drizzle ORM; Better Auth с database sessions и hashed magic links.
- S3-compatible private storage, quarantine scan и signed URLs.
- Server-side deny-by-default policies, explicit TenantContext и composite tenant constraints.
- Transactional outbox для audit/notifications/jobs.
- Versioned immutable scope/approvals и list-based feedback в MVP; SDK позже.
- Русский invitation-only MVP без общего чата, оплат, public signup и custom domains.

## Следующие действия

1. Владелец подтверждает MVP boundary и решения C-01–C-12 либо оставляет правки.
2. Зафиксировать ответы в `docs/DECISIONS.md` и обновить этот статус.
3. Получить явную команду начать реализацию.
4. Создать отдельную рабочую ветку/продолжить утверждённую ветку и выполнить Milestone 01 без расширения scope.
5. Пройти его quality gate и acceptance criteria до Milestone 02.

## Известные ограничения

- В репозитории пока нет исходного кода, package scripts, схемы БД, CI или окружения; команды будущих milestones ещё не существуют.
- Стек указан на уровне рекомендуемых stable major/minor; точные версии будут зафиксированы lockfile только в Milestone 01.
- Production deployment заблокирован до выбора юрисдикции/region, hosting, storage/scanner, email domain/provider, retention и утверждённого текста согласования.
- Юридическая достаточность privacy/approval текстов не подтверждается техническим анализом и требует профильной проверки.
- Оценка сроков и бюджета не дана: она зависит от подтверждённого MVP, provider choices и доступности staging/production аккаунтов.
- Feedback SDK, payments, change requests, Telegram и integrations сохранены в плане, но намеренно не входят в первый MVP.
