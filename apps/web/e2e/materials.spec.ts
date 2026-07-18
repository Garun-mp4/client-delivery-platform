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

test('client uploads a quarantined material that becomes available and is accepted', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${test.info().workerIndex}-${test.info().project.name}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const clientEmail = `e2e-material-${suffix}@example.test`;
  const companyName = `Материалы клиент ${suffix}`;
  const projectName = `Материалы проект ${suffix}`;
  const projectSlug =
    `materials-${Date.now()}-${test.info().workerIndex}-${test.info().project.name}`.toLowerCase();
  const materialTitle = `Текст для сайта ${suffix}`;
  const filename = `content-${suffix}.txt`;

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(ownerEmail);
  await page.getByLabel('Пароль').fill(ownerPassword);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/workspace\/e2e-studio/);

  await page.goto('/workspace/e2e-studio/clients');
  await page.getByText('Создать компанию', { exact: true }).click();
  await page.getByLabel('Название компании').fill(companyName);
  await page.getByRole('button', { name: 'Создать клиента' }).click();
  await page.goto('/workspace/e2e-studio/projects');
  await page.getByText('Создать черновик', { exact: true }).click();
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-11-01');
  await page.getByLabel('Плановое завершение').fill('2026-12-01');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByLabel('Показывать приглашённым клиентам').check();
  await page.getByRole('button', { name: 'Опубликовать проект' }).click();
  await page.getByText('Пригласить представителя клиента', { exact: true }).click();
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

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/materials`);
  await page.getByLabel('Название').fill(materialTitle);
  await page.getByLabel('Тип').selectOption('file');
  await page.getByLabel('Категория или раздел сайта').fill('Главная');
  await page.getByLabel('Кто передаёт').selectOption({ index: 0 });
  await page.getByLabel('Срок').fill('2026-11-10');
  await page.getByRole('button', { name: 'Создать запрос' }).click();
  await expect(page.getByRole('heading', { name: materialTitle })).toBeVisible();

  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/materials`);
  await clientPage.getByLabel('Файлы').setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('Безопасный текстовый материал для сайта.'),
  });
  const objectUpload = clientPage.waitForRequest(
    (request) => request.method() === 'PUT' && new URL(request.url()).port === '9000',
  );
  await clientPage.getByRole('button', { name: 'Загрузить материалы' }).click();
  const objectUploadRequest = await objectUpload;
  const objectUploadResponse = await objectUploadRequest.response();
  expect(
    objectUploadResponse,
    objectUploadRequest.failure()?.errorText ?? 'Object storage returned no response',
  ).not.toBeNull();
  expect(
    objectUploadResponse!.status(),
    `${await objectUploadResponse!.text().catch(() => 'Object storage returned no response body')} Signed headers: ${new URL(objectUploadRequest.url()).searchParams.get('X-Amz-SignedHeaders') ?? 'missing'}. Request headers: ${Object.keys(await objectUploadRequest.allHeaders()).join(', ')}`,
  ).toBeLessThan(300);
  await expect(clientPage.getByText('Файлы загружены и проверяются')).toBeVisible({
    timeout: 20_000,
  });
  await expect(clientPage.getByText(/Файл в карантине/)).toHaveCount(0);
  await expect
    .poll(
      async () => {
        await clientPage.reload();
        return clientPage.getByRole('link', { name: filename }).count();
      },
      { timeout: 40_000 },
    )
    .toBe(1);

  const download = clientPage.waitForEvent('download');
  await clientPage.getByRole('link', { name: filename }).click();
  expect((await download).suggestedFilename()).toBe(filename);

  await page.reload();
  await expect(page.getByRole('link', { name: filename })).toBeVisible();
  await page.getByLabel('Отметить принятую редакцию финальной').check();
  await page.getByRole('button', { name: 'Принять' }).click();
  await expect(page.getByText('Операция выполнена.')).toBeVisible();
  await expect(page.getByText('Принято')).toBeVisible();

  const forgedFile = await clientPage.request.get(
    `/api/workspaces/e2e-studio/projects/${projectSlug}/files/${crypto.randomUUID()}`,
  );
  expect(forgedFile.status()).toBe(404);
  const forbiddenRequest = await clientPage.request.post(
    `/api/workspaces/e2e-studio/projects/${projectSlug}/materials`,
    {
      form: {
        title: 'Недоступный запрос',
        type: 'file',
        requestedFromUserId: crypto.randomUUID(),
        dueDate: '2026-11-10',
      },
      headers: { origin: test.info().project.use.baseURL as string },
      maxRedirects: 0,
    },
  );
  expect(forbiddenRequest.status()).toBe(303);
  expect(forbiddenRequest.headers().location).toContain('error=request');

  await clientPage.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page: clientPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await clientContext.close();
});
