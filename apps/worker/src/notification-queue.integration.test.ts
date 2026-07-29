import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseWorkerEnv } from '@garun/config';
import { createDatabaseClient } from '@garun/db';
import {
  actionItem,
  actionReminder,
  auditEvent,
  clientCompany,
  notificationDelivery,
  notificationEvent,
  notificationPreference,
  outboxEvent,
  project,
  projectMembership,
  user,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';

import {
  processOutbox,
  processReminders,
  sendNotificationEmail,
  type MailTransport,
} from './notification-queue';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
const client = createDatabaseClient(databaseUrl);
const suffix = crypto.randomUUID().slice(0, 8);
const environment = parseWorkerEnv({
  APP_ENV: 'test',
  DATABASE_URL: databaseUrl,
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379',
  BETTER_AUTH_SECRET: 'notification-worker-test-key-at-least-32-characters',
  OUTBOX_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  EMAIL_FROM: 'Garun Test <garun@example.test>',
});

let ownerId = '';
let memberId = '';
let workspaceId = '';
let projectId = '';
const sentMail: unknown[] = [];
const transport: MailTransport = {
  sendMail: async (options) => {
    sentMail.push(options);
    return { accepted: true };
  },
};

beforeAll(async () => {
  const identities = await client.db
    .insert(user)
    .values([
      { name: 'Worker owner', email: `worker-owner-${suffix}@example.test` },
      { name: 'Worker member', email: `worker-member-${suffix}@example.test` },
    ])
    .returning({ id: user.id, email: user.email });
  ownerId = identities.find((item) => item.email.includes('owner'))!.id;
  memberId = identities.find((item) => item.email.includes('member'))!.id;
  const [space] = await client.db
    .insert(workspace)
    .values({ name: 'Worker notifications', slug: `worker-${suffix}`, ownerId })
    .returning({ id: workspace.id });
  workspaceId = space!.id;
  await client.db.insert(workspaceMembership).values([
    { workspaceId, userId: ownerId, role: 'owner' },
    { workspaceId, userId: memberId, role: 'member' },
  ]);
  const [company] = await client.db
    .insert(clientCompany)
    .values({ workspaceId, name: 'Worker client' })
    .returning({ id: clientCompany.id });
  const [createdProject] = await client.db
    .insert(project)
    .values({
      workspaceId,
      clientCompanyId: company!.id,
      name: 'Worker project',
      slug: `worker-project-${suffix}`,
      projectType: 'website',
      status: 'in_progress',
      ownerUserId: ownerId,
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-09-01',
    })
    .returning({ id: project.id });
  projectId = createdProject!.id;
  await client.db.insert(projectMembership).values({
    workspaceId,
    projectId,
    userId: memberId,
    side: 'internal',
    role: 'employee',
    permissions: { version: 1, grants: ['project.view'] },
  });
});

afterAll(async () => {
  await client.db.delete(workspace).where(eq(workspace.id, workspaceId));
  await client.db.delete(user).where(eq(user.id, ownerId));
  await client.db.delete(user).where(eq(user.id, memberId));
  await client.pool.end();
});

async function actionEvent(assigneeUserId: string, actorUserId: string) {
  const [action] = await client.db
    .insert(actionItem)
    .values({
      workspaceId,
      projectId,
      title: `Worker action ${crypto.randomUUID()}`,
      visibility: 'internal',
      assigneeUserId,
      createdByUserId: actorUserId,
      dueAt: new Date(Date.now() + 60 * 60 * 1_000),
    })
    .returning({ id: actionItem.id });
  await client.db.insert(auditEvent).values({
    workspaceId,
    actorUserId,
    action: 'action.created',
    entityType: 'action_item',
    entityId: action!.id,
  });
  const [event] = await client.db
    .insert(outboxEvent)
    .values({
      workspaceId,
      eventType: 'action.created',
      aggregateType: 'action',
      aggregateId: action!.id,
      payload: { template: 'domain-event', projectId, entityType: 'action' },
      status: 'processing',
      lockedAt: new Date(),
    })
    .returning({ id: outboxEvent.id });
  return { actionId: action!.id, eventId: event!.id };
}

describe('notification worker persistence and retries', () => {
  it('materializes one visible event, suppresses the author and survives replay', async () => {
    const target = await actionEvent(memberId, ownerId);
    const first = await processOutbox(client.pool, target.eventId, environment, transport);
    const replay = await processOutbox(client.pool, target.eventId, environment, transport);
    expect(first).toHaveLength(1);
    expect(replay).toHaveLength(1);

    const events = await client.db
      .select({ id: notificationEvent.id })
      .from(notificationEvent)
      .where(eq(notificationEvent.sourceOutboxEventId, target.eventId));
    expect(events).toHaveLength(1);
    const deliveries = await client.db
      .select({ channel: notificationDelivery.channel })
      .from(notificationDelivery)
      .where(eq(notificationDelivery.notificationEventId, events[0]!.id));
    expect(deliveries.map((item) => item.channel).sort()).toEqual(['email', 'in_app']);

    const self = await actionEvent(ownerId, ownerId);
    expect(await processOutbox(client.pool, self.eventId, environment, transport)).toHaveLength(0);
    expect(
      await client.db
        .select({ id: notificationEvent.id })
        .from(notificationEvent)
        .where(eq(notificationEvent.sourceOutboxEventId, self.eventId)),
    ).toHaveLength(0);
  });

  it('marks email delivered once and suppresses a recipient who lost access', async () => {
    const target = await actionEvent(memberId, ownerId);
    const [delivery] = await processOutbox(client.pool, target.eventId, environment, transport);
    const connection = await client.pool.connect();
    try {
      await sendNotificationEmail(connection, delivery!.id, environment, transport);
    } finally {
      connection.release();
    }
    const [delivered] = await client.db
      .select({ status: notificationDelivery.status, attempts: notificationDelivery.attempts })
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, delivery!.id));
    expect(delivered).toEqual({ status: 'delivered', attempts: 1 });
    expect(sentMail).toHaveLength(1);

    const inaccessible = await actionEvent(memberId, ownerId);
    const [pending] = await processOutbox(
      client.pool,
      inaccessible.eventId,
      environment,
      transport,
    );
    await client.db
      .update(projectMembership)
      .set({ removedAt: new Date() })
      .where(
        and(eq(projectMembership.projectId, projectId), eq(projectMembership.userId, memberId)),
      );
    const secondConnection = await client.pool.connect();
    try {
      await sendNotificationEmail(secondConnection, pending!.id, environment, transport);
    } finally {
      secondConnection.release();
    }
    const [suppressed] = await client.db
      .select({
        status: notificationDelivery.status,
        code: notificationDelivery.lastErrorCode,
      })
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, pending!.id));
    expect(suppressed).toEqual({
      status: 'suppressed',
      code: 'RECIPIENT_NO_LONGER_ELIGIBLE',
    });
    expect(sentMail).toHaveLength(1);
    await client.db
      .update(projectMembership)
      .set({ removedAt: null })
      .where(
        and(eq(projectMembership.projectId, projectId), eq(projectMembership.userId, memberId)),
      );
  });

  it('keeps a failed email retryable without duplicating the visible notification', async () => {
    const target = await actionEvent(memberId, ownerId);
    const [pending] = await processOutbox(client.pool, target.eventId, environment, transport);
    const failingTransport: MailTransport = {
      sendMail: async () => {
        throw new Error('TEST_SMTP_UNAVAILABLE');
      },
    };
    const connection = await client.pool.connect();
    try {
      await expect(
        sendNotificationEmail(connection, pending!.id, environment, failingTransport),
      ).rejects.toThrow('TEST_SMTP_UNAVAILABLE');
      await sendNotificationEmail(connection, pending!.id, environment, transport);
    } finally {
      connection.release();
    }
    const [delivery] = await client.db
      .select({ status: notificationDelivery.status, attempts: notificationDelivery.attempts })
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, pending!.id));
    expect(delivery).toEqual({ status: 'delivered', attempts: 2 });
    expect(
      await client.db
        .select({ id: notificationEvent.id })
        .from(notificationEvent)
        .where(eq(notificationEvent.sourceOutboxEventId, target.eventId)),
    ).toHaveLength(1);
  });

  it('stops delayed reminders after completion and respects disabled email preferences', async () => {
    const reminderTarget = await actionEvent(memberId, ownerId);
    await client.db
      .update(outboxEvent)
      .set({ status: 'delivered' })
      .where(eq(outboxEvent.id, reminderTarget.eventId));
    await processReminders(client.pool);
    const [reminderEvent] = await client.db
      .select({ id: notificationEvent.id })
      .from(notificationEvent)
      .where(
        and(
          eq(notificationEvent.entityId, reminderTarget.actionId),
          eq(notificationEvent.eventType, 'action.reminder.due_soon'),
        ),
      );
    const [reminderDelivery] = await client.db
      .select({ id: notificationDelivery.id })
      .from(notificationDelivery)
      .where(
        and(
          eq(notificationDelivery.notificationEventId, reminderEvent!.id),
          eq(notificationDelivery.channel, 'email'),
        ),
      );
    expect(reminderDelivery).toBeDefined();
    await client.db
      .update(actionItem)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(actionItem.id, reminderTarget.actionId));
    const connection = await client.pool.connect();
    try {
      await sendNotificationEmail(connection, reminderDelivery!.id, environment, transport);
    } finally {
      connection.release();
    }
    const [stopped] = await client.db
      .select({ status: notificationDelivery.status, code: notificationDelivery.lastErrorCode })
      .from(notificationDelivery)
      .where(eq(notificationDelivery.id, reminderDelivery!.id));
    expect(stopped).toEqual({
      status: 'suppressed',
      code: 'REMINDER_NO_LONGER_APPLICABLE',
    });
    await processReminders(client.pool);
    const [reminder] = await client.db
      .select({ status: actionReminder.status })
      .from(actionReminder)
      .where(eq(actionReminder.actionItemId, reminderTarget.actionId));
    expect(reminder?.status).toBe('completed');

    await client.db
      .insert(notificationPreference)
      .values({
        workspaceId,
        userId: memberId,
        emailEnabled: false,
        remindersEnabled: true,
      })
      .onConflictDoUpdate({
        target: [notificationPreference.workspaceId, notificationPreference.userId],
        set: { emailEnabled: false, remindersEnabled: true },
      });
    const disabledTarget = await actionEvent(memberId, ownerId);
    await processReminders(client.pool);
    const [event] = await client.db
      .select({ id: notificationEvent.id })
      .from(notificationEvent)
      .where(
        and(
          eq(notificationEvent.entityId, disabledTarget.actionId),
          eq(notificationEvent.eventType, 'action.reminder.due_soon'),
        ),
      );
    const [email] = await client.db
      .select({ status: notificationDelivery.status })
      .from(notificationDelivery)
      .where(
        and(
          eq(notificationDelivery.notificationEventId, event!.id),
          eq(notificationDelivery.channel, 'email'),
        ),
      );
    expect(email?.status).toBe('suppressed');
  });
});
