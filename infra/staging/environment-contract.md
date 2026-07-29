# Environment contract

Required groups без значений:

- application: `APP_ENV=staging`, `APP_NAME`, `PUBLIC_APP_URL`, `LOG_LEVEL`;
- data: `DATABASE_URL`, `REDIS_URL`;
- identity: `BETTER_AUTH_SECRET`, `OUTBOX_ENCRYPTION_KEY`, cookie/TTL settings;
- email: sender/SMTP adapter configuration;
- storage: private endpoint/public signing endpoint, region, bucket and credentials;
- scanner: required host/port;
- worker: private bind/port and browser executable/sandbox limits;
- retention/limits: files, quota, deleted/incomplete data, export artifacts.

`packages/config` является исполняемой runtime validation. Placeholder local secrets, non-HTTPS
public URL, non-HTTPS public storage endpoint или disabled scanner должны fail-fast в production.
