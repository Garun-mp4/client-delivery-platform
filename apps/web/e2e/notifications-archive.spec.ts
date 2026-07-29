import AxeBuilder from '@axe-core/playwright';
import { eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';

import { createDatabaseClient } from '@garun/db';
import {
  approvalRequest,
  clientCompany,
  notificationDelivery,
  notificationEvent,
  project,
  projectStage,
  user,
  workspace,
} from '@garun/db/schema';

test('notification deep link leads through completion, archive and restore', async ({ page }) => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const database = createDatabaseClient(databaseUrl);
  const suffix = `${Date.now()}-${test.info().workerIndex}-${test.info().project.name}`;
  const projectSlug = `notification-archive-${suffix}`;
  let companyId = '';
  let projectId = '';
  try {
    const [owner] = await database.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test'));
    const [space] = await database.db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.slug, 'e2e-studio'));
    if (!owner || !space) throw new Error('E2E owner workspace is missing');
    const [company] = await database.db
      .insert(clientCompany)
      .values({ workspaceId: space.id, name: `Completion client ${suffix}` })
      .returning({ id: clientCompany.id });
    companyId = company!.id;
    const [createdProject] = await database.db
      .insert(project)
      .values({
        workspaceId: space.id,
        clientCompanyId: companyId,
        name: `Completion project ${suffix}`,
        slug: projectSlug,
        projectType: 'website',
        status: 'in_progress',
        ownerUserId: owner.id,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-08-30',
      })
      .returning({ id: project.id });
    projectId = createdProject!.id;
    await database.db.insert(projectStage).values({
      workspaceId: space.id,
      projectId,
      name: 'Готовый этап',
      orderIndex: 0,
      weight: 1,
      status: 'approved',
      ownerUserId: owner.id,
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-07-20',
      resultSummary: 'Результат принят',
    });
    await database.db.insert(approvalRequest).values({
      workspaceId: space.id,
      projectId,
      entityType: 'final_handover',
      targetKey: 'final_handover',
      entityRevision: '1',
      entitySnapshot: {
        title: 'Финальная передача',
        revision: '1',
        capturedAt: new Date().toISOString(),
        details: {},
      },
      snapshotChecksum: 'a'.repeat(64),
      acknowledgementText: 'Демонстрационное подтверждение',
      acknowledgementChecksum: 'b'.repeat(64),
      status: 'approved',
      requestedByUserId: owner.id,
      idempotencyKey: `e2e-completion-${suffix}`,
      resolvedAt: new Date(),
    });
    const [event] = await database.db
      .insert(notificationEvent)
      .values({
        workspaceId: space.id,
        projectId,
        recipientUserId: owner.id,
        eventType: 'project.completed',
        entityType: 'project',
        entityId: projectId,
        dedupeKey: `e2e-notification-${suffix}`,
        deepLinkPath: `/workspace/e2e-studio/projects/${projectSlug}/completion`,
      })
      .returning({ id: notificationEvent.id });
    await database.db.insert(notificationDelivery).values({
      workspaceId: space.id,
      notificationEventId: event!.id,
      channel: 'in_app',
      status: 'delivered',
      deliveredAt: new Date(),
    });

    await page.goto('/login');
    await page
      .getByLabel('Email', { exact: true })
      .fill(process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test');
    await page
      .getByLabel('Пароль')
      .fill(process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.goto('/workspace/e2e-studio/notifications');
    await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible();
    const ownNotification = page
      .getByRole('listitem')
      .filter({ hasText: `Completion project ${suffix}` });
    await expect(ownNotification.getByText('Проект завершён')).toBeVisible();
    await ownNotification.getByRole('link', { name: 'Открыть' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectSlug}/completion$`));
    await expect(page.getByRole('heading', { name: 'Завершение проекта' })).toBeVisible();

    for (let index = 0; index < 4; index += 1) {
      await page.getByRole('button', { name: 'Отметить выполненным' }).first().click();
    }
    await expect(page.getByRole('heading', { name: 'Всё готово к завершению' })).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByLabel('Подтверждаю выполнение условий завершения').check();
    await page.getByRole('button', { name: 'Завершить проект' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectSlug}$`));
    await expect(page.getByText('Завершён', { exact: true }).first()).toBeVisible();

    await page.locator('summary').filter({ hasText: 'Архивировать проект' }).click();
    await page.getByLabel('Подтверждаю перевод в read-only архив').check();
    await page.getByRole('button', { name: 'Архивировать проект' }).click();
    await expect(
      page.getByText('Проект находится в архиве и доступен только для чтения.'),
    ).toBeVisible();
    await expect(page.getByLabel('Название')).toBeDisabled();
    await page.locator('summary').filter({ hasText: 'Восстановить проект' }).click();
    await page.getByRole('button', { name: 'Восстановить прежний статус' }).click();
    await expect(page.getByText('Завершён', { exact: true }).first()).toBeVisible();
  } finally {
    if (projectId) {
      await database.db.delete(approvalRequest).where(eq(approvalRequest.projectId, projectId));
      await database.db.delete(project).where(eq(project.id, projectId));
    }
    if (companyId) {
      await database.db.delete(clientCompany).where(eq(clientCompany.id, companyId));
    }
    await database.pool.end();
  }
});
