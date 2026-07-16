import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('shows the product entry page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Garun Workspace' })).toBeVisible();
  await expect(page.getByText('Инженерная основа запущена')).toBeVisible();
  await expect(page).toHaveTitle('Garun Workspace');
});

test('login page has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/login');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
