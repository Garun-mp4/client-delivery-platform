# API conventions

- Route Handlers — transport boundary; business rules находятся в `packages/core`.
- Успешная HTML form mutation отвечает `303` на same-origin allowlisted path.
- JSON error имеет стабильный безопасный code и при наличии request/correlation ID.
- Чужой и отсутствующий tenant/project возвращают одинаковый `404`.
- Mutation требует server session, policy, validation, transaction и audit; retry — только явно
  идемпотентный.
- Client DTO строится allowlist-проекцией и не является общим ORM row с удалёнными полями.
- IDs случайные UUID; workspace/actor не принимаются как authority из client input.
- Content, tokens, object keys, credentials и stack traces не входят в production response.
- Background payload содержит только durable IDs и tenant context, после чего worker повторяет
  authorization.
