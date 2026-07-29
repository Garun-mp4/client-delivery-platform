# Review loop: обновления, версии сайта и замечания

Документ описывает реализацию Milestone 07. Источник продуктовых требований —
`PROJECT_SPEC.md`, границы этапа — `docs/IMPLEMENTATION_PLAN.md`.

## Пользовательский поток

1. Внутренний участник публикует обновление проекта. Видимость выбирается явно:
   `client` или `internal`. Закреплённым может быть одно обновление каждой видимости.
2. Внутренний участник добавляет неизменяемую версию сайта: URL, окружение, changelog,
   инструкции проверки и, при необходимости, зашифрованный preview-пароль.
3. Worker асинхронно проверяет URL. До результата версия скрыта от клиента.
4. `unsafe` URL нельзя опубликовать. `safe/reachable` публикуется обычным действием.
   `safe/unreachable` требует явного подтверждения, поскольку это может быть защищённый preview.
5. Клиент открывает опубликованную версию в новой вкладке и создаёт структурированное замечание.
   Скриншотом можно выбрать только собственный уже проверенный файл этого проекта.
6. Внутренняя команда классифицирует и проводит замечание по workflow. Комментарии остаются
   сообщениями и сами по себе статус не меняют.
7. После `awaiting_verification` закрыть замечание может клиент. Расширение scope помечается
   `potential_change`, но не становится change request автоматически.

## Модель данных

- `project_update` — запись ленты, важность, видимость и optional pin.
- `site_version` — append-only версия URL с последовательным номером, результатами проверки и
  моментом публикации клиенту.
- `site_version_check_attempt` — диагностируемая история безопасных проверок без хранения токенов,
  preview-паролей и полных response bodies.
- `feedback_item` — отдельный workflow замечания, связанный с конкретной версией.
- `comment` — ответ в контексте замечания с client/internal visibility, `editedAt` и tombstone
  `deletedAt`.

Все сущности содержат `workspaceId` и `projectId`; composite foreign keys не позволяют связать
объекты разных tenant/project. Доступ начинается с проверенной session и active membership, затем
разрешается project policy. Значения `workspaceId` и object ID из URL/body не считаются доверенными.

## Состояния замечания

```text
new
 ├─> accepted ─> in_progress ─> fixed ─> awaiting_verification ─> closed
 ├─> clarification ─> accepted | rejected
 └─> rejected
```

- Внутренняя команда выполняет triage и переходы до `awaiting_verification`.
- Клиент отвечает на запрос уточнения и закрывает только `awaiting_verification`.
- `closed` — терминальное состояние Milestone 07.
- Комментарий, редактирование или tombstone не выполняют workflow transition.

## Безопасная проверка URL

Проверка имеет две независимые оси:

- security: `pending/checking/safe/unsafe/error`;
- availability: `pending/reachable/unreachable`.

Worker принимает только HTTP(S), запрещает credentials и нестандартные порты, разрешает DNS и
проверяет **все** полученные IPv4/IPv6 адреса. Loopback, private, link-local, metadata, reserved,
documentation и multicast диапазоны блокируются. Каждый redirect проходит ту же проверку.
HTTP-запрос закрепляется за уже проверенным IP, а исходный host используется для `Host`/TLS SNI —
это закрывает DNS rebinding между проверкой и соединением. Действуют timeout и предел redirect.

`X-Frame-Options` и CSP `frame-ancestors` оцениваются консервативно. Основной рабочий путь всегда
«Открыть в новой вкладке», поэтому review не зависит от iframe. Результат security-проверки старше
10 минут перед публикацией сбрасывается в `pending` и проверяется снова.

## Preview-пароль

Пароль не хранится открытым, не попадает в URL, audit/outbox и логи. Он шифруется существующим
application encryption key. Расшифровка выполняется только на динамической server page после
повторной tenant/project policy; клиент получает пароль только для опубликованной безопасной версии.

## Permissions

| Действие                                     | Internal owner/member проекта | Client                     | Observer |
| -------------------------------------------- | ----------------------------- | -------------------------- | -------- |
| Читать client updates/versions               | Да                            | Да                         | Да       |
| Читать internal updates/comments             | Да                            | Нет                        | Нет      |
| Создать update/version, опубликовать version | При `project.edit`            | Нет                        | Нет      |
| Создать feedback                             | Нет                           | Да                         | Нет      |
| Комментировать client thread                 | Да                            | Да                         | Нет      |
| Создать internal comment                     | Да                            | Нет                        | Нет      |
| Выполнить internal workflow transition       | Да                            | Только клиентские переходы | Нет      |
| Закрыть `awaiting_verification`              | Нет                           | Да                         | Нет      |

Архивный проект доступен только для чтения.

## Ручная проверка

1. Запустить `docker compose up -d --build --wait`.
2. Войти владельцем, открыть проект и вкладку «Проверка».
3. Добавить client update и `https://example.com/` как новую версию.
4. Дождаться статуса безопасной проверки, опубликовать версию клиенту.
5. Принять клиентское приглашение через Mailpit и открыть вкладку «Проверка».
6. Создать замечание; владельцем провести его до «Ожидает проверки».
7. Клиентом закрыть замечание и убедиться, что internal comment клиенту не виден.
