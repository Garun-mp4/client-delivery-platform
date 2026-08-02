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

## Бесплатный hybrid staging

Текущая внутренняя среда использует Vercel Hobby для web, Supabase Free для PostgreSQL/private S3
и Upstash Free для Redis. Worker, Mailpit и ClamAV запускаются локально. Карты и платные планы не
подключаются. Это позволяет проверить публичный web и реальные внешние зависимости, но не даёт
always-on background processing или реальную email-доставку.

Для Supabase pooler задаются `DATABASE_URL` и `DATABASE_SSL_CA` с официальным project CA. PEM
хранится как sensitive environment variable; приложение удаляет `sslmode` из URL при наличии CA,
чтобы URL parser не переопределил явную проверку сертификата. Не использовать `sslmode=no-verify`
или `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Лимиты этой среды: `FILE_MAX_BYTES=50000000`, `WORKSPACE_QUOTA_BYTES=1000000000`. Они отражают
ограничения бесплатного storage и не меняют defaults продукта 100 MiB/10 GiB. Полная схема и
операционные команды находятся в `infra/staging/README.md`.
