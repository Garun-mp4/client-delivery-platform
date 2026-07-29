# Deployment guide

## Среды

Local, test, staging и production используют отдельные databases, Redis instances и private
buckets. Домен, provider accounts и secrets задаются конфигурацией и не находятся в Git.

## Release sequence

1. frozen install, dependency/secret audit;
2. format, lint, strict typecheck, unit/security/integration;
3. migration drift и review generated SQL;
4. backup перед destructive/high-risk migration;
5. build и artifact verification;
6. deploy migrations один раз;
7. deploy worker, затем web;
8. readiness, critical E2E и post-deploy smoke;
9. наблюдение за errors/queues и подтверждение rollout.

Rollback приложения использует предыдущий immutable artifact. Migration rollback не выполняется
автоматически: schema changes до публичного rollout должны быть backward-compatible; destructive
изменение требует отдельного expand/migrate/contract плана.

Production пока не разрешён: отсутствуют утверждённые domain/provider/data-region/sender/scanner
решения. Контролируемый пилот допускается только на изолированной staging-like среде после ручного
release checklist из `docs/PILOT_RUNBOOK.md`.
