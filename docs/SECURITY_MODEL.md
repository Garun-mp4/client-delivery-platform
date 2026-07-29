# Security model

## Основные гарантии

- deny by default RBAC и явные project permissions;
- `workspaceId` из URL/body/query никогда не становится tenant context;
- composite tenant/project foreign keys и cross-tenant/IDOR tests;
- database-backed revocable sessions, CSRF/origin checks и rate limits;
- raw tokens, cookies, preview passwords, signed URLs и private content не логируются;
- private S3 objects, quarantine/ClamAV и повторная download authorization;
- SSRF-safe URL transport и browser renderer без credentials;
- immutable approval snapshots и append-only audit;
- transactional outbox и idempotent background processing.

## Review перед пилотом

Запускаются `pnpm audit:deps`, `pnpm audit:secrets`, `pnpm test:security`, CSP/headers E2E, migration
drift и artifact verification. High-confidence secret scan проверяет tracked env, credentials, keys,
tokens, local databases, logs и build artifacts.

PostgreSQL RLS остаётся отдельным обязательным review перед публичным SaaS. Контролируемый пилот
полагается на application isolation и не разрешает публичную регистрацию workspace.

## Неутверждённые production-вопросы

Домен, data region/jurisdiction, production accounts, sender domain, scanner deployment и внешняя
privacy/retention policy не утверждены. Документ не заявляет соответствие конкретному
законодательству.
