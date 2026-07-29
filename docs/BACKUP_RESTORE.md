# Backup и restore

## Контракт

Production backup должен быть зашифрован, находиться отдельно от основной БД, иметь ограниченный
доступ и проверяемый retention. Backup без rehearsal не считается рабочим.

Локальный drill создаёт custom-format `pg_dump`, восстанавливает его в уникальную временную БД,
проверяет обязательные таблицы и удаляет временный dump/database:

```powershell
docker compose up -d --wait
pnpm backup:verify --env compose
```

Команда не печатает connection string, строки данных или полный checksum. Она не удаляет основную
БД и не использует `docker compose down -v`.

## Staging/production

До запуска должны быть утверждены provider, data region, KMS/secret store, RPO/RTO и владелец
доступа. Процедура:

1. заморозить опасные migrations и записать incident/request ID;
2. создать provider snapshot и логический encrypted dump;
3. восстановить в изолированную новую БД;
4. применить приложение той же версии и выполнить readiness + critical smoke;
5. сверить migrations, tenant counts и выборочные checksums без чтения content в logs;
6. уничтожить rehearsal среду по утверждённой retention.

`--env staging` намеренно не работает без явно утверждённой staging connection/credential
процедуры. Это исключает случайную работу с production.
