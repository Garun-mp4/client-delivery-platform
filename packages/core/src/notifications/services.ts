import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  notificationEvent,
  notificationPreference,
  project,
  projectMembership,
  user,
  workspace,
} from '@garun/db/schema';

import { isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import { isValidTimezone, notificationPresentation, validateQuietHours } from './policy';
import type { NotificationPreferenceInput } from './types';

export class NotificationServiceError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_INPUT') {
    super(code);
    this.name = 'NotificationServiceError';
  }
}

export async function listNotifications(client: DatabaseClient, tenant: TenantContext, limit = 50) {
  const membershipGuard = isOwner(tenant)
    ? undefined
    : or(
        isNull(notificationEvent.projectId),
        sql`exists (
          select 1 from ${projectMembership} pm
          where pm.workspace_id = ${tenant.workspaceId}
            and pm.project_id = ${notificationEvent.projectId}
            and pm.user_id = ${tenant.userId}
            and pm.removed_at is null
        )`,
      );
  const rows = await client.db
    .select({
      id: notificationEvent.id,
      eventType: notificationEvent.eventType,
      deepLinkPath: notificationEvent.deepLinkPath,
      readAt: notificationEvent.readAt,
      createdAt: notificationEvent.createdAt,
      projectName: project.name,
      actorName: user.name,
    })
    .from(notificationEvent)
    .leftJoin(
      project,
      and(
        eq(project.id, notificationEvent.projectId),
        eq(project.workspaceId, notificationEvent.workspaceId),
      ),
    )
    .leftJoin(user, eq(user.id, notificationEvent.actorUserId))
    .where(
      and(
        eq(notificationEvent.workspaceId, tenant.workspaceId),
        eq(notificationEvent.recipientUserId, tenant.userId),
        membershipGuard,
      ),
    )
    .orderBy(desc(notificationEvent.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((row) => ({ ...row, ...notificationPresentation(row.eventType) }));
}

export async function markNotificationRead(
  client: DatabaseClient,
  tenant: TenantContext,
  notificationId: string,
) {
  const [updated] = await client.db
    .update(notificationEvent)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationEvent.id, notificationId),
        eq(notificationEvent.workspaceId, tenant.workspaceId),
        eq(notificationEvent.recipientUserId, tenant.userId),
      ),
    )
    .returning({ id: notificationEvent.id });
  if (!updated) throw new NotificationServiceError('NOT_FOUND');
  return updated;
}

export async function markAllNotificationsRead(client: DatabaseClient, tenant: TenantContext) {
  await client.db
    .update(notificationEvent)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notificationEvent.workspaceId, tenant.workspaceId),
        eq(notificationEvent.recipientUserId, tenant.userId),
        isNull(notificationEvent.readAt),
      ),
    );
}

export async function getNotificationPreference(client: DatabaseClient, tenant: TenantContext) {
  const [[stored], [space]] = await Promise.all([
    client.db
      .select()
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.workspaceId, tenant.workspaceId),
          eq(notificationPreference.userId, tenant.userId),
        ),
      )
      .limit(1),
    client.db
      .select({ timezone: workspace.timezone })
      .from(workspace)
      .where(eq(workspace.id, tenant.workspaceId))
      .limit(1),
  ]);
  return (
    stored ?? {
      emailEnabled: true,
      remindersEnabled: true,
      timezone: space?.timezone ?? 'Europe/Moscow',
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    }
  );
}

export async function updateNotificationPreference(
  client: DatabaseClient,
  tenant: TenantContext,
  input: NotificationPreferenceInput,
) {
  if (
    !isValidTimezone(input.timezone) ||
    !validateQuietHours(input.quietHoursStartMinute, input.quietHoursEndMinute)
  ) {
    throw new NotificationServiceError('INVALID_INPUT');
  }
  const [saved] = await client.db
    .insert(notificationPreference)
    .values({ workspaceId: tenant.workspaceId, userId: tenant.userId, ...input })
    .onConflictDoUpdate({
      target: [notificationPreference.workspaceId, notificationPreference.userId],
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return saved!;
}
