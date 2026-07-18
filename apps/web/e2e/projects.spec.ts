import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';

const mailpit = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';

async function latestLink(request: APIRequestContext, recipient: string) {
  let messageId = '';
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailpit}/api/v1/messages`);
        const body = (await response.json()) as {
          messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
        };
        messageId =
          body.messages?.find((message) => message.To?.some((to) => to.Address === recipient))
            ?.ID ?? '';
        return messageId;
      },
      { timeout: 15_000 },
    )
    .not.toBe('');
  const response = await request.get(`${mailpit}/api/v1/message/${messageId}`);
  const message = (await response.json()) as { Text: string };
  const link = message.Text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error('Project invitation link not found');
  return link;
}

test('owner publishes one project and grants then revokes explicit client access', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const clientEmail = `e2e-project-client-${suffix}@example.test`;
  const companyName = `E2E клиент ${suffix}`;
  const projectName = `E2E проект ${suffix}`;
  const projectSlug = `e2e-project-${suffix}`;
  const internalNote = `Внутренний секрет ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/workspace\/e2e-studio/);

  await page.goto('/workspace/e2e-studio/clients');
  if (!(await page.getByLabel('Название компании').isVisible())) {
    await page.locator('summary').filter({ hasText: 'Создать компанию' }).click();
  }
  await page.getByLabel('Название компании').fill(companyName);
  await page.getByLabel('Email', { exact: true }).fill(clientEmail);
  await page.getByLabel('Внутренние заметки').fill(internalNote);
  await page.getByRole('button', { name: 'Создать клиента' }).click();
  await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

  await page.goto('/workspace/e2e-studio/projects');
  if (!(await page.getByLabel('Название проекта').isVisible())) {
    await page.locator('summary').filter({ hasText: 'Создать черновик' }).click();
  }
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-09-01');
  await page.getByLabel('Плановое завершение').fill('2026-10-01');
  await page.getByLabel('Описание').fill('Описание, доступное клиенту.');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectSlug}`));

  await page.getByRole('link', { name: 'Посмотреть глазами клиента' }).click();
  await expect(page.getByText('Предпросмотр клиентского интерфейса')).toBeVisible();
  await expect(page.getByText(internalNote)).toHaveCount(0);
  await page.getByRole('link', { name: 'Вернуться к управлению' }).click();

  await page.getByLabel('Показывать приглашённым клиентам').check();
  await page.getByRole('button', { name: 'Опубликовать проект' }).click();
  await expect(page.getByText('Операция выполнена.')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Пригласить представителя клиента' }).click();
  await page.getByLabel('Email клиента').fill(clientEmail);
  await page.getByLabel('Может согласовывать границы проекта').check();
  await page.getByRole('button', { name: 'Отправить приглашение' }).click();
  await expect(page.getByText(clientEmail)).toBeVisible();

  const invitationLink = await latestLink(request, clientEmail);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(
    invitationLink.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await clientPage.getByRole('button', { name: 'Принять приглашение' }).click();
  await expect(clientPage).toHaveURL(new RegExp(`/projects/${projectSlug}`));
  await expect(clientPage.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(clientPage.getByText(internalNote)).toHaveCount(0);

  await page.getByRole('link', { name: 'План', exact: true }).click();
  await page.getByLabel('Краткое описание').fill('Разработка публичного сайта компании');
  await page.getByLabel(/Цели —/).fill('Запустить новый канал продаж');
  await page.getByLabel(/Страницы —/).fill('Главная\nКаталог');
  await page.getByLabel(/Результаты —/).fill('Адаптивный сайт');
  await page.getByLabel(/Критерии приёмки —/).fill('Все страницы открываются без ошибок');
  await page.getByRole('button', { name: 'Создать версию scope' }).click();
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();

  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/workflow`);
  await expect(
    clientPage.getByRole('heading', { name: 'Проверьте и согласуйте границы проекта' }),
  ).toBeVisible();
  await clientPage.getByRole('button', { name: 'Согласовать версию' }).click();
  await expect(clientPage.getByText('Изменения сохранены.')).toBeVisible();

  await page.reload();
  await page.getByLabel('Название этапа').fill('Прототип');
  await page.getByLabel('Вес прогресса').fill('5');
  await page.getByLabel('Начало', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Завершение', { exact: true }).fill('2026-09-10');
  await page.getByRole('button', { name: 'Добавить этап' }).click();
  await page.getByLabel('Название действия').fill('Передать логотип');
  await page.getByLabel('Исполнитель').selectOption({ index: 1 });
  await page.getByLabel('Видимость').selectOption('client');
  await page.getByLabel('Срок').fill('2026-09-05');
  await page.getByLabel('Блокирует дальнейший ход проекта').check();
  await page.getByRole('button', { name: 'Создать действие' }).click();

  await clientPage.reload();
  await expect(clientPage.getByRole('heading', { name: 'Передать логотип' })).toBeVisible();
  await clientPage.getByRole('button', { name: 'Отметить выполненным' }).click();
  await expect(clientPage.getByText('Изменения сохранены.')).toBeVisible();

  const forbiddenCreate = await clientPage.request.post('/api/workspaces/e2e-studio/projects', {
    form: {
      name: 'Недоступный проект',
      slug: `blocked-${suffix}`,
      clientCompanyId: crypto.randomUUID(),
      projectType: 'website',
      ownerUserId: crypto.randomUUID(),
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-10-01',
    },
    headers: { origin: test.info().project.use.baseURL as string },
  });
  expect(forbiddenCreate.status()).toBe(404);

  await clientPage.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page: clientPage }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}`);
  await page.locator('summary').filter({ hasText: 'Участники проекта' }).click();
  await page.getByLabel('Подтверждаю отзыв доступа').check();
  await page.getByRole('button', { name: 'Удалить из проекта' }).click();
  await expect(page.getByText('Операция выполнена.')).toBeVisible();
  await clientPage.reload();
  await expect(clientPage.getByRole('heading', { name: projectName })).toHaveCount(0);
  await clientPage.goto('/workspace/e2e-studio/projects');
  await expect(clientPage.getByText(projectName)).toHaveCount(0);
  await clientContext.close();
});
