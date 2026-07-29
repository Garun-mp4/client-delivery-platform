# Observability и alerts

Structured JSON logs содержат service, level, safe error code и correlation/request ID. Redaction
удаляет authorization, cookies, tokens, passwords, URLs с секретами и PII-поля.

Worker на приватном management port предоставляет:

- `/health/live` — только состояние процесса;
- `/health/ready` — агрегированную готовность зависимостей;
- `/metrics` — fixed-name Prometheus gauges без tenant/project/user labels.

Минимальный pilot dashboard: request error rate/latency web, readiness web/worker, outbox pending,
notification failures, export pending/failed, file processing pending, cover captures pending,
PostgreSQL connections/CPU/storage, Redis memory/evictions и object storage errors.

Минимальные alerts:

- readiness `503` больше 5 минут — critical;
- outbox pending растёт 10 минут или oldest > 15 минут — high;
- failed notification/export > 0 за 15 минут — medium;
- file/capture processing older than stale threshold — high;
- DB storage > 80%, backup failure или restore drill failure — critical;
- p95 page > 2 s или mutation > 3 s в трёх окнах — medium.

Management port нельзя публиковать в интернет. Provider-specific dashboard создаётся только после
выбора staging/production provider.
