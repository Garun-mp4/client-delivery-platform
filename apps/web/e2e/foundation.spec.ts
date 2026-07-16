import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('shows only the foundation status page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Garun Workspace' })).toBeVisible();
  await expect(page.getByText('Инженерная основа запущена')).toBeVisible();
  await expect(page).toHaveTitle('Garun Workspace');
});

test('foundation page has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
