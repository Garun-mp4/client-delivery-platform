import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('owner creates and downloads a private project history export', async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const companyName = `Export client ${suffix}`;
  const projectName = `Export project ${suffix}`;
  const projectSlug = `export-project-${suffix}`;

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
  await page.goto('/workspace/e2e-studio/projects/new');
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-09-01');
  await page.getByLabel('Плановое завершение').fill('2026-10-01');
  await page.getByLabel('Описание').fill('История проекта для безопасного экспорта.');
  await page.getByRole('button', { name: 'Создать черновик' }).click();

  await page.getByRole('link', { name: 'Экспорт' }).click();
  await expect(page.getByRole('heading', { name: 'Экспорт для передачи' })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Создать экспорт' }).click();
  await expect(page.getByText('Экспорт поставлен в очередь.')).toBeVisible();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('link', { name: /Скачать/ }).count();
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  const href = await page.getByRole('link', { name: /Скачать/ }).getAttribute('href');
  expect(href).toBeTruthy();
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/gzip');
  expect((await response.body()).byteLength).toBeGreaterThan(100);
});
