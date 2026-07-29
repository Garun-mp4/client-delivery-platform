import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveTenantContext, type TenantContext } from '@garun/core/identity';
import {
  listNotifications,
  markNotificationRead,
  updateNotificationPreference,
} from '@garun/core/notifications';
import {
  canAccessProject,
  completeProject,
  handoverChecklist,
  resolveProjectAccess,
  setHandoverChecklistItem,
  setProjectArchived,
} from '@garun/core/projects';
import { createDatabaseClient } from '@garun/db';
import {
  actionItem,
  approvalRequest,
  auditEvent,
  clientCompany,
  notificationEvent,
  outboxEvent,
  project,
  projectMembership,
  projectStage,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);

let ownerAId = '';
let memberAId = '';
let ownerBId = '';
let workspaceAId = '';
let workspaceBId = '';
let projectAId = '';
let projectBId = '';
let tenantOwnerA: TenantContext;
let tenantMemberA: TenantContext;
let tenantOwnerB: TenantContext;

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Notification owner A', email: `notification-owner-a-${suffix}@example.test` },
      { name: 'Notification member A', email: `notification-member-a-${suffix}@example.test` },
      { name: 'Notification owner B', email: `notification-owner-b-${suffix}@example.test` },
    ])
    .returning({ id: user.id, email: user.email });
  ownerAId = identities.find((item) => item.email.includes('owner-a'))!.id;
  memberAId = identities.find((item) => item.email.includes('member-a'))!.id;
  ownerBId = identities.find((item) => item.email.includes('owner-b'))!.id;

  const spaces = await client.db
    .insert(workspace)
    .values([
      {
        name: 'Notification workspace A',
        slug: `notification-a-${suffix}`,
        ownerId: ownerAId,
      },
      {
        name: 'Notification workspace B',
        slug: `notification-b-${suffix}`,
        ownerId: ownerBId,
      },
    ])
    .returning({ id: workspace.id, slug: workspace.slug });
  const spaceA = spaces.find((item) => item.slug.endsWith(`a-${suffix}`))!;
  const spaceB = spaces.find((item) => item.slug.endsWith(`b-${suffix}`))!;
  workspaceAId = spaceA.id;
  workspaceBId = spaceB.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId: workspaceAId, userId: ownerAId, role: 'owner' },
    { workspaceId: workspaceAId, userId: memberAId, role: 'member' },
    { workspaceId: workspaceBId, userId: ownerBId, role: 'owner' },
  ]);
  const companies = await client.db
    .insert(clientCompany)
    .values([
      { workspaceId: workspaceAId, name: 'Notification client A' },
      { workspaceId: workspaceBId, name: 'Notification client B' },
    ])
    .returning({ id: clientCompany.id, workspaceId: clientCompany.workspaceId });
  const projects = await client.db
    .insert(project)
    .values([
      {
        workspaceId: workspaceAId,
        clientCompanyId: companies.find((item) => item.workspaceId === workspaceAId)!.id,
        name: 'Notification project A',
        slug: `notification-project-a-${suffix}`,
        projectType: 'website',
        status: 'in_progress',
        ownerUserId: ownerAId,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-08-30',
      },
      {
        workspaceId: workspaceBId,
        clientCompanyId: companies.find((item) => item.workspaceId === workspaceBId)!.id,
        name: 'Notification project B',
        slug: `notification-project-b-${suffix}`,
        projectType: 'website',
        status: 'in_progress',
        ownerUserId: ownerBId,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-08-30',
      },
    ])
    .returning({ id: project.id, workspaceId: project.workspaceId });
  projectAId = projects.find((item) => item.workspaceId === workspaceAId)!.id;
  projectBId = projects.find((item) => item.workspaceId === workspaceBId)!.id;
  await client.db.insert(projectMembership).values({
    workspaceId: workspaceAId,
    projectId: projectAId,
    userId: memberAId,
    side: 'internal',
    role: 'employee',
    permissions: { version: 1, grants: ['project.view'] },
  });

  const resolved = await Promise.all([
    resolveTenantContext(client.db, ownerAId, spaceA.slug),
    resolveTenantContext(client.db, memberAId, spaceA.slug),
    resolveTenantContext(client.db, ownerBId, spaceB.slug),
  ]);
  if (!resolved[0] || !resolved[1] || !resolved[2]) throw new Error('tenant setup failed');
  [tenantOwnerA, tenantMemberA, tenantOwnerB] = resolved as [
    TenantContext,
    TenantContext,
    TenantContext,
  ];
});

afterAll(async () => {
  await client.db.delete(workspace).where(eq(workspace.id, workspaceAId));
  await client.db.delete(workspace).where(eq(workspace.id, workspaceBId));
  await client.db.delete(user).where(
    and(
      // Keep cleanup tenant-local and avoid touching fixtures from parallel suites.
      eq(user.id, ownerAId),
    ),
  );
  await client.db.delete(user).where(eq(user.id, memberAId));
  await client.db.delete(user).where(eq(user.id, ownerBId));
  await client.pool.end();
});

describe('Milestone 09 notifications, completion and archive', () => {
  it('scopes inbox/read state to recipient and tenant and hides a lost project membership', async () => {
    const [ownEvent] = await client.db
      .insert(notificationEvent)
      .values({
        workspaceId: workspaceAId,
        projectId: projectAId,
        recipientUserId: memberAId,
        eventType: 'action.created',
        entityType: 'action',
        entityId: crypto.randomUUID(),
        dedupeKey: `notification-own-${suffix}`,
        deepLinkPath: `/workspace/notification-a-${suffix}/projects/notification-project-a-${suffix}/workflow`,
      })
      .returning({ id: notificationEvent.id });
    const [foreignEvent] = await client.db
      .insert(notificationEvent)
      .values({
        workspaceId: workspaceBId,
        projectId: projectBId,
        recipientUserId: ownerBId,
        eventType: 'project.completed',
        entityType: 'project',
        entityId: projectBId,
        dedupeKey: `notification-foreign-${suffix}`,
        deepLinkPath: `/workspace/notification-b-${suffix}/projects/notification-project-b-${suffix}`,
      })
      .returning({ id: notificationEvent.id });

    const inbox = await listNotifications(client, tenantMemberA);
    expect(inbox.map((item) => item.id)).toContain(ownEvent!.id);
    expect(inbox.map((item) => item.id)).not.toContain(foreignEvent!.id);
    await expect(
      markNotificationRead(client, tenantMemberA, foreignEvent!.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await markNotificationRead(client, tenantMemberA, ownEvent!.id);
    expect(
      (await listNotifications(client, tenantMemberA)).find((item) => item.id === ownEvent!.id)
        ?.readAt,
    ).toBeInstanceOf(Date);

    await client.db
      .update(projectMembership)
      .set({ removedAt: new Date() })
      .where(
        and(eq(projectMembership.projectId, projectAId), eq(projectMembership.userId, memberAId)),
      );
    expect((await listNotifications(client, tenantMemberA)).map((item) => item.id)).not.toContain(
      ownEvent!.id,
    );
  });

  it('validates tenant-local delivery preferences and overnight quiet hours', async () => {
    const saved = await updateNotificationPreference(client, tenantOwnerA, {
      emailEnabled: false,
      remindersEnabled: true,
      timezone: 'Europe/Moscow',
      quietHoursStartMinute: 1_320,
      quietHoursEndMinute: 480,
    });
    expect(saved.emailEnabled).toBe(false);
    await expect(
      updateNotificationPreference(client, tenantOwnerA, {
        emailEnabled: true,
        remindersEnabled: true,
        timezone: 'Not/A_Timezone',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('enforces all completion gates transactionally and emits one completion event', async () => {
    const [stage] = await client.db
      .insert(projectStage)
      .values({
        workspaceId: workspaceAId,
        projectId: projectAId,
        name: 'Финальный этап',
        orderIndex: 0,
        weight: 1,
        status: 'approved',
        ownerUserId: ownerAId,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-20',
        resultSummary: 'Результат принят',
      })
      .returning({ id: projectStage.id });
    const [blocking] = await client.db
      .insert(actionItem)
      .values({
        workspaceId: workspaceAId,
        projectId: projectAId,
        stageId: stage!.id,
        title: 'Блокирующая передача',
        visibility: 'internal',
        assigneeUserId: ownerAId,
        createdByUserId: ownerAId,
        dueAt: new Date('2026-07-25T12:00:00Z'),
        isBlocking: true,
      })
      .returning({ id: actionItem.id });
    await client.db.insert(approvalRequest).values({
      workspaceId: workspaceAId,
      projectId: projectAId,
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
      acknowledgementText: 'Демонстрационный текст подтверждения',
      acknowledgementChecksum: 'b'.repeat(64),
      status: 'approved',
      requestedByUserId: ownerAId,
      idempotencyKey: `completion-${suffix}`,
      resolvedAt: new Date(),
    });

    await expect(
      completeProject(client, tenantOwnerA, `notification-project-a-${suffix}`),
    ).rejects.toMatchObject({ code: 'BLOCKING_ACTIONS' });
    await client.db
      .update(actionItem)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(actionItem.id, blocking!.id));
    await expect(
      completeProject(client, tenantOwnerB, `notification-project-a-${suffix}`),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      completeProject(client, tenantOwnerA, `notification-project-a-${suffix}`),
    ).rejects.toMatchObject({ code: 'HANDOVER_INCOMPLETE' });
    for (const item of handoverChecklist) {
      await setHandoverChecklistItem(
        client,
        tenantOwnerA,
        `notification-project-a-${suffix}`,
        item.key,
        true,
      );
    }
    await completeProject(client, tenantOwnerA, `notification-project-a-${suffix}`);
    await completeProject(client, tenantOwnerA, `notification-project-a-${suffix}`);

    const [completed] = await client.db
      .select({ status: project.status, completedAt: project.completedAt })
      .from(project)
      .where(eq(project.id, projectAId));
    expect(completed?.status).toBe('completed');
    expect(completed?.completedAt).toBeInstanceOf(Date);
    const completionEvents = await client.db
      .select({ id: outboxEvent.id })
      .from(outboxEvent)
      .where(
        and(
          eq(outboxEvent.aggregateId, projectAId),
          eq(outboxEvent.eventType, 'project.completed'),
        ),
      );
    expect(completionEvents).toHaveLength(1);
  });

  it('makes archive read-only, restores completed state and records outbox/audit atomically', async () => {
    await setProjectArchived(client, tenantOwnerA, `notification-project-a-${suffix}`, true);
    const archived = await resolveProjectAccess(
      client.db,
      tenantOwnerA,
      `notification-project-a-${suffix}`,
    );
    expect(canAccessProject(archived, 'project.view.internal')).toBe(true);
    expect(canAccessProject(archived, 'project.edit')).toBe(false);
    await setProjectArchived(client, tenantOwnerA, `notification-project-a-${suffix}`, false);
    const restored = await resolveProjectAccess(
      client.db,
      tenantOwnerA,
      `notification-project-a-${suffix}`,
    );
    expect(restored?.projectStatus).toBe('completed');

    const [domainEvents, audits] = await Promise.all([
      client.db
        .select({ type: outboxEvent.eventType })
        .from(outboxEvent)
        .where(eq(outboxEvent.aggregateId, projectAId)),
      client.db
        .select({ action: auditEvent.action })
        .from(auditEvent)
        .where(eq(auditEvent.entityId, projectAId)),
    ]);
    expect(domainEvents.map((item) => item.type)).toEqual(
      expect.arrayContaining(['project.completed', 'project.archived', 'project.restored']),
    );
    expect(audits.map((item) => item.action)).toEqual(
      expect.arrayContaining(['project.completed', 'project.archived', 'project.restored']),
    );
  });
});
