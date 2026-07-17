# Scope, этапы и действия

Документ описывает фактически реализованный Milestone 04. Все операции выполняются внутри
проверенного `TenantContext`; `workspaceId`, project ID, assignee и approver из формы повторно
проверяются server-side.

## Рабочий поток

1. Внутренний участник с `project.edit` создаёт новую draft-версию scope.
2. Draft отправляется одному явно назначенному клиенту с `ClientMembership.canApprove = true`.
3. Назначенный согласующий принимает версию либо запрашивает изменения с обязательным комментарием.
4. Согласование делает версию неизменяемой. Запрос изменений supersede-ит проверенную версию и
   создаёт новый draft с тем же содержимым.
5. Внутренняя команда создаёт этапы и действия. Клиент видит только client-visible этапы и только
   назначенные ему действия.
6. Клиентский экран показывает одно главное действие: согласовать scope либо выполнить наиболее
   важное назначенное действие.

Scope agreement Milestone 04 использует `any_one` и одного назначенного согласующего. Общая approval
strategy, несколько approvers, `all_required` и stage approvals относятся к Milestone 08.

## Состояния

- Scope: `draft → client_review → agreed|superseded`. Согласованный текст защищён DB trigger.
- Этап: `not_started`, `in_progress`, `waiting_for_client`, `ready_for_review`,
  `changes_requested`, `approved`, `skipped`. В Milestone 04 общий переход в `approved` закрыт до
  появления общего approval flow; `ready_for_review` требует результат, `skipped` — причину.
- Действие: `open → in_progress|done|cancelled`, `in_progress → done|cancelled`. Terminal states
  необратимы.

## Прогресс и блокировка

Точная проекция хранит числитель и знаменатель:

```text
completed = Σ weight для approved и skipped с непустой причиной
total     = Σ weight для countsTowardProgress
percent   = total == 0 ? 0 : round(completed / total × 100)
```

Проекция пересчитывается в транзакции после изменения этапов. `blockedByClient` вычисляется только
из открытых client-visible blocking actions и ссылается на конкретное действие. Ранжирование:
просроченные, затем priority, due date и creation time.

Completion gate описан общей функцией и не зависит от оплат, пока payment module выключен. Он
проверяет обязательные этапы, blocking actions, финальное согласование и handover; unpaid payment
учитывается только при наличии обязательного платёжного этапа.

## Безопасность

- Agreed scope нельзя обновить обычным SQL; разрешён только переход целой версии в `superseded`.
- Approver проверяется одновременно по workspace, проекту, project membership, client membership и
  явному `canApprove`.
- Composite foreign keys исключают смешивание project/workspace ID.
- Внешние URL scope разрешают только HTTP(S), без credentials.
- Срок действия — дата, преобразованная в однозначный `23:59:59.999Z`; UI не передаёт локальное
  время без offset.
- Audit хранит переходы и request ID, но не содержимое приватных материалов или секреты.
- Domain outbox payload содержит только безопасные IDs и тип события.

## Проверка вручную

Откройте проект и нажмите «План, этапы и действия». Для согласования пригласите клиента с флагом
«Может согласовывать границы проекта», создайте scope и назначьте этого клиента. После входа клиента
его экран `/workflow` должен показывать одно главное действие и не должен показывать внутренние
действия.
