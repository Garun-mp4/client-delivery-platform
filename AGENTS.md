# Правила работы Codex

## Перед началом

1. Полностью прочитать `PROJECT_SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md` и `docs/STATUS.md`.
2. Проверить текущий milestone, Git status/branch и существующие изменения. Не работать напрямую в `main`/`master` без явного разрешения.
3. Работать только в scope текущего milestone. Новое требование сначала внести в план и согласовать, если оно меняет границы результата.

## Реализация

- Не сокращать и не переосмысливать требования молча. Неясность фиксировать в `docs/DECISIONS.md`.
- Не показывать незавершённые функции и не оставлять критический путь в виде заглушек, `TODO`, фиктивного успеха или mock production adapter.
- Держать бизнес-правила, state transitions и authorization на сервере. Скрытая кнопка не является защитой.
- Tenant брать только из проверенной сессии. Каждый repository/query/mutation и background job обязан соблюдать workspace/project ownership; писать cross-tenant/IDOR тесты.
- Значимые мутации выполнять транзакционно, идемпотентно там, где возможен retry, и сопровождать audit/outbox событиями.
- Не добавлять production-зависимость без записи причины, альтернатив и влияния в PR/`docs/DECISIONS.md`. Использовать адаптеры для внешних providers.
- Не помещать секреты, токены, magic links, preview passwords, реквизиты, персональные данные и содержимое приватных файлов в код, fixtures, аналитику, queue payload или логи.
- Сохранять mobile-first клиентский UX, русский понятный текст, accessibility и все обязательные loading/empty/error/permission/read-only состояния.

## Проверка

- Вместе с кодом писать unit/integration tests; для критического пути — E2E; для доступа — role/tenant security tests.
- Перед завершением запускать существующие scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`; применимые `pnpm test:e2e`, `pnpm test:security`, `pnpm test:a11y`.
- Не выдумывать отсутствующие scripts и не скрывать failures. Исправить ошибки до следующего milestone либо явно зафиксировать подтверждённый blocker.
- Проверять generated migrations на пустой БД и upgrade path; destructive migration требует отдельного плана и backup.
- Проверять diff на секреты, случайные артефакты и чужие изменения. Коммиты должны быть небольшими и описывать фактический результат.

## Завершение milestone

1. Пройти все критерии приёмки и команды из `docs/IMPLEMENTATION_PLAN.md`.
2. Обновить seed, README и тематическую документацию.
3. Обновить все разделы `docs/STATUS.md`, включая проверки, проблемы, ограничения и следующий milestone.
4. Если принято новое архитектурное решение, добавить ADR/запись в `docs/DECISIONS.md` до перехода дальше.
