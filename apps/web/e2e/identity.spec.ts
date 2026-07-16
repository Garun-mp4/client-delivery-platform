import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';

const mailpit = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';

async function latestLink(request: APIRequestContext, recipient: string, afterId?: string) {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${mailpit}/api/v1/messages`);
        const body = (await response.json()) as {
          messages?: Array<{ ID: string; To?: Array<{ Address: string }> }>;
        };
        return (
          body.messages?.find(
            (message) =>
              message.ID !== afterId && message.To?.some((to) => to.Address === recipient),
          )?.ID ?? ''
        );
      },
      { timeout: 15_000 },
    )
    .not.toBe('');
  const list = await request.get(`${mailpit}/api/v1/messages`);
  const body = (await list.json()) as {
    messages: Array<{ ID: string; To?: Array<{ Address: string }> }>;
  };
  const id = body.messages.find(
    (message) => message.ID !== afterId && message.To?.some((to) => to.Address === recipient),
  )?.ID;
  if (!id) throw new Error('Mailpit message not found');
  const message = await request.get(`${mailpit}/api/v1/message/${id}`);
  const details = (await message.json()) as { Text: string };
  const link = details.Text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error('Mail link not found');
  return { id, link };
}

test('owner invites a member and tenant policies deny owner actions to the member', async ({
  browser,
  page,
  request,
}) => {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const memberEmail = `e2e-member-${Date.now()}@example.test`;
  await page.goto('/login');
  await page.getByLabel('Рабочий email').fill(ownerEmail);
  const [requestLinkResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/auth/request-link')),
    page.getByRole('button', { name: 'Получить ссылку для входа' }).click(),
  ]);
  expect(requestLinkResponse.status()).toBe(303);
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible();
  const ownerMail = await latestLink(request, ownerEmail);
  await page.goto(
    ownerMail.link.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await expect(page).toHaveURL(/\/workspace\/e2e-studio/);
  await page.getByLabel('Email участника').fill(memberEmail);
  await page.getByRole('button', { name: 'Отправить приглашение' }).click();
  await expect(page.getByText(memberEmail)).toBeVisible();
  const invitationMail = await latestLink(request, memberEmail);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(
    invitationMail.link.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await memberPage.getByRole('button', { name: 'Принять приглашение' }).click();
  await expect(memberPage).toHaveURL(/\/workspace\/e2e-studio/);
  await expect(memberPage.getByRole('heading', { name: 'Пригласить участника' })).toHaveCount(0);
  const directOwnerAction = await memberPage.request.post(
    '/api/workspaces/e2e-studio/invitations',
    {
      form: { email: 'blocked@example.test' },
      headers: { origin: test.info().project.use.baseURL as string },
    },
  );
  expect(directOwnerAction.status()).toBe(404);
  await expect(memberPage.getByRole('heading', { name: 'Ваши активные сессии' })).toBeVisible();
  const accessibility = await new AxeBuilder({ page: memberPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await memberPage.getByRole('button', { name: 'Выйти' }).click();
  await memberPage.goto('/workspace/e2e-studio');
  await expect(memberPage).toHaveURL(/\/login/);
  await memberContext.close();
});
