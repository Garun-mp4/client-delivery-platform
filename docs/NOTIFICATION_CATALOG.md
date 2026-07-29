# Каталог уведомлений

| Событие                         | In-app | Email | Напоминание | Примечание                        |
| ------------------------------- | ------ | ----- | ----------- | --------------------------------- |
| Invitation/security login       | —      | Да    | Нет         | Не отключается project preference |
| Action/material assigned        | Да     | Да    | Да          | Автор подавляется                 |
| Site version published          | Да     | Да    | Нет         | Deep link повторно авторизуется   |
| Feedback/comment requires reply | Да     | Да    | Нет         | Только allowlisted summary        |
| Approval requested/resolved     | Да     | Да    | По сроку    | Только назначенные участники      |
| Project completed               | Да     | Да    | Нет         | Один dedupe instance              |

Email outage не откатывает business mutation. Quiet hours задерживают только email. Потеря
membership подавляет delivery. Full email body, token и private URL не находятся в queue payload
или logs.
