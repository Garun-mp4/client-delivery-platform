import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('shows the product entry page', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Откройте проект и сразу увидьте следующий шаг' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Войти в рабочее пространство' })).toBeVisible();
  await expect(page).toHaveTitle('Garun Workspace');
});

test('login offers one clear method at a time', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('tabpanel')).toContainText('Для владельца');
  await expect(page.getByLabel('Пароль')).toBeVisible();
  await page.getByRole('tab', { name: 'Ссылка на почту' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('одноразовую ссылку');
  await expect(page.getByLabel('Пароль')).toHaveCount(0);
});

test('login page has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('offers only a fixed webmail shortcut for a recognized provider', async ({ page }) => {
  await page.goto('/login/sent?provider=gmail');
  const shortcut = page.getByRole('link', { name: 'Открыть Gmail' });
  await expect(shortcut).toHaveAttribute('href', 'https://mail.google.com/');
  await expect(shortcut).toHaveAttribute('target', '_blank');

  await page.goto('/login/sent?provider=https://evil.example');
  await expect(page.getByText(/^Открыть /)).toHaveCount(0);
});

test('foundation page has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('uses a nonce-based production content security policy', async ({ page }) => {
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'];

  expect(policy).toBeTruthy();
  expect(policy).not.toContain("'unsafe-inline'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9-]+' 'strict-dynamic'/);

  const scriptNonces = await page
    .locator('script[nonce]')
    .evaluateAll((scripts) => scripts.map((script) => script.getAttribute('nonce')));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(scriptNonces).size).toBe(1);
});

test('liveness exposes no secrets and returns a correlation id', async ({ request }) => {
  const response = await request.get('/api/health/live', {
    headers: { 'x-request-id': 'playwright-request' },
  });

  expect(response.ok()).toBe(true);
  expect(response.headers()['x-request-id']).toBe('playwright-request');
  expect(await response.json()).toEqual({
    requestId: 'playwright-request',
    service: 'web',
    status: 'ok',
  });
});
