# Контролируемый пилот

## До приглашения клиента

- утверждены domain, provider accounts, data region, sender domain, scanner и retention;
- CI, migration, backup/restore, security, E2E/a11y/performance и post-deploy smoke зелёные;
- настроены private metrics/alerts и ответственный за инциденты;
- создан отдельный workspace и проверены owner credentials/session revoke;
- тестовый проект проходит create → invite → materials → review → approval → handover → export.

Бесплатный hybrid staging из ADR-049 сначала используется только для внутреннего rehearsal.
Внешнего клиента нельзя приглашать, пока worker/scanner/email зависят от включённого компьютера и
Mailpit: ссылка из локального почтового ящика не считается надёжной клиентской доставкой.

## Локальный rehearsal Milestone 10.5

1. Пересобрать актуальные sources: `docker compose up -d --build --wait`.
2. Задать `PILOT_PUBLIC_SITE_URL` на вымышленный публичный HTTP(S)-сайт без пароля и клиентских
   данных.
3. Убедиться, что URL доступен напрямую: `curl.exe --noproxy "*" -I https://example.com`.
4. Выполнить `pnpm test:e2e:pilot`.

Сценарий последовательно проверяет owner/client access, scope, blocking action, анкету, material
quarantine/scan, SiteVersion, реальный Chromium capture, feedback, назначенные согласования,
export, completion, archive/restore и отзыв доступа. Письмо приглашения читается только из Mailpit;
реальные адреса и персональные данные не используются.

Capture eligibility вычисляется сервером и имеет только allowlisted состояния: `eligible`,
`no_version`, `check_pending`, `unsafe`, `unreachable`, `password_protected`, `not_published`.
Клиентский UI не вычисляет пригодность сам и не получает URL, внутренние ID или worker diagnostics.
Проксирование browser traffic не является допустимым обходом отсутствующего прямого маршрута:
renderer обязан сохранять DNS/IP validation и connection pinning для каждого ресурса.

## Знакомство клиента

Письмо ведёт сразу в проект. На первом созвоне проверяются mobile login, следующее действие,
загрузка одного материала и доступ к версии. Клиент получает один support-канал и инструкцию не
отправлять passwords/секреты в комментариях или файлах.

## Поддержка

P1 — вход, tenant access, загрузка/скачивание, approval или data integrity: реакция в рабочее время
в течение часа, остановка rollout. P2 — уведомления/export/background delay: в течение рабочего
дня. Все обращения фиксируются с request ID и временем без копирования private content.

## После пилота

Собрать только агрегированные показатели: успешность critical path, время до первого действия,
число support обращений, queue failures и p95. Milestone 11 начинается только после отдельного
решения владельца продукта.
