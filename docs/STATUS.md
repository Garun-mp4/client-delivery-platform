# Статус реализации

Последнее обновление: 2026-07-18
Общий статус: Milestones 00–07 и UX stabilization Milestone 06.5 завершены

## Текущий milestone

**Milestone 07 — обновления, версии сайта и review loop — завершён в
`feat/milestone-07-review-loop`.** Реализован рабочий путь от публикации обновления и безопасно
проверенной версии до клиентского замечания, исправления, проверки и закрытия. Milestone 08 не начат.

Ветка Milestone 07 построена поверх `feat/milestone-06-5-ux-foundation`, поскольку на момент начала
UX-ветка ещё не была объединена в `main`. При создании PR необходимо сохранять порядок merge:
сначала Milestone 06.5, затем Milestone 07.

## Завершённые задачи

- Добавлена project feed модель с client/internal visibility, важностью и одним pin на видимость.
- Добавлена append-only `SiteVersion`: последовательный номер, окружение, changelog, инструкции,
  публичный/password access и история старых опубликованных версий.
- Worker асинхронно выполняет SSRF-safe URL check: проверяет scheme/port, все DNS IPv4/IPv6,
  специальные диапазоны и каждый redirect, закрепляет соединение за проверенным IP и применяет
  timeout/redirect limits.
- Security и availability URL хранятся отдельно. Unsafe URL не имеет override; safe-but-unreachable
  требует явного подтверждения. Проверка старше 10 минут перед публикацией инвалидируется.
- Preview secret хранится только зашифрованным и раскрывается динамической server page после
  повторной tenant/project policy; URL, пароль и полный ответ сайта не пишутся в audit/log.
- Реализован `FeedbackItem` с version/page/screenshot/priority/classification и явной state machine
  `new → … → awaiting_verification → closed`.
- `potential_change` отделён от change request; Milestone 08 и коммерческий workflow не начаты.
- `Comment` отделён от workflow: client/internal visibility, edit marker и tombstone; client query
  исключает internal replies до serializer/render.
- Скриншот замечания может ссылаться только на собственный clean/available файл того же
  workspace/project.
- Добавлены русскоязычный mobile-friendly review screen, pending/empty/error states, new-tab fallback,
  owner publication controls и клиентские действия проверки.
- Каждая значимая мутация tenant-scoped, проходит server policy и создаёт audit/outbox event.
- Исправлена конкуренция Better Auth rate limit: публичный magic-link остаётся 5/min, внутреннее
  создание session после уже валидного invitation имеет отдельный защищённый лимит.
- Созданы миграции `0012`–`0014`, ADR-040–041 и `docs/REVIEW_LOOP.md`; README обновлён.

## Текущие задачи

- Подготовить коммиты и отправить `feat/milestone-07-review-loop`.
- Дождаться итогового GitHub Actions run.
- Milestone 08 не начинать до merge и отдельного подтверждения.

## Найденные проблемы

- Первая версия migration создавала composite foreign keys раньше supporting unique indexes. SQL
  `0012` переупорядочен и полностью применён на чистой PostgreSQL 17.
- Integration cleanup выявил конфликт `RESTRICT` membership-author foreign keys при cascade удаления
  тестового workspace. Для новых сущностей добавлена явная migration `0013`, согласующая delete
  semantics с существующими domain tables; пользовательские memberships удаляются soft-disable.
- После добавления freshness gate integration fixture не задавала `checkedAt`; fixture исправлена и
  теперь проверяет актуальный safe result.
- Первый полный E2E не дождался письма за 5 секунд при параллельной outbox-нагрузке. Poll timeout
  приведён к уже используемому integration SLA без ослабления assertion.
- Второй полный E2E выявил общий Better Auth plugin limit для публичного magic-link и внутреннего
  session flow принятого invitation. Membership создавался, но session fallback уводил на общую
  страницу. Потоки получили отдельные лимиты; повторный полный E2E прошёл 20/20.
- Финальный review выявил конфликт повторной публикации уже видимой версии с freshness constraint и
  исчерпание retry counter при новой проверке. Публикация стала идемпотентной, новый check cycle
  сбрасывает счётчик, а история допускает одинаковый относительный номер попытки в разных циклах.
- Первый `pnpm db:generate` в текущей shell завершился ошибкой из-за отсутствующего `DATABASE_URL`.
  После явного test URL команда прошла и подтвердила отсутствие drift.

## Принятые решения

- ADR-040: URL security и availability — разные оси; публикация использует свежий SSRF-safe result,
  версии append-only, а workflow принадлежит `FeedbackItem`, не `Comment`.
- ADR-041: внутренний invitation-to-session flow имеет отдельный rate limit, не ослабляя публичный
  magic-link и endpoint принятия приглашения.
- Основной review UX не зависит от iframe: new-tab всегда доступен, iframe capability оценивается
  консервативно по X-Frame-Options/CSP.
- PostgreSQL остаётся текущей лёгкой job queue; новая production dependency или микросервис не
  добавлялись.

## Выполненные проверки

- `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` — успешно; core
  39/39, worker 18/18, web 14/14 и остальные suites зелёные.
- `pnpm db:generate` — `No schema changes`; migrations `0000`–`0014` применены к чистой базе
  `garun_m07_verify` без ошибок.
- `pnpm test:integration` — 29/29 на реальных PostgreSQL, Redis, MinIO, Mailpit и ClamAV.
- `pnpm build` — production Next.js и worker собраны; `pnpm verify:artifacts` подтвердил отсутствие
  workspace TypeScript imports в worker artifact.
- `pnpm test:e2e` — итоговый полный прогон 20/20; review path включает client invitation, publication,
  structured feedback, owner transitions, client close и axe.
- `docker compose up -d --build --wait` — migration/storage-init exited 0; web, worker, PostgreSQL,
  Redis, MinIO, Mailpit и ClamAV healthy.
- `pnpm smoke` — web/worker passed; `pnpm audit --prod` — известных уязвимостей нет.
- `git diff --check`, tracked env/artifact scan, high-confidence secret scan, type-suppression scan и
  Compose error/secret log scan — успешно.

## Следующие действия

1. Создать Pull Request Milestone 06.5, если он ещё не создан, и объединить его первым.
2. Создать Pull Request `feat/milestone-07-review-loop`, проверить CI и объединить после 06.5.
3. После отдельного подтверждения перейти к Milestone 08 — общие согласования и audit trail.

## Известные ограничения

- iframe embedding намеренно не включён: внешние CSP/X-Frame-Options и platform CSP делают new-tab
  единственным гарантированным путем. Capability result хранится для будущего безопасного UX.
- URL checker использует консервативный HTTP `HEAD`; protected preview может быть
  `safe/unreachable` и требует ручного подтверждения, но unsafe security result не переопределяется.
- Screenshot создаётся через существующий файловый контур; автоматический browser screenshot, DOM
  locator/overlay, SDK, console capture и real-time не входят в Milestone 07.
- `potential_change` — только явная классификация. Полноценный change request и коммерческое решение
  относятся к последующим milestones.
- Production domain, R2, scanner deployment, RUM/APM и credentials не создавались.
- PostgreSQL RLS отложен; isolation обеспечивается server policies, scoped queries, composite
  constraints и cross-tenant/IDOR tests.
