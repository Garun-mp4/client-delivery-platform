# Согласования и audit trail

## Что согласовывается

`ApprovalRequest` фиксирует ровно один результат:

- ревизию границ проекта;
- client-visible этап в `ready_for_review`;
- опубликованную client-visible версию сайта со свежими `safe/reachable` статусами;
- clean/available файл с текущей project-visible связью;
- финальную передачу проекта.

В request сохраняются тип и ID объекта, revision, JSON snapshot, checksum snapshot и точный текст
подтверждения. Текст нейтрален и не называется электронной подписью. Pending/rejected/private
объект нельзя выбрать.

## Роли и разрешения

| Действие                          | Owner/internal с `project.edit` | Назначенный client approver | Другой client/member      |
| --------------------------------- | ------------------------------- | --------------------------- | ------------------------- |
| Просмотреть все requests проекта  | Да                              | Нет, только назначенные     | Нет                       |
| Создать request                   | Да                              | Нет                         | Нет                       |
| Согласовать / запросить изменения | Нет                             | Да, при `canApprove`        | Нет                       |
| Отменить request                  | Только owner, с причиной        | Нет                         | Нет                       |
| Зафиксировать внешнее решение     | Только owner                    | Нет                         | Нет                       |
| Просмотреть client-safe activity  | Да                              | Да, allowlist               | Только доступные requests |

`workspaceId`, `projectId` и target IDs из формы не являются authority. Tenant получается из
проверенной session, project разрешается через активное membership и server policy, а все target
queries повторяют workspace/project scope.

## Транзакция решения

1. Повтор с тем же idempotency key возвращает существующее решение.
2. Request читается `FOR UPDATE` внутри serializable transaction.
3. Повторно проверяются назначение пользователя, активное project/client membership и
   `canApprove`.
4. Текущая revision объекта сравнивается с сохранённой; blocking feedback проверяется заново.
5. Создаётся единственный immutable `ApprovalDecision`.
6. `any_one` завершается первым допустимым решением; `all_required` ждёт всех. Любой
   `changes_requested` завершает request соответствующим статусом.
7. Stage/scope меняется и progress пересчитывается в той же транзакции.
8. Audit и transactional outbox создаются вместе с решением.

Serialization failure/deadlock повторяется максимум два раза благодаря idempotency. Другие ошибки
не повторяются.

## Внешнее решение

`ExternalDecisionRecord` — отдельная сущность, а не разновидность клиентского решения. Экран явно
показывает, что запись сделал разработчик/владелец и что решение пришло вне платформы. Обязательны
источник, фактическая дата решения, автор записи и пояснение.

## Защита evidence

- raw IP не хранится; сохраняется workspace-scoped HMAC fingerprint;
- user agent очищается и ограничивается;
- token, cookie, authorization header, URL с credentials и тексты писем не сохраняются;
- decision/external record и snapshot request защищены migration trigger от update;
- API не предоставляет update/delete для audit evidence;
- удаление/отключение membership выполняется soft, а решение требует актуального доступа;
- клиентский audit использует фиксированный allowlist и не возвращает internal metadata.

## Схема

```text
Project
  └─ ApprovalRequest ── one concrete target snapshot
       ├─ ApprovalRequestApprover ── ProjectMembership(client)
       │    └─ ApprovalDecision (0..1, immutable)
       └─ ExternalDecisionRecord (0..1, immutable and distinct)
```

## Проверка

```powershell
pnpm test

$env:TEST_DATABASE_URL = 'postgresql://garun:local_only_change_me@localhost:5432/garun_workspace'
$env:TEST_REDIS_URL = 'redis://:local_only_change_me@localhost:6379'
$env:TEST_MINIO_ENDPOINT = 'http://localhost:9000'
$env:TEST_MINIO_ACCESS_KEY = 'garun_local'
$env:TEST_MINIO_SECRET_KEY = 'local_only_change_me'
$env:TEST_MAILPIT_URL = 'http://localhost:8025'
$env:TEST_SCANNER_HOST = 'localhost'
$env:TEST_SCANNER_PORT = '3310'
pnpm test:integration
pnpm test:e2e
```
