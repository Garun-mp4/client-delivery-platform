# Staging contract

Production provider и account по-прежнему не утверждены. Для внутренней бесплатной проверки
создан отдельный hybrid staging без платёжных данных:

- web: Vercel Hobby;
- PostgreSQL и private S3-compatible bucket: Supabase Free;
- Redis: Upstash Free;
- worker, Mailpit и ClamAV: локальный Docker/host runtime.

Этот каталог не содержит secrets. Минимальный deployment contract:

- web, worker, migrations, PostgreSQL, Redis, private S3 bucket и required scanner разделены;
- management port worker приватный; наружу доступен только HTTPS web;
- secrets поступают из provider secret store, environments не делят credentials/data;
- migration — отдельный one-shot release step до web/worker rollout;
- readiness используется rollout controller, liveness не зависит от внешних services;
- browser renderer запускается non-root в отдельном hardened sandbox без direct network;
- backup/restore, metrics/alerts и post-deploy smoke обязательны до пилотного приглашения.

## Текущий внутренний стенд

- web: `https://client-delivery-platform-web.vercel.app`;
- liveness: `/api/health/live`;
- readiness: `/api/health/ready`;
- workspace для внутренней проверки: `demo-studio`;
- локальный Mailpit: `http://127.0.0.1:8025`.

Демонстрационный owner создан, но его пароль намеренно не записан в Git или документацию. Текущая
браузерная session используется для внутренней проверки; постоянный пароль следует отдельно
сменить на выбранный владельцем перед передачей доступа другому человеку.

## Порядок запуска hybrid worker

1. Запустить локальные Mailpit и ClamAV: `docker compose up -d mailpit clamav`.
2. Передать worker внешние `DATABASE_URL`, `DATABASE_SSL_CA`, `REDIS_URL` и storage credentials
   через текущий process environment/secret store; не создавать `.env` с реальными значениями.
3. Использовать те же `BETTER_AUTH_SECRET` и `OUTBOX_ENCRYPTION_KEY`, что и у staging web.
4. Запустить `pnpm --filter @garun/worker build`, затем compiled worker artifact.
5. Проверить `http://127.0.0.1:3001/health/live`, `/health/ready` и Mailpit
   `http://127.0.0.1:8025`.

Пока локальный worker остановлен, письма, quarantine scan, exports, notifications и capture jobs
останутся в очереди. Такая среда годится для внутреннего rehearsal, но не для приглашения внешнего
клиента. Source of truth — `docs/DEPLOYMENT.md` и `docs/PILOT_RUNBOOK.md`.

На текущей Windows-машине прямой TLS-сеанс Node.js к staging Supabase сбрасывается до SQL-запроса,
хотя TCP endpoint доступен. Проверка сертификата не отключается. Поэтому локальный worker нельзя
считать подключённым к staging до устранения сетевого ограничения или размещения worker у
совместимого контейнерного провайдера.
