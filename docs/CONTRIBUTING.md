# Contribution guide

1. Прочитать `PROJECT_SPEC.md`, `AGENTS.md`, план, решения и статус.
2. Создать отдельную branch текущего milestone; не расширять scope.
3. Server policies, validation, transaction, tenant scope, audit/outbox и tests добавляются вместе.
4. Новая production dependency требует ADR с альтернативами и влиянием.
5. Generated migration прочитать и проверить на чистой/существующей БД.
6. Перед push выполнить format, lint, typecheck, unit/integration/security, build и применимые
   E2E/a11y/performance.
7. Проверить diff, tracked files и secret scan. Не коммитить env, tokens, logs и artifacts.

Commit message описывает фактический результат. Force push и переписывание опубликованной истории
не используются.
