# Incident response

1. Зафиксировать время, environment, request ID и наблюдаемый impact без копирования PII/content.
2. Классифицировать: P0 security/data loss, P1 critical path outage, P2 degraded background
   processing, P3 minor.
3. Ограничить ущерб: revoke sessions/keys, остановить affected worker или отключить rollout; не
   удалять audit/queue evidence.
4. Проверить health, aggregate metrics, provider events и safe error codes.
5. Восстановить сервис безопасным rollback либо documented restore.
6. Выполнить tenant isolation/critical smoke и наблюдать минимум одно alert window.
7. Записать timeline, root cause, corrective actions и срок; секреты после инцидента ротировать.

При подозрении на cross-tenant exposure rollout останавливается немедленно. До подтверждения
границы нельзя отправлять клиентам предположения о юридическом статусе инцидента.
