import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { eq } from 'drizzle-orm';

import { createDatabaseClient } from '@garun/db';
import { siteVersion } from '@garun/db/schema';

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
      { timeout: 20_000 },
    )
    .not.toBe('');
  const response = await request.get(`${mailpit}/api/v1/message/${messageId}`);
  const message = (await response.json()) as { Text: string };
  const link = message.Text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error('Review invitation link not found');
  return link;
}

test('owner publishes a checked version and client closes structured feedback', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const clientEmail = `e2e-review-client-${suffix}@example.test`;
  const companyName = `Review клиент ${suffix}`;
  const projectName = `Review проект ${suffix}`;
  const projectSlug = `review-project-${suffix}`;
  const versionName = `Версия ${suffix}`;
  const feedbackTitle = `Проверить заголовок ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.goto('/workspace/e2e-studio/clients');
  if (!(await page.getByLabel('Название компании').isVisible())) {
    await page.locator('summary').filter({ hasText: 'Создать компанию' }).click();
  }
  await page.getByLabel('Название компании').fill(companyName);
  await page.getByRole('button', { name: 'Создать клиента' }).click();
  await page.goto('/workspace/e2e-studio/projects');
  if (!(await page.getByLabel('Название проекта').isVisible())) {
    await page.locator('summary').filter({ hasText: 'Создать черновик' }).click();
  }
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-09-01');
  await page.getByLabel('Плановое завершение').fill('2026-10-01');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByLabel('Показывать приглашённым клиентам').check();
  await page.getByRole('button', { name: 'Опубликовать проект' }).click();
  await page.locator('summary').filter({ hasText: 'Пригласить представителя клиента' }).click();
  await page.getByLabel('Email клиента').fill(clientEmail);
  await page.getByRole('button', { name: 'Отправить приглашение' }).click();

  await page.getByRole('link', { name: 'Проверка' }).click();
  await page.locator('summary').filter({ hasText: 'Опубликовать обновление' }).click();
  await page.getByLabel('Заголовок').fill('Собрана версия для проверки');
  await page.getByLabel('Что изменилось').fill('Готова главная страница.');
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await page.locator('summary').filter({ hasText: 'Добавить версию' }).click();
  await page.getByLabel('Название версии').fill(versionName);
  await page.getByLabel('Безопасный URL').fill('https://example.com/');
  await page.getByLabel('Список изменений').fill('Добавлена главная страница.');
  await page.getByLabel('Что именно проверить').fill('Проверьте заголовок и мобильный вид.');
  await page.getByRole('button', { name: 'Добавить и проверить' }).click();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const database = createDatabaseClient(databaseUrl);
  try {
    const [created] = await database.db
      .select({ id: siteVersion.id })
      .from(siteVersion)
      .where(eq(siteVersion.name, versionName));
    if (!created) throw new Error('E2E site version missing');
    await database.db
      .update(siteVersion)
      .set({
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        embedStatus: 'blocked',
        checkedAt: new Date(),
      })
      .where(eq(siteVersion.id, created.id));
  } finally {
    await database.pool.end();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Показать клиенту' }).click();
  await expect(page.getByText('Доступна клиенту')).toBeVisible();

  const invitationLink = await latestLink(request, clientEmail);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(
    invitationLink.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await clientPage.getByRole('button', { name: 'Принять приглашение' }).click();
  await expect(clientPage).toHaveURL(new RegExp(`/projects/${projectSlug}`));
  await expect(clientPage.getByRole('heading', { name: projectName })).toBeVisible();
  await clientPage.getByRole('link', { name: 'Проверка' }).click();
  await expect(clientPage.getByRole('heading', { name: versionName })).toBeVisible();
  await clientPage.locator('summary').filter({ hasText: 'Оставить замечание' }).click();
  await clientPage.getByLabel('Коротко о проблеме').fill(feedbackTitle);
  await clientPage
    .getByLabel('Что именно не так и какой результат ожидается')
    .fill('Заголовок переносится на четыре строки.');
  await clientPage.getByRole('button', { name: 'Отправить замечание' }).click();

  await page.reload();
  const card = page.locator('.review-card').filter({ hasText: feedbackTitle });
  for (const status of ['accepted', 'in_progress', 'fixed', 'awaiting_verification']) {
    await card.getByLabel('Следующий статус').selectOption(status);
    await card.getByRole('button', { name: 'Изменить статус' }).click();
  }
  await clientPage.reload();
  const clientCard = clientPage.locator('.review-card').filter({ hasText: feedbackTitle });
  await clientCard.getByLabel('Следующий статус').selectOption('closed');
  await clientCard.getByRole('button', { name: 'Изменить статус' }).click();
  await expect(clientCard.getByText('Закрыто')).toBeVisible();
  const accessibility = await new AxeBuilder({ page: clientPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await clientContext.close();
});
