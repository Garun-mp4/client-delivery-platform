import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import {
  createAction,
  createScopeRevision,
  createStage,
  decideScopeRevision,
  getProjectWorkflow,
  listWorkspaceWorkflowOverview,
  submitScopeRevision,
  transitionAction,
  transitionStage,
} from '@garun/core/workflow';
import { createDatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientCompany,
  clientMembership,
  outboxEvent,
  project,
  projectMembership,
  projectScopeRevision,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
let workspaceAId = '';
let workspaceBId = '';
let projectAId = '';
let ownerA: TenantContext;
let ownerB: TenantContext;
let clientA: TenantContext;
let intruder: TenantContext;
let ownerAId = '';
let clientAId = '';

const scopeInput = {
  summary: 'Сайт и личный кабинет',
  goals: ['Запуск продаж'],
  audience: ['Корпоративные клиенты'],
  pages: ['Главная', 'Каталог'],
  features: ['Форма заявки'],
  integrations: [],
  deliverables: ['Адаптивный сайт'],
  responsibilities: ['Клиент передаёт материалы'],
  revisionLimits: ['Две итерации'],
  exclusions: ['CRM'],
  assumptions: ['Контент готов'],
  acceptanceCriteria: ['Страницы открываются без ошибок'],
  contractUrl: null,
  proposalUrl: null,
  plannedStartDate: '2026-08-01',
  plannedEndDate: '2026-09-01',
  costMinor: 100_000_00,
  currency: 'RUB',
} as const;

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Owner A', email: `workflow-owner-a-${suffix}@example.test`, emailVerified: true },
      { name: 'Owner B', email: `workflow-owner-b-${suffix}@example.test`, emailVerified: true },
      { name: 'Client A', email: `workflow-client-a-${suffix}@example.test`, emailVerified: true },
      { name: 'Intruder', email: `workflow-intruder-${suffix}@example.test`, emailVerified: true },
    ])
    .returning({ id: user.id, name: user.name });
  ownerAId = identities.find((item) => item.name === 'Owner A')!.id;
  const ownerBId = identities.find((item) => item.name === 'Owner B')!.id;
  clientAId = identities.find((item) => item.name === 'Client A')!.id;
  const intruderId = identities.find((item) => item.name === 'Intruder')!.id;
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Workflow A', slug: `workflow-a-${suffix}`, ownerId: ownerAId },
      { name: 'Workflow B', slug: `workflow-b-${suffix}`, ownerId: ownerBId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  workspaceAId = spaces.find((item) => item.slug.startsWith('workflow-a'))!.id;
  workspaceBId = spaces.find((item) => item.slug.startsWith('workflow-b'))!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerAId, role: 'owner' },
    { workspaceId: workspaceAId, userId: clientAId, role: 'member' },
    { workspaceId: workspaceBId, userId: ownerBId, role: 'owner' },
    { workspaceId: workspaceBId, userId: intruderId, role: 'member' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId: workspaceAId, name: 'Client Company A' })
    .returning({ id: clientCompany.id });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      name: 'Workflow Project',
      slug: `workflow-project-${suffix}`,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerAId,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-09-01',
    })
    .returning({ id: project.id });
  projectAId = createdProject!.id;
  await client.db.insert(clientMembership).values({
    workspaceId: workspaceAId,
    clientCompanyId: company!.id,
    userId: clientAId,
    role: 'primary',
    canApprove: true,
  });
  await client.db.insert(projectMembership).values([
    {
      workspaceId: workspaceAId,
      projectId: projectAId,
      userId: ownerAId,
      side: 'internal',
      role: 'owner',
    },
    {
      workspaceId: workspaceAId,
      projectId: projectAId,
      userId: clientAId,
      side: 'client',
      role: 'client',
    },
  ]);
  const [resolvedOwnerA, resolvedOwnerB, resolvedClientA, resolvedIntruder] = await Promise.all([
    resolveTenantContext(client.db, ownerAId, `workflow-a-${suffix}`),
    resolveTenantContext(client.db, ownerBId, `workflow-b-${suffix}`),
    resolveTenantContext(client.db, clientAId, `workflow-a-${suffix}`),
    resolveTenantContext(client.db, intruderId, `workflow-b-${suffix}`),
  ]);
  if (!resolvedOwnerA || !resolvedOwnerB || !resolvedClientA || !resolvedIntruder) {
    throw new Error('workflow tenant setup failed');
  }
  ownerA = resolvedOwnerA;
  ownerB = resolvedOwnerB;
  clientA = resolvedClientA;
  intruder = resolvedIntruder;
});

afterAll(async () => {
  await client.db.delete(workspace).where(inArray(workspace.id, [workspaceAId, workspaceBId]));
  await client.pool.end();
});

describe('milestone 04 workflow', () => {
  it('keeps scope approval explicit, tenant-safe and immutable after agreement', async () => {
    const revision = await createScopeRevision(
      client,
      ownerA,
      `workflow-project-${suffix}`,
      scopeInput,
    );
    await expect(
      submitScopeRevision(client, ownerB, `workflow-project-${suffix}`, revision.id, clientAId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await submitScopeRevision(client, ownerA, `workflow-project-${suffix}`, revision.id, clientAId);
    await expect(
      decideScopeRevision(
        client,
        intruder,
        `workflow-project-${suffix}`,
        revision.id,
        'agreed',
        null,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await decideScopeRevision(
      client,
      clientA,
      `workflow-project-${suffix}`,
      revision.id,
      'agreed',
      null,
    );
    await expect(
      client.db
        .update(projectScopeRevision)
        .set({ summary: 'Подменённый scope' })
        .where(eq(projectScopeRevision.id, revision.id)),
    ).rejects.toThrow();
    const [stored] = await client.db
      .select({ status: projectScopeRevision.status, summary: projectScopeRevision.summary })
      .from(projectScopeRevision)
      .where(eq(projectScopeRevision.id, revision.id));
    expect(stored).toEqual({ status: 'agreed', summary: scopeInput.summary });
  });

  it('updates exact progress and prevents cross-tenant workflow access', async () => {
    const stage = await createStage(client, ownerA, `workflow-project-${suffix}`, {
      name: 'Прототип',
      description: null,
      weight: 5,
      ownerUserId: ownerAId,
      clientVisible: true,
      isRequired: true,
      countsTowardProgress: true,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-10',
      acceptanceCriteria: 'Согласован сценарий',
    });
    await transitionStage(
      client,
      ownerA,
      `workflow-project-${suffix}`,
      stage.id,
      'in_progress',
      {},
    );
    await transitionStage(
      client,
      ownerA,
      `workflow-project-${suffix}`,
      stage.id,
      'ready_for_review',
      { resultSummary: 'Прототип опубликован' },
    );
    const workflow = await getProjectWorkflow(client.db, ownerA, `workflow-project-${suffix}`);
    expect(workflow?.project.progressTotalWeight).toBe(5);
    expect(workflow?.project.progressCompletedWeight).toBe(0);
    expect(await getProjectWorkflow(client.db, ownerB, `workflow-project-${suffix}`)).toBeNull();
  });

  it('shows only assigned client actions and authorizes their completion', async () => {
    const action = await createAction(client, ownerA, `workflow-project-${suffix}`, {
      stageId: null,
      title: 'Передать логотип',
      description: 'SVG и PNG',
      type: 'upload_material',
      priority: 'urgent',
      visibility: 'client',
      assigneeUserId: clientAId,
      dueAt: new Date('2026-08-05T23:59:59.999Z'),
      isBlocking: true,
    });
    await expect(
      transitionAction(client, ownerB, `workflow-project-${suffix}`, action.id, 'done'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const clientView = await getProjectWorkflow(client.db, clientA, `workflow-project-${suffix}`);
    expect(clientView?.nextAction?.id).toBe(action.id);
    const overview = await listWorkspaceWorkflowOverview(client.db, ownerA);
    expect(overview.find((item) => item.projectId === projectAId)?.blockingAction?.id).toBe(
      action.id,
    );
    expect(await listWorkspaceWorkflowOverview(client.db, clientA)).toEqual([]);
    await transitionAction(client, clientA, `workflow-project-${suffix}`, action.id, 'done');
    const [event] = await client.db
      .select({ action: auditEvent.action })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.workspaceId, workspaceAId),
          eq(auditEvent.entityId, action.id),
          eq(auditEvent.action, 'action_item.status_changed'),
        ),
      );
    const [domainOutbox] = await client.db
      .select({ template: outboxEvent.payload })
      .from(outboxEvent)
      .where(
        and(eq(outboxEvent.workspaceId, workspaceAId), eq(outboxEvent.aggregateId, action.id)),
      );
    expect(event?.action).toBe('action_item.status_changed');
    expect(domainOutbox?.template.template).toBe('domain-event');
  });
});
