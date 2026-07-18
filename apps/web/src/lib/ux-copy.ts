export function formatProjectWaitingTitle(count: number) {
  const remainder10 = count % 10;
  const remainder100 = count % 100;
  const phrase =
    remainder10 === 1 && remainder100 !== 11
      ? 'проект ожидает'
      : remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)
        ? 'проекта ожидают'
        : 'проектов ожидают';

  return `${count} ${phrase} клиента`;
}
