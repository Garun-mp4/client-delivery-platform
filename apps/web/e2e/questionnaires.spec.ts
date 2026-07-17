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
  if (!link) throw new Error('Questionnaire invitation link not found');
  return link;
}

test('client resumes autosaved questionnaire and sends a clarified immutable revision', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${test.info().workerIndex}-${test.info().project.name}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const clientEmail = `e2e-questionnaire-${suffix}@example.test`;
  const companyName = `Анкета клиент ${suffix}`;
  const projectName = `Анкета проект ${suffix}`;
  const projectSlug =
    `questionnaire-${Date.now()}-${test.info().workerIndex}-${test.info().project.name}`.toLowerCase();
  const questionnaireTitle = `Бриф ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти с паролем' }).click();
  await expect(page).toHaveURL(/\/workspace\/e2e-studio/);

  await page.goto('/workspace/e2e-studio/clients');
  await page.getByLabel('Название компании').fill(companyName);
  await page.getByRole('button', { name: 'Создать клиента' }).click();
  await page.goto('/workspace/e2e-studio/projects');
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-10-01');
  await page.getByLabel('Плановое завершение').fill('2026-11-01');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByLabel('Показывать приглашённым клиентам').check();
  await page.getByRole('button', { name: 'Опубликовать проект' }).click();
  await page.getByLabel('Email клиента').fill(clientEmail);
  await page.getByRole('button', { name: 'Отправить приглашение' }).click();

  const invitationLink = await latestLink(request, clientEmail);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(
    invitationLink.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await clientPage.getByRole('button', { name: 'Принять приглашение' }).click();
  await expect(clientPage).toHaveURL(new RegExp(`/projects/${projectSlug}`));

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/questionnaires`);
  await page.getByLabel('Название анкеты').fill(questionnaireTitle);
  await page.getByLabel('Заполняет').selectOption({ index: 1 });
  await page.getByLabel('Заголовок раздела').fill('О компании');
  const firstField = page.locator('.builder-field').first();
  await firstField.getByLabel('Вопрос или текст блока').fill('Название компании');
  await firstField.getByLabel('Обязательный ответ').check();
  await page.getByRole('button', { name: 'Добавить поле' }).click();
  const secondField = page.locator('.builder-field').nth(1);
  await secondField.getByLabel('Тип').selectOption('long_text');
  await secondField.getByLabel('Вопрос или текст блока').fill('Главная цель сайта');
  await secondField.getByLabel('Обязательный ответ').check();
  await page.getByRole('button', { name: 'Создать и отправить анкету' }).click();
  await expect(page.getByRole('heading', { name: questionnaireTitle })).toBeVisible();

  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/questionnaires`);
  await clientPage.getByRole('link', { name: new RegExp(questionnaireTitle) }).click();
  await clientPage.getByLabel('Название компании *').fill('Гарун');
  await expect(clientPage.locator('.autosave-status')).toContainText('Сохранено', {
    timeout: 10_000,
  });
  await clientPage.reload();
  await expect(clientPage.getByLabel('Название компании *')).toHaveValue('Гарун');
  await clientPage.getByLabel('Главная цель сайта *').fill('Получать заявки');
  await expect(clientPage.locator('.autosave-status')).toContainText('Сохранено', {
    timeout: 10_000,
  });
  await clientPage.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page: clientPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await clientPage.getByRole('button', { name: 'Отправить ответы' }).click();
  await expect(clientPage.getByText('Ответы отправлены разработчику')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Получать заявки')).toBeVisible();
  await page.getByLabel('Что нужно уточнить').fill('Укажите измеримую цель.');
  await page.getByRole('button', { name: 'Вернуть на уточнение' }).click();
  await expect(page.getByText('Операция выполнена.')).toBeVisible();

  await clientPage.reload();
  await expect(clientPage.getByText('Укажите измеримую цель.')).toBeVisible();
  await clientPage.getByLabel('Главная цель сайта *').fill('Получать 30 заявок в месяц');
  await expect(clientPage.locator('.autosave-status')).toContainText('Сохранено', {
    timeout: 10_000,
  });
  await clientPage.getByRole('button', { name: 'Отправить ответы' }).click();
  await expect(clientPage.getByText('Ответы отправлены разработчику')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Редакция 2')).toBeVisible();
  await expect(page.getByText('Получать 30 заявок в месяц')).toBeVisible();
  await page.getByRole('button', { name: 'Принять ответы' }).click();
  await expect(page.getByText('Операция выполнена.')).toBeVisible();
  await clientPage.reload();
  await expect(clientPage.getByText('Принята', { exact: true })).toBeVisible();

  const idor = await clientPage.request.put(
    `/api/workspaces/e2e-studio/projects/${projectSlug}/questionnaires/${crypto.randomUUID()}/draft`,
    {
      data: { answers: {}, version: 1, idempotencyKey: 'questionnaire-idor-test' },
      headers: { origin: test.info().project.use.baseURL as string },
    },
  );
  expect(idor.status()).toBe(404);
  await clientContext.close();
});
