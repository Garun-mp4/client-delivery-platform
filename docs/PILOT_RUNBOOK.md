# Контролируемый пилот

## До приглашения клиента

- утверждены domain, provider accounts, data region, sender domain, scanner и retention;
- CI, migration, backup/restore, security, E2E/a11y/performance и post-deploy smoke зелёные;
- настроены private metrics/alerts и ответственный за инциденты;
- создан отдельный workspace и проверены owner credentials/session revoke;
- тестовый проект проходит create → invite → materials → review → approval → handover → export.

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
