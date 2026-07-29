# Клиенты, проекты, каталог и доступ

## Поток владельца

1. Владелец создаёт карточку компании. `internalNotes` видны только внутренней стороне.
2. Проект создаётся в статусе `draft`; клиентская сторона его не видит.
3. Владелец проверяет отдельный client preview без impersonation и публикует проект.
4. Приглашение связывает email с одной компанией и явным grant одного проекта. Outbox создаётся в
   той же транзакции и передаёт одноразовую ссылку worker через зашифрованный envelope.
5. Принятие одной ссылки создаёт/восстанавливает membership компании и проекта, создаёт session и
   сразу открывает опубликованный проект. Второе письмо не требуется.
6. Отзыв `ProjectMembership` немедленно закрывает проект. Session пользователя остаётся пригодной
   только для других явно разрешённых ресурсов.

## Матрица разрешений

| Действие                       | Owner |      Employee с grant       |      Client      |  Observer   |
| ------------------------------ | :---: | :-------------------------: | :--------------: | :---------: |
| Видеть внутреннюю карточку     |  да   |             да              |       нет        |     нет     |
| Создавать клиента/проект       |  да   | только workspace permission |       нет        |     нет     |
| Редактировать проект           |  да   |       `project.edit`        |       нет        |     нет     |
| Публиковать                    |  да   |      `project.publish`      |       нет        |     нет     |
| Управлять project memberships  |  да   |  `project.members.manage`   |       нет        |     нет     |
| Видеть опубликованный проект   |  да   |         явный grant         |   явный grant    | явный grant |
| Изменять клиентское содержимое |   —   |              —              | вне Milestone 03 |     нет     |
| Видеть черновик                |  да   |   явный внутренний grant    |       нет        |     нет     |
| Изменять архив                 |  нет  |             нет             |       нет        |     нет     |
| Читать доступную обложку       |  да   |         явный grant         |   явный grant    | явный grant |
| Загружать/удалять обложку      |  да   |       `project.edit`        |       нет        |     нет     |
| Запустить новый автоснимок     |  да   |       `project.edit`        |       нет        |     нет     |
| Читать диагностику автоснимка  |  да   |             нет             |       нет        |     нет     |

Неизвестное разрешение запрещено. UI не является границей безопасности: те же проверки выполняются
в application services и tenant-scoped queries.

## Tenant isolation

- `TenantContext` получается только из проверенной database-backed session и активного
  `WorkspaceMembership`.
- Значения workspace/project/company из URL и form data считаются недоверенными.
- Все мутации проверяют policy и связывают `workspaceId` из server context с искомой сущностью.
- Composite foreign keys запрещают связать компанию, проект, пользователя или invitation из другого
  workspace.
- Клиентский список строится только по активным `ProjectMembership`; membership компании сам по себе
  не даёт доступ ко всем проектам.
- Чужой или недоступный объект возвращает тот же безопасный `404`/not-found state.
- Background email event сохраняет `workspaceId`; raw token отсутствует в обычном payload и логах.

## Модель данных

```mermaid
erDiagram
  WORKSPACE ||--o{ CLIENT_COMPANY : owns
  WORKSPACE ||--o{ PROJECT : owns
  CLIENT_COMPANY ||--o{ PROJECT : commissions
  USER ||--o{ CLIENT_MEMBERSHIP : receives
  CLIENT_COMPANY ||--o{ CLIENT_MEMBERSHIP : contains
  USER ||--o{ PROJECT_MEMBERSHIP : receives
  PROJECT ||--o{ PROJECT_MEMBERSHIP : grants
  INVITATION ||--o| CLIENT_INVITATION_CONTEXT : describes
  CLIENT_COMPANY ||--o{ CLIENT_INVITATION_CONTEXT : targets
  INVITATION ||--o{ INVITATION_PROJECT_GRANT : carries
  PROJECT ||--o{ INVITATION_PROJECT_GRANT : targets
  PROJECT ||--o{ PROJECT_COVER_ASSET : has
  FILE_OBJECT ||--o| PROJECT_COVER_ASSET : stores
  SITE_VERSION ||--o{ PROJECT_COVER_CAPTURE : triggers
  PROJECT ||--o{ PROJECT_COVER_CAPTURE : queues
  PROJECT_COVER_CAPTURE ||--o| PROJECT_COVER_ASSET : produces
```

`Project.statusBeforeArchive` допустим только при `status = archived`. Плановая дата завершения не
может быть раньше даты начала. Сочетания membership side/role ограничены database checks.
`ProjectCoverAsset` и `ProjectCoverCapture` связаны с workspace/project composite keys: файл или
версию другого tenant/project присоединить невозможно.

## Каталог и обложки

- Каталог вычисляется на сервере и хранит поиск, фильтр, сортировку, страницу и вид в URL.
- Карточный вид показывает обложку, текущий этап, прогресс, срок, последнюю значимую активность и
  следующий маршрут. Компактный вид сохраняет те же ключевые данные для больших списков.
- Внутренние участники получают internal workflow только при явном project membership; client DTO
  исключает internal stages, actions, updates и диагностические failure codes.
- Приоритет обложки неизменен: clean manual, затем succeeded automatic, затем dashed fallback.
- Новая manual upload не заменяет текущую до scanner/Sharp activation. Удаление manual автоматически
  раскрывает доступный automatic asset.
- Изображение выдаётся только приватным same-origin endpoint после повторной project policy.

## Проверяемые гарантии

- mass-assignment allowlist не принимает `workspaceId`, `status`, `publishedAt` и owner-поля вне
  утверждённого input;
- draft скрыт от client/observer;
- client DTO не содержит внутренних заметок;
- cross-tenant company/project IDs не принимаются;
- grant одного проекта не открывает второй проект той же компании;
- повторное приглашение не создаёт membership-дубликат;
- архив read-only, отзыв доступа действует сразу;
- critical flow и mobile accessibility проверяются Playwright.

Оплаты и согласования общего назначения остаются границами следующих milestones.
