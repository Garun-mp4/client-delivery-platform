export const projectStatusLabels = {
  draft: 'Черновик',
  onboarding: 'Подготовка к работе',
  in_progress: 'В работе',
  waiting_for_client: 'Ожидает клиента',
  review: 'На проверке',
  paused: 'Приостановлен',
  completed: 'Завершён',
  maintenance: 'На обслуживании',
  archived: 'Архив',
} as const;

export const projectTypeLabels = {
  website: 'Корпоративный сайт',
  landing: 'Лендинг',
  ecommerce: 'Интернет-магазин',
  redesign: 'Редизайн',
  other: 'Другой тип',
} as const;
