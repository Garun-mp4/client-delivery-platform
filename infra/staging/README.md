# Staging contract

Конкретный provider и account не утверждены. Этот каталог не создаёт resources и не содержит
secrets; он фиксирует минимальный deployment contract:

- web, worker, migrations, PostgreSQL, Redis, private S3 bucket и required scanner разделены;
- management port worker приватный; наружу доступен только HTTPS web;
- secrets поступают из provider secret store, environments не делят credentials/data;
- migration — отдельный one-shot release step до web/worker rollout;
- readiness используется rollout controller, liveness не зависит от внешних services;
- browser renderer запускается non-root в отдельном hardened sandbox без direct network;
- backup/restore, metrics/alerts и post-deploy smoke обязательны до пилотного приглашения.

Provider-specific manifest добавляется только после подтверждения Vercel/Railway-compatible
окружения, region и account owner. До этого source of truth — `docs/DEPLOYMENT.md` и
`docs/PILOT_RUNBOOK.md`.
