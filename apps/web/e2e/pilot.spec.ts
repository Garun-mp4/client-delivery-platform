import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';

const mailpit = process.env.TEST_MAILPIT_URL ?? 'http://127.0.0.1:8025';

async function latestMailLink(request: APIRequestContext, recipient: string) {
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
  if (!link) throw new Error('Pilot invitation link was not found');
  return link;
}

test('local pilot completes the MVP path in one tenant-scoped project', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const publicSiteUrl = process.env.PILOT_PUBLIC_SITE_URL;
  if (!publicSiteUrl) throw new Error('PILOT_PUBLIC_SITE_URL is required for the pilot rehearsal');

  const suffix = `${Date.now()}-${test.info().workerIndex}`;
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.test';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'E2eOwnerPassword-2026!';
  const clientEmail = `pilot-client-${suffix}@example.test`;
  const companyName = `Пилотный клиент ${suffix}`;
  const projectName = `Пилотный проект ${suffix}`;
  const projectSlug = `pilot-${suffix}`;
  const questionnaireTitle = `Пилотный бриф ${suffix}`;
  const materialTitle = `Материалы пилота ${suffix}`;
  const versionName = `Пилотная версия ${suffix}`;
  const feedbackTitle = `Пилотное замечание ${suffix}`;

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
  await page.getByRole('button', { name: 'Создать клиента' }).click();
  await page.goto('/workspace/e2e-studio/projects/new');
  await page.getByLabel('Название проекта').fill(projectName);
  await page.getByLabel('Адрес проекта').fill(projectSlug);
  await page.getByLabel('Компания клиента').selectOption({ label: companyName });
  await page.getByLabel('Плановое начало').fill('2026-08-01');
  await page.getByLabel('Плановое завершение').fill('2026-12-01');
  await page.getByLabel('Описание').fill('Вымышленный проект для локального MVP rehearsal.');
  await page.getByRole('button', { name: 'Создать черновик' }).click();
  await page.getByLabel('Показывать приглашённым клиентам').check();
  await page.getByRole('button', { name: 'Опубликовать проект' }).click();
  await page.locator('summary').filter({ hasText: 'Пригласить представителя клиента' }).click();
  await page.getByLabel('Email клиента').fill(clientEmail);
  await page.getByLabel('Может согласовывать границы проекта').check();
  await page.getByRole('button', { name: 'Отправить приглашение' }).click();

  const invitationLink = await latestMailLink(request, clientEmail);
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto(
    invitationLink.replace('http://localhost:3000', test.info().project.use.baseURL as string),
  );
  await clientPage.getByRole('button', { name: 'Принять приглашение' }).click();
  await expect(clientPage).toHaveURL(new RegExp(`/projects/${projectSlug}`));

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/workflow`);
  await page.getByLabel('Краткое описание').fill('Публичный сайт для вымышленной компании');
  await page.getByLabel(/Цели —/).fill('Проверить полный MVP-путь');
  await page.getByLabel(/Страницы —/).fill('Главная');
  await page.getByLabel(/Результаты —/).fill('Рабочий адаптивный сайт');
  await page.getByLabel(/Критерии приёмки —/).fill('Все обязательные шаги пройдены');
  await page.getByRole('button', { name: 'Создать версию scope' }).click();
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();
  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/workflow`);
  await clientPage
    .getByLabel('Я ознакомился(лась) с этой версией границ проекта и подтверждаю своё решение')
    .check();
  await clientPage.getByRole('button', { name: 'Согласовать версию' }).click();

  await page.reload();
  await page.getByLabel('Название этапа').fill('Реализация');
  await page.getByLabel('Вес прогресса').fill('10');
  await page.getByLabel('Начало', { exact: true }).fill('2026-08-01');
  await page.getByLabel('Завершение', { exact: true }).fill('2026-11-20');
  await page.getByRole('button', { name: 'Добавить этап' }).click();
  let stageCard = page.locator('.compact-list li').filter({ hasText: 'Реализация' });
  await stageCard.getByLabel('Новый статус этапа Реализация').selectOption('in_progress');
  await stageCard.getByRole('button', { name: 'Обновить' }).click();
  await page.getByLabel('Название действия').fill('Подтвердить обязательное действие');
  await page.getByLabel('Исполнитель').selectOption({ index: 1 });
  await page.getByLabel('Видимость').selectOption('client');
  await page.getByLabel('Срок').fill('2026-11-01');
  await page.getByLabel('Блокирует дальнейший ход проекта').check();
  await page.getByRole('button', { name: 'Создать действие' }).click();
  await clientPage.reload();
  await clientPage.getByRole('button', { name: 'Отметить выполненным' }).click();

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/questionnaires`);
  await page.getByLabel('Название анкеты').fill(questionnaireTitle);
  await page.getByLabel('Заполняет').selectOption({ index: 1 });
  await page.getByLabel('Заголовок раздела').fill('Основная информация');
  const questionnaireField = page.locator('.builder-field').first();
  await questionnaireField.getByLabel('Вопрос или текст блока').fill('Цель сайта');
  await questionnaireField.getByLabel('Обязательный ответ').check();
  await page.getByRole('button', { name: 'Создать и отправить анкету' }).click();
  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/questionnaires`);
  await clientPage.getByRole('link', { name: new RegExp(questionnaireTitle) }).click();
  await clientPage.getByLabel('Цель сайта *').fill('Получать обращения клиентов');
  await expect(clientPage.locator('.autosave-status')).toContainText('Сохранено', {
    timeout: 10_000,
  });
  await clientPage.reload();
  await expect(clientPage.getByLabel('Цель сайта *')).toHaveValue('Получать обращения клиентов');
  await clientPage.getByRole('button', { name: 'Отправить ответы' }).click();
  await expect(clientPage.getByText('Ответы отправлены разработчику')).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Принять ответы' }).click();

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/materials`);
  await page.getByLabel('Название').fill(materialTitle);
  await page.getByLabel('Тип').selectOption('file');
  await page.getByLabel('Категория или раздел сайта').fill('Главная');
  await page.getByLabel('Кто передаёт').selectOption({ index: 0 });
  await page.getByLabel('Срок').fill('2026-11-05');
  await page.getByRole('button', { name: 'Создать запрос' }).click();
  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/materials`);
  const filename = `pilot-${suffix}.txt`;
  await clientPage.getByLabel('Файлы').setInputFiles({
    name: filename,
    mimeType: 'text/plain',
    buffer: Buffer.from('Безопасный вымышленный материал локального пилота.'),
  });
  await clientPage.getByRole('button', { name: 'Загрузить материалы' }).click();
  await expect(clientPage.getByText('Файлы загружены и проверяются')).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(
      async () => {
        await clientPage.reload();
        return clientPage.getByRole('link', { name: filename }).count();
      },
      { timeout: 45_000 },
    )
    .toBe(1);
  await page.reload();
  await page.getByLabel('Отметить принятую редакцию финальной').check();
  await page.getByRole('button', { name: 'Принять' }).click();

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/review`);
  await page.locator('summary').filter({ hasText: 'Добавить версию' }).click();
  await page.getByLabel('Название версии').fill(versionName);
  await page.getByLabel('Безопасный URL').fill(publicSiteUrl);
  await page.getByLabel('Список изменений').fill('Подготовлена версия локального пилота.');
  await page.getByLabel('Что именно проверить').fill('Проверить первый экран и текст.');
  await page.getByRole('button', { name: 'Добавить и проверить' }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText('Готова к публикации').count();
      },
      { timeout: 45_000 },
    )
    .toBe(1);
  await page.getByRole('button', { name: 'Показать клиенту' }).click();
  await expect(page.getByText('Показана клиенту')).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/workspaces/e2e-studio/projects/${projectSlug}/cover/capture`,
        );
        const body = (await response.json()) as { capture?: { status?: string } };
        return body.capture?.status;
      },
      { timeout: 75_000 },
    )
    .toBe('succeeded');
  expect(
    (await page.request.get(`/api/workspaces/e2e-studio/projects/${projectSlug}/cover`)).status(),
  ).toBe(200);

  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/review`);
  await clientPage.locator('summary').filter({ hasText: 'Оставить замечание' }).click();
  await clientPage.getByLabel('Коротко о проблеме').fill(feedbackTitle);
  await clientPage
    .getByLabel('Что именно не так и какой результат ожидается')
    .fill('Нужно проверить формулировку заголовка.');
  await clientPage.getByRole('button', { name: 'Отправить замечание' }).click();
  await page.reload();
  const feedbackCard = page.locator('.review-card').filter({ hasText: feedbackTitle });
  for (const status of ['accepted', 'in_progress', 'fixed', 'awaiting_verification']) {
    await feedbackCard.getByLabel('Следующий статус').selectOption(status);
    await feedbackCard.getByRole('button', { name: 'Изменить статус' }).click();
  }
  await clientPage.reload();
  const clientFeedback = clientPage.locator('.review-card').filter({ hasText: feedbackTitle });
  await clientFeedback.getByLabel('Следующий статус').selectOption('closed');
  await clientFeedback.getByRole('button', { name: 'Изменить статус' }).click();

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/workflow`);
  stageCard = page.locator('.compact-list li').filter({ hasText: 'Реализация' });
  await stageCard.getByLabel('Новый статус этапа Реализация').selectOption('ready_for_review');
  await stageCard.getByPlaceholder('Результат для проверки').fill('Пилотный результат готов');
  await stageCard.getByRole('button', { name: 'Обновить' }).click();
  await page.getByRole('link', { name: 'Согласования' }).click();
  await page.getByLabel('Что согласовываем').selectOption({ label: 'Этап · Реализация' });
  await page.getByRole('group', { name: 'Назначенные согласующие' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();
  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}/approvals`);
  await clientPage.getByLabel(/Я прочитал/).check();
  await clientPage.getByRole('button', { name: 'Согласовать', exact: true }).click();

  await page.reload();
  await page.getByLabel('Что согласовываем').selectOption({ label: 'Финальная передача проекта' });
  await page.getByRole('group', { name: 'Назначенные согласующие' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Отправить на согласование' }).click();
  await clientPage.reload();
  const pendingFinal = clientPage
    .locator('.approval-card')
    .filter({ hasText: 'Финальная передача' });
  await pendingFinal.getByLabel(/Я прочитал/).check();
  await pendingFinal.getByRole('button', { name: 'Согласовать', exact: true }).click();

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/export`);
  await page.getByRole('button', { name: 'Создать экспорт' }).click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByRole('link', { name: /Скачать/ }).count();
      },
      { timeout: 40_000 },
    )
    .toBe(1);

  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}/completion`);
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: 'Отметить выполненным' }).first().click();
  }
  await expect(page.getByRole('heading', { name: 'Всё готово к завершению' })).toBeVisible();
  await page.getByLabel('Подтверждаю выполнение условий завершения').check();
  await page.getByRole('button', { name: 'Завершить проект' }).click();
  await page.goto('/workspace/e2e-studio/notifications');
  await expect(page.getByRole('heading', { name: 'Уведомления' })).toBeVisible();
  await page.goto(`/workspace/e2e-studio/projects/${projectSlug}`);
  await page.locator('summary').filter({ hasText: 'Архивировать проект' }).click();
  await page.getByLabel('Подтверждаю перевод в read-only архив').check();
  await page.getByRole('button', { name: 'Архивировать проект' }).click();
  await page.locator('summary').filter({ hasText: 'Восстановить проект' }).click();
  await page.getByRole('button', { name: 'Восстановить прежний статус' }).click();

  await clientPage.setViewportSize({ width: 390, height: 844 });
  await clientPage.goto(`/workspace/e2e-studio/projects/${projectSlug}`);
  const accessibility = await new AxeBuilder({ page: clientPage }).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator('summary').filter({ hasText: 'Участники проекта' }).click();
  await page.getByLabel('Подтверждаю отзыв доступа').check();
  await page.getByRole('button', { name: 'Удалить из проекта' }).click();
  await clientPage.reload();
  await expect(clientPage.getByRole('heading', { name: projectName })).toHaveCount(0);
  await clientContext.close();
});
