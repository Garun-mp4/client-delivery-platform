import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  cancelApprovalRequest,
  createApprovalRequest,
  decideApprovalRequest,
  getProjectApprovals,
  listApprovalAudit,
  recordExternalDecision,
} from '@garun/core/approvals';
import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import { createStage, transitionStage } from '@garun/core/workflow';
import { createDatabaseClient } from '@garun/db';
import {
  approvalDecision,
  approvalRequest,
  auditEvent,
  clientCompany,
  clientMembership,
  feedbackItem,
  outboxEvent,
  project,
  projectMembership,
  projectStage,
  siteVersion,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
const projectSlug = `approval-project-${suffix}`;
let workspaceAId = '';
let workspaceBId = '';
let projectId = '';
let ownerAId = '';
let clientOneId = '';
let clientTwoId = '';
let ownerA: TenantContext;
let ownerB: TenantContext;
let clientOne: TenantContext;
let clientTwo: TenantContext;

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Approval owner A', email: `approval-owner-a-${suffix}@example.test` },
      { name: 'Approval owner B', email: `approval-owner-b-${suffix}@example.test` },
      { name: 'Approval client one', email: `approval-client-1-${suffix}@example.test` },
      { name: 'Approval client two', email: `approval-client-2-${suffix}@example.test` },
    ])
    .returning({ id: user.id, name: user.name });
  ownerAId = identities.find((item) => item.name === 'Approval owner A')!.id;
  const ownerBId = identities.find((item) => item.name === 'Approval owner B')!.id;
  clientOneId = identities.find((item) => item.name === 'Approval client one')!.id;
  clientTwoId = identities.find((item) => item.name === 'Approval client two')!.id;
  const spaces = await client.db
    .insert(workspace)
    .values([
      { name: 'Approval workspace A', slug: `approval-a-${suffix}`, ownerId: ownerAId },
      { name: 'Approval workspace B', slug: `approval-b-${suffix}`, ownerId: ownerBId },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  workspaceAId = spaces.find((item) => item.slug.startsWith('approval-a'))!.id;
  workspaceBId = spaces.find((item) => item.slug.startsWith('approval-b'))!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerAId, role: 'owner' },
    { workspaceId: workspaceAId, userId: clientOneId, role: 'member' },
    { workspaceId: workspaceAId, userId: clientTwoId, role: 'member' },
    { workspaceId: workspaceBId, userId: ownerBId, role: 'owner' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId: workspaceAId, name: 'Approval client company' })
    .returning({ id: clientCompany.id });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      name: 'Approval project',
      slug: projectSlug,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerAId,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-09-30',
    })
    .returning({ id: project.id });
  projectId = createdProject!.id;
  await client.db.insert(clientMembership).values([
    {
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      userId: clientOneId,
      canApprove: true,
    },
    {
      workspaceId: workspaceAId,
      clientCompanyId: company!.id,
      userId: clientTwoId,
      canApprove: true,
    },
  ]);
  await client.db.insert(projectMembership).values([
    {
      workspaceId: workspaceAId,
      projectId,
      userId: ownerAId,
      side: 'internal',
      role: 'owner',
    },
    {
      workspaceId: workspaceAId,
      projectId,
      userId: clientOneId,
      side: 'client',
      role: 'client',
    },
    {
      workspaceId: workspaceAId,
      projectId,
      userId: clientTwoId,
      side: 'client',
      role: 'client',
    },
  ]);
  const resolved = await Promise.all([
    resolveTenantContext(client.db, ownerAId, `approval-a-${suffix}`),
    resolveTenantContext(client.db, ownerBId, `approval-b-${suffix}`),
    resolveTenantContext(client.db, clientOneId, `approval-a-${suffix}`),
    resolveTenantContext(client.db, clientTwoId, `approval-a-${suffix}`),
  ]);
  if (resolved.some((item) => !item)) throw new Error('approval tenant setup failed');
  [ownerA, ownerB, clientOne, clientTwo] = resolved as [
    TenantContext,
    TenantContext,
    TenantContext,
    TenantContext,
  ];
});

afterAll(async () => {
  await client.db
    .delete(approvalRequest)
    .where(inArray(approvalRequest.workspaceId, [workspaceAId, workspaceBId]));
  await client.db.delete(workspace).where(inArray(workspace.id, [workspaceAId, workspaceBId]));
  await client.pool.end();
});

async function readyStage(name: string) {
  const stage = await createStage(client, ownerA, projectSlug, {
    name,
    description: 'Проверяемый этап',
    weight: 5,
    ownerUserId: ownerAId,
    clientVisible: true,
    isRequired: true,
    countsTowardProgress: true,
    plannedStartDate: '2026-08-01',
    plannedEndDate: '2026-08-15',
    acceptanceCriteria: 'Результат соответствует согласованному объёму',
  });
  await transitionStage(client, ownerA, projectSlug, stage.id, 'in_progress', {});
  await transitionStage(client, ownerA, projectSlug, stage.id, 'ready_for_review', {
    resultSummary: `Результат этапа ${name}`,
  });
  return stage;
}

describe('milestone 08 approvals', () => {
  it('creates an immutable tenant-scoped snapshot and an outbox event idempotently', async () => {
    const stage = await readyStage('Идемпотентный запрос');
    const input = {
      target: { type: 'project_stage' as const, id: stage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one' as const,
      acknowledgementText: 'Я проверил(а) указанный результат.',
      idempotencyKey: `request-${suffix}-one`,
    };
    const first = await createApprovalRequest(client, ownerA, projectSlug, input);
    const repeated = await createApprovalRequest(client, ownerA, projectSlug, input);
    expect(repeated.id).toBe(first.id);
    const [stored] = await client.db
      .select()
      .from(approvalRequest)
      .where(eq(approvalRequest.id, first.id));
    expect(stored?.snapshotChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.entitySnapshot.title).toBe('Идемпотентный запрос');
    const [event, outbox] = await Promise.all([
      client.db
        .select({ action: auditEvent.action })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.workspaceId, workspaceAId),
            eq(auditEvent.entityId, first.id),
            eq(auditEvent.action, 'approval_request.created'),
          ),
        ),
      client.db
        .select({ eventType: outboxEvent.eventType })
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, first.id)),
    ]);
    expect(event[0]?.action).toBe('approval_request.created');
    expect(outbox[0]?.eventType).toBe('approval.requested');
    const [assignedActivity, unassignedActivity] = await Promise.all([
      listApprovalAudit(client, clientOne, projectSlug),
      listApprovalAudit(client, clientTwo, projectSlug),
    ]);
    expect(assignedActivity.some((item) => item.entityId === first.id)).toBe(true);
    expect(unassignedActivity.some((item) => item.entityId === first.id)).toBe(false);
  });

  it('enforces assigned approvers, tenant isolation and all_required atomically', async () => {
    const stage = await readyStage('Два согласующих');
    const request = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: stage.id },
      approverUserIds: [clientOneId, clientTwoId],
      mode: 'all_required',
      acknowledgementText: 'Решение относится к сохранённому снимку.',
      idempotencyKey: `request-${suffix}-all`,
    });
    await expect(
      decideApprovalRequest(client, ownerA, projectSlug, request.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'owner-cannot-decide',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      decideApprovalRequest(client, ownerB, projectSlug, request.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'cross-tenant',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const first = await decideApprovalRequest(client, clientOne, projectSlug, request.id, {
      decision: 'approved',
      comment: null,
      idempotencyKey: 'client-one',
    });
    expect(first.status).toBe('pending');
    const [beforeAll] = await client.db
      .select({ status: projectStage.status })
      .from(projectStage)
      .where(eq(projectStage.id, stage.id));
    expect(beforeAll?.status).toBe('ready_for_review');
    await client.db
      .update(projectMembership)
      .set({ removedAt: new Date() })
      .where(
        and(eq(projectMembership.projectId, projectId), eq(projectMembership.userId, clientTwoId)),
      );
    await expect(
      decideApprovalRequest(client, clientTwo, projectSlug, request.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'disabled-member',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await client.db
      .update(projectMembership)
      .set({ removedAt: null })
      .where(
        and(eq(projectMembership.projectId, projectId), eq(projectMembership.userId, clientTwoId)),
      );
    const [second, repeated] = await Promise.all([
      decideApprovalRequest(client, clientTwo, projectSlug, request.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'client-two',
      }),
      decideApprovalRequest(client, clientTwo, projectSlug, request.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'client-two',
      }),
    ]);
    expect(new Set([second.status, repeated.status])).toEqual(new Set(['approved']));
    const [resolvedStage, resolvedRequest] = await Promise.all([
      client.db
        .select({ status: projectStage.status })
        .from(projectStage)
        .where(eq(projectStage.id, stage.id)),
      client.db
        .select({ status: approvalRequest.status })
        .from(approvalRequest)
        .where(eq(approvalRequest.id, request.id)),
    ]);
    expect(resolvedStage[0]?.status).toBe('approved');
    expect(resolvedRequest[0]?.status).toBe('approved');
    const [decision] = await client.db
      .select({ id: approvalDecision.id })
      .from(approvalDecision)
      .where(eq(approvalDecision.approvalRequestId, request.id))
      .limit(1);
    await expect(
      client.db
        .update(approvalDecision)
        .set({ comment: 'Подмена' })
        .where(eq(approvalDecision.id, decision!.id)),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'approval evidence is immutable' }),
    });
  });

  it('uses changes_requested, cancellation and recorded_externally as distinct flows', async () => {
    const changesStage = await readyStage('Запрос изменений');
    const changesRequest = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: changesStage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one',
      acknowledgementText: 'Подтверждаю решение.',
      idempotencyKey: `request-${suffix}-changes`,
    });
    await decideApprovalRequest(client, clientOne, projectSlug, changesRequest.id, {
      decision: 'changes_requested',
      comment: 'Нужно исправить мобильную версию.',
      idempotencyKey: 'changes-once',
    });
    const [changed] = await client.db
      .select({ status: projectStage.status })
      .from(projectStage)
      .where(eq(projectStage.id, changesStage.id));
    expect(changed?.status).toBe('changes_requested');

    const cancelledStage = await readyStage('Отмена');
    const cancelled = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: cancelledStage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one',
      acknowledgementText: 'Подтверждаю решение.',
      idempotencyKey: `request-${suffix}-cancel`,
    });
    await cancelApprovalRequest(client, ownerA, projectSlug, cancelled.id, 'Результат заменён');
    await expect(
      decideApprovalRequest(client, clientOne, projectSlug, cancelled.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'late-decision',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const externalStage = await readyStage('Внешнее решение');
    const external = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: externalStage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one',
      acknowledgementText: 'Подтверждаю решение.',
      idempotencyKey: `request-${suffix}-external`,
    });
    await recordExternalDecision(client, ownerA, projectSlug, external.id, {
      decision: 'approved',
      source: 'Видеозвонок',
      sourceDecisionAt: new Date(),
      explanation: 'Клиент подтвердил результат во время демонстрации.',
      idempotencyKey: 'external-once',
    });
    const [ordinaryDecisions, externalAudit] = await Promise.all([
      client.db
        .select()
        .from(approvalDecision)
        .where(eq(approvalDecision.approvalRequestId, external.id)),
      client.db
        .select({ action: auditEvent.action })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.entityId, external.id),
            eq(auditEvent.action, 'approval_decision.recorded_externally'),
          ),
        ),
    ]);
    expect(ordinaryDecisions).toHaveLength(0);
    expect(externalAudit[0]?.action).toBe('approval_decision.recorded_externally');
  });

  it('invalidates an outstanding request when the exact entity revision changes', async () => {
    const stage = await readyStage('Новая ревизия');
    const oldRequest = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: stage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one',
      acknowledgementText: 'Подтверждаю решение.',
      idempotencyKey: `request-${suffix}-stale-old`,
    });
    await client.db
      .update(projectStage)
      .set({ resultSummary: 'Исправленный результат', updatedAt: new Date() })
      .where(eq(projectStage.id, stage.id));
    const replacement = await createApprovalRequest(client, ownerA, projectSlug, {
      target: { type: 'project_stage', id: stage.id },
      approverUserIds: [clientOneId],
      mode: 'any_one',
      acknowledgementText: 'Подтверждаю решение.',
      idempotencyKey: `request-${suffix}-stale-new`,
    });
    const rows = await client.db
      .select({ id: approvalRequest.id, status: approvalRequest.status })
      .from(approvalRequest)
      .where(inArray(approvalRequest.id, [oldRequest.id, replacement.id]));
    expect(rows.find((item) => item.id === oldRequest.id)?.status).toBe('invalidated');
    expect(rows.find((item) => item.id === replacement.id)?.status).toBe('pending');
    await expect(
      decideApprovalRequest(client, clientOne, projectSlug, oldRequest.id, {
        decision: 'approved',
        comment: null,
        idempotencyKey: 'stale-decision',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('blocks approval while blocking feedback is unresolved and hides foreign requests', async () => {
    const stage = await readyStage('Блокирующее замечание');
    const [version] = await client.db
      .insert(siteVersion)
      .values({
        workspaceId: workspaceAId,
        projectId,
        stageId: stage.id,
        versionNumber: 1,
        name: 'Проверяемая версия',
        changeLog: 'Первая версия',
        checkInstructions: 'Открыть главную',
        url: 'https://example.test',
        environmentType: 'staging',
        securityStatus: 'safe',
        availabilityStatus: 'reachable',
        clientVisible: true,
        publishedByUserId: ownerAId,
        publishedAt: new Date(),
      })
      .returning({ id: siteVersion.id });
    await client.db.insert(feedbackItem).values({
      workspaceId: workspaceAId,
      projectId,
      siteVersionId: version!.id,
      title: 'Блокирующая ошибка',
      body: 'Нельзя завершить проверку',
      priority: 'blocking',
      visibility: 'client',
      createdByUserId: clientOneId,
    });
    await expect(
      createApprovalRequest(client, ownerA, projectSlug, {
        target: { type: 'project_stage', id: stage.id },
        approverUserIds: [clientOneId],
        mode: 'any_one',
        acknowledgementText: 'Подтверждаю решение.',
        idempotencyKey: `request-${suffix}-blocked`,
      }),
    ).rejects.toMatchObject({ code: 'BLOCKING_FEEDBACK' });
    await expect(getProjectApprovals(client, ownerB, projectSlug)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
