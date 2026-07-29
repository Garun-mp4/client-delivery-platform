# Storage model

Один приватный S3-compatible bucket используется через `S3ObjectStorage`. Ключ случайный и не
содержит PII/исходного имени. Браузер получает только короткую presigned operation после policy.

Пользовательский файл проходит `initiated → uploaded → scanning → available|rejected|failed`.
До `available/clean` metadata и download недоступны клиенту. Preview удаляет EXIF. Expired uploads,
deleted files после grace period и expired export artifacts удаляются фоновыми задачами.

Export artifacts находятся под `exports/<workspace>/<project>/<job>.tar.gz`, но object key никогда
не является public API. Ограничения export предотвращают неограниченный archive amplification.
Production bucket обязан иметь encryption at rest, lifecycle fallback, versioning policy и
запрещённый public access.
