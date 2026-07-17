import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import {
  autosaveQuestionnaireDraft,
  commentOnQuestionnaireAnswer,
  createQuestionnaire,
  getQuestionnaire,
  listQuestionnaires,
  reviewQuestionnaireSubmission,
  submitQuestionnaire,
  type QuestionnaireSchema,
} from '@garun/core/questionnaires';
import { createDatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientCompany,
  clientMembership,
  outboxEvent,
  project,
  projectMembership,
  questionnaireSubmission,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
const workspaceSlug = `questionnaires-${suffix}`;
const projectSlug = `questionnaire-project-${suffix}`;
let workspaceId = '';
let otherWorkspaceId = '';
let projectId = '';
let ownerId = '';
let clientId = '';
let owner: TenantContext;
let assignedClient: TenantContext;
let otherOwner: TenantContext;

const schema: QuestionnaireSchema = {
  version: 1,
  sections: [
    {
      id: 'brief',
      title: 'Бриф',
      fields: [
        { id: 'company_name', type: 'short_text', label: 'Компания', required: true },
        {
          id: 'services',
          type: 'repeating_group',
          label: 'Услуги',
          required: true,
          fields: [{ id: 'name', type: 'short_text', label: 'Название', required: true }],
        },
      ],
    },
  ],
};

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Questionnaire Owner', email: `q-owner-${suffix}@example.test`, emailVerified: true },
      {
        name: 'Questionnaire Client',
        email: `q-client-${suffix}@example.test`,
        emailVerified: true,
      },
      { name: 'Other Owner', email: `q-other-${suffix}@example.test`, emailVerified: true },
    ])
    .returning({ id: user.id, name: user.name });
  ownerId = identities.find((item) => item.name === 'Questionnaire Owner')!.id;
  clientId = identities.find((item) => item.name === 'Questionnaire Client')!.id;
  const otherOwnerId = identities.find((item) => item.name === 'Other Owner')!.id;
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Questionnaire Workspace', slug: workspaceSlug, ownerId },
      { name: 'Other Questionnaire Workspace', slug: `q-other-${suffix}`, ownerId: otherOwnerId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  workspaceId = spaces.find((item) => item.slug === workspaceSlug)!.id;
  otherWorkspaceId = spaces.find((item) => item.slug !== workspaceSlug)!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId, userId: ownerId, role: 'owner' },
    { workspaceId, userId: clientId, role: 'member' },
    { workspaceId: otherWorkspaceId, userId: otherOwnerId, role: 'owner' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId, name: 'Questionnaire Client Company' })
    .returning({ id: clientCompany.id });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId,
      clientCompanyId: company!.id,
      name: 'Questionnaire Project',
      slug: projectSlug,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerId,
      plannedStartDate: '2026-09-01',
      plannedEndDate: '2026-10-01',
    })
    .returning({ id: project.id });
  projectId = createdProject!.id;
  await client.db.insert(clientMembership).values({
    workspaceId,
    clientCompanyId: company!.id,
    userId: clientId,
    role: 'primary',
  });
  await client.db.insert(projectMembership).values([
    {
      workspaceId,
      projectId,
      userId: ownerId,
      side: 'internal',
      role: 'owner',
    },
    {
      workspaceId,
      projectId,
      userId: clientId,
      side: 'client',
      role: 'client',
    },
  ]);
  const contexts = await Promise.all([
    resolveTenantContext(client.db, ownerId, workspaceSlug),
    resolveTenantContext(client.db, clientId, workspaceSlug),
    resolveTenantContext(client.db, otherOwnerId, `q-other-${suffix}`),
  ]);
  if (!contexts[0] || !contexts[1] || !contexts[2]) throw new Error('tenant setup failed');
  [owner, assignedClient, otherOwner] = contexts;
});

afterAll(async () => {
  await client.db.delete(workspace).where(inArray(workspace.id, [workspaceId, otherWorkspaceId]));
  await client.pool.end();
});

describe('milestone 05 questionnaires', () => {
  it('persists optimistic drafts and rejects stale or cross-tenant writes', async () => {
    const created = await createQuestionnaire(client, owner, projectSlug, {
      title: 'Бриф на сайт',
      description: 'Заполните основные сведения',
      assignedToUserId: clientId,
      dueAt: new Date('2026-09-15T23:59:59.999Z'),
      schema,
    });
    await expect(
      createQuestionnaire(client, otherOwner, projectSlug, {
        title: 'Чужая анкета',
        description: null,
        assignedToUserId: clientId,
        dueAt: null,
        schema,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await listQuestionnaires(client.db, otherOwner, projectSlug)).toBeNull();

    const first = await autosaveQuestionnaireDraft(
      client,
      assignedClient,
      projectSlug,
      created.id,
      {
        answers: { company_name: 'Гарун' },
        version: 1,
        idempotencyKey: 'questionnaire-save-one',
      },
    );
    expect(first.version).toBe(2);
    const repeated = await autosaveQuestionnaireDraft(
      client,
      assignedClient,
      projectSlug,
      created.id,
      {
        answers: { company_name: 'Подмена при retry' },
        version: 1,
        idempotencyKey: 'questionnaire-save-one',
      },
    );
    expect(repeated.version).toBe(2);
    await expect(
      autosaveQuestionnaireDraft(client, assignedClient, projectSlug, created.id, {
        answers: { company_name: 'Устаревшая вкладка' },
        version: 1,
        idempotencyKey: 'questionnaire-stale-tab',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', currentVersion: 2 });
    const persisted = await getQuestionnaire(client.db, assignedClient, projectSlug, created.id);
    expect(persisted?.draft?.answers).toEqual({ company_name: 'Гарун' });
  });

  it('creates immutable revisions through clarification and acceptance', async () => {
    const created = await createQuestionnaire(client, owner, projectSlug, {
      title: 'Сведения об услугах',
      description: null,
      assignedToUserId: clientId,
      dueAt: null,
      schema,
    });
    await autosaveQuestionnaireDraft(client, assignedClient, projectSlug, created.id, {
      answers: { company_name: 'Гарун' },
      version: 1,
      idempotencyKey: 'questionnaire-incomplete',
    });
    await expect(
      submitQuestionnaire(client, assignedClient, projectSlug, created.id, 2),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { services: 'Добавьте хотя бы одну запись.' },
    });
    const complete = await autosaveQuestionnaireDraft(
      client,
      assignedClient,
      projectSlug,
      created.id,
      {
        answers: { company_name: 'Гарун', services: [{ name: 'Разработка' }] },
        version: 2,
        idempotencyKey: 'questionnaire-complete',
      },
    );
    const first = await submitQuestionnaire(
      client,
      assignedClient,
      projectSlug,
      created.id,
      complete.version,
    );
    await expect(
      client.db
        .update(questionnaireSubmission)
        .set({ answers: { company_name: 'Незаметная подмена' } })
        .where(eq(questionnaireSubmission.id, first.id)),
    ).rejects.toThrow();
    const [immutable] = await client.db
      .select({ answers: questionnaireSubmission.answers })
      .from(questionnaireSubmission)
      .where(eq(questionnaireSubmission.id, first.id));
    expect(immutable?.answers).toEqual({
      company_name: 'Гарун',
      services: [{ name: 'Разработка' }],
    });
    await commentOnQuestionnaireAnswer(
      client,
      owner,
      projectSlug,
      created.id,
      first.id,
      'company_name',
      'Уточните полное название',
    );
    await reviewQuestionnaireSubmission(
      client,
      owner,
      projectSlug,
      created.id,
      first.id,
      'clarification_requested',
      'Нужно полное юридическое название.',
    );
    const corrected = await autosaveQuestionnaireDraft(
      client,
      assignedClient,
      projectSlug,
      created.id,
      {
        answers: { company_name: 'ООО «Гарун»', services: [{ name: 'Разработка' }] },
        version: complete.version,
        idempotencyKey: 'questionnaire-corrected',
      },
    );
    const second = await submitQuestionnaire(
      client,
      assignedClient,
      projectSlug,
      created.id,
      corrected.version,
    );
    expect(second.revision).toBe(2);
    await reviewQuestionnaireSubmission(
      client,
      owner,
      projectSlug,
      created.id,
      second.id,
      'accepted',
      null,
    );
    const stored = await getQuestionnaire(client.db, owner, projectSlug, created.id);
    expect(stored?.questionnaire.status).toBe('completed');
    expect(stored?.submissions.map((item) => item.revision)).toEqual([2, 1]);
    expect(stored?.comments[0]?.body).toBe('Уточните полное название');
    const [audit, outbox] = await Promise.all([
      client.db
        .select({ action: auditEvent.action })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.workspaceId, workspaceId),
            eq(auditEvent.action, 'questionnaire.accepted'),
          ),
        ),
      client.db
        .select({ eventType: outboxEvent.eventType, payload: outboxEvent.payload })
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.workspaceId, workspaceId),
            eq(outboxEvent.eventType, 'questionnaire.accepted'),
          ),
        ),
    ]);
    expect(audit).toHaveLength(1);
    expect(outbox[0]?.payload).not.toHaveProperty('answers');
  });
});
