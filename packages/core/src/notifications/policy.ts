import type { NotificationEventType, NotificationPresentation } from './types';

const presentations: Readonly<Record<NotificationEventType, NotificationPresentation>> = {
  'action.created': {
    title: 'Новое действие',
    description: 'В проекте появилось действие, назначенное вам.',
  },
  'action.reminder.due_soon': {
    title: 'Срок приближается',
    description: 'Назначенное вам действие нужно завершить в ближайшее время.',
  },
  'action.reminder.overdue': {
    title: 'Действие просрочено',
    description: 'Срок назначенного вам действия уже прошёл.',
  },
  'material.requested': {
    title: 'Нужны материалы',
    description: 'Команда проекта запросила новый материал.',
  },
  'site_version.published': {
    title: 'Версия готова к проверке',
    description: 'Опубликована новая версия результата.',
  },
  'feedback.created': {
    title: 'Новое замечание',
    description: 'К опубликованной версии добавлено замечание.',
  },
  'feedback.comment_added': {
    title: 'Новый ответ',
    description: 'В обсуждении замечания появился ответ.',
  },
  'approval.requested': {
    title: 'Требуется согласование',
    description: 'Вам назначен результат для проверки и решения.',
  },
  'approval.approved': {
    title: 'Результат согласован',
    description: 'По запросу согласования принято положительное решение.',
  },
  'approval.changes_requested': {
    title: 'Запрошены изменения',
    description: 'По результату согласования требуется доработка.',
  },
  'project.completed': {
    title: 'Проект завершён',
    description: 'Все обязательные условия завершения проекта выполнены.',
  },
  'project.archived': {
    title: 'Проект перемещён в архив',
    description: 'Проект доступен только для чтения.',
  },
};

export function notificationPresentation(eventType: string): NotificationPresentation {
  return (
    presentations[eventType as NotificationEventType] ?? {
      title: 'Обновление проекта',
      description: 'В проекте произошло важное изменение.',
    }
  );
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateQuietHours(startMinute: number | null, endMinute: number | null): boolean {
  if (startMinute === null || endMinute === null) {
    return startMinute === null && endMinute === null;
  }
  return (
    Number.isInteger(startMinute) &&
    Number.isInteger(endMinute) &&
    startMinute >= 0 &&
    startMinute < 1_440 &&
    endMinute >= 0 &&
    endMinute < 1_440 &&
    startMinute !== endMinute
  );
}

function localMinute(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function isInsideQuietHours(
  date: Date,
  timezone: string,
  startMinute: number | null,
  endMinute: number | null,
): boolean {
  if (startMinute === null || endMinute === null) return false;
  const minute = localMinute(date, timezone);
  return startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;
}
