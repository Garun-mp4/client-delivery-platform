# Статус реализации

Последнее обновление: 2026-07-17
Общий статус: Milestones 00–05 завершены

## Текущий milestone

**Milestone 05 — анкеты и сбор информации — завершён.** Реализованы проектные анкеты,
версионируемые черновики с optimistic concurrency, неизменяемые отправленные ревизии, запросы
уточнений, обсуждение отдельных ответов и tenant-safe интерфейсы владельца и клиента. Scope
Milestone 06 не начат.

## Завершённые задачи

- Добавлены `Questionnaire`, `QuestionnaireDraft`, `QuestionnaireSubmission` и
  `QuestionnaireAnswerComment` с tenant/project composite constraints и индексами.
- Схема анкеты сохраняется как versioned snapshot. Поддержаны секции, подсказки, примеры,
  обязательность, условия видимости, повторяемые группы и все scalar-типы Milestone 05.
- Типы `file` и `image` предусмотрены контрактом, но безопасно отклоняются конструктором и сервером
  до готовности файлового контура Milestone 06.
- Черновик хранится отдельно от отправленных ревизий. Автосохранение использует version token,
  идемпотентно повторяет подтверждённую запись и возвращает явный конфликт устаревшей вкладке.
- Сервер повторно вычисляет видимость, нормализует ответы, исключает скрытые значения и проверяет
  обязательные поля. Клиентская логика использует тот же валидатор.
- Отправленные ревизии неизменяемы на уровне service layer и PostgreSQL trigger. После запроса
  уточнений создаётся новая ревизия без изменения истории.
- Реализованы owner review (`accept`/`clarification_requested`), комментарии к конкретным ответам,
  audit/outbox события и безопасные client/internal DTO.
- Добавлены русскоязычные mobile-friendly страницы списка, конструктора и прохождения анкеты с
  live progress, временем подтверждённого сохранения, offline/error/conflict состояниями и историей.
- Добавлены unit, integration, tenant/IDOR, immutable submission, E2E и axe tests.
- Созданы ADR-032–034 и `docs/QUESTIONNAIRES.md`.

## Текущие задачи

- Активных задач реализации нет.
- Ветка Milestone 05 готова к отправке и CI-проверке; объединение с `main` не выполняется.
- Milestone 06 не начат.

## Найденные проблемы

- Drizzle сгенерировал composite foreign keys раньше поддерживающих unique indexes в миграциях
  `0006` и `0007`. SQL переупорядочен и проверен как upgrade и на отдельной чистой PostgreSQL 17
  базе.
- Первый integration-тест ожидал текст ошибки immutable trigger напрямую, хотя Drizzle корректно
  оборачивает ошибку драйвера. Проверка усилена: операция должна завершиться отказом, а сохранённая
  ревизия — остаться неизменной.
- Первый focused E2E успешно прошёл весь workflow, но строгий locator финального статуса совпал с
  двумя элементами. Locator уточнён, desktop и mobile сценарии прошли повторно.
- Две первые пересборки локального Docker image прервались из-за временных DNS/registry timeout при
  скачивании npm-пакетов. В Dockerfile добавлен BuildKit cache mount для pnpm store; повторная
  сборка завершилась, migration container вышел с кодом 0, сервисы healthy.
- Исторический worker log содержит одну неуспешную локальную email delivery; retry-механизм не
  раскрыл токен, последующие письма доставлены в Mailpit.

## Принятые решения

- ADR-032: schema snapshot принадлежит конкретной анкете проекта; библиотека переиспользуемых
  шаблонов отложена, файловые поля закрыты до Milestone 06.
- ADR-033: единственный mutable draft защищён optimistic version; каждая отправка создаёт отдельную
  immutable submission revision.
- ADR-034: сервер является источником истины для условий, видимости и progress; скрытые ответы не
  принимаются как доверенные данные и не попадают в submission.
- Внешние уведомления остаются domain/outbox событиями без ответов, содержимого анкеты и raw tokens.

## Выполненные проверки

- `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` —
  успешно; unit tests включают 32/32 в `@garun/core`.
- Миграции `0006` и `0007` применены как upgrade локального Compose и на отдельной чистой
  PostgreSQL 17 базе; migration drift отсутствует, immutable trigger подтверждён.
- `pnpm test:integration` — 23/23, включая optimistic/idempotent autosave, stale conflict,
  immutable submission, clarification/resubmit, audit/outbox privacy и cross-tenant/IDOR.
- `pnpm build` и `pnpm verify:artifacts` — успешно; web route tree и независимый worker artifact
  собраны.
- `pnpm test:e2e` — 17/17; questionnaire flow прошёл в desktop и mobile с axe-core.
- `docker compose up -d --build --wait` — успешно после сетевых retries; migration exit 0,
  web/worker/PostgreSQL/Redis/MinIO/Mailpit healthy.
- `pnpm smoke` — web и worker успешно; `pnpm audit --prod` — известных уязвимостей нет.
- `git diff --check`, tracked artifact scan и high-confidence secret scan — успешно.
- GitHub Actions будет зафиксирован после отправки ветки.

## Следующие действия

1. Отправить ветку Milestone 05 и дождаться итогового GitHub Actions.
2. Следующий milestone — 06 (файлы и материалы), но не начинать без явного запроса.

## Известные ограничения

- Загрузка `file`/`image`, quarantine/scanner и object storage относятся к Milestone 06; до этого
  такие поля нельзя опубликовать.
- Переиспользуемая библиотека шаблонов анкет намеренно не входит в Milestone 05.
- Одновременное редактирование решается явным stale conflict, а не real-time merge.
- RLS отложен; защита основана на application policies, scoped repositories, composite constraints
  и tenant/IDOR tests.
- Локальный Compose использует development image; production build проверяется отдельно.
