import { and, eq, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  auditEvent,
  comment,
  feedbackItem,
  fileObject,
  outboxEvent,
  project,
  projectUpdate,
  siteVersion,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { canTransitionFeedback } from './state-machine';
import type { FeedbackInput, FeedbackStatus, ProjectUpdateInput, SiteVersionInput } from './types';

export class ReviewServiceError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_STATE' | 'INVALID_INPUT') {
    super(code);
    this.name = 'ReviewServiceError';
  }
}

async function access(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  permission: 'project.view' | 'project.edit',
) {
  const result = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(result, permission)) throw new ReviewServiceError('NOT_FOUND');
  if (result!.projectStatus === 'archived' && permission !== 'project.view') {
    throw new ReviewServiceError('INVALID_STATE');
  }
  return result!;
}

function domainEvent(workspaceId: string, projectId: string, type: string, id: string) {
  return {
    workspaceId,
    eventType: type,
    aggregateType: 'review',
    aggregateId: id,
    payload: { template: 'domain-event' as const, projectId, entityType: 'review' },
  };
}

export async function createProjectUpdate(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: ProjectUpdateInput,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    await tx
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, allowed.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .for('update');
    if (input.pinned) {
      await tx
        .update(projectUpdate)
        .set({ pinnedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(projectUpdate.projectId, allowed.projectId),
            eq(projectUpdate.workspaceId, tenant.workspaceId),
            eq(projectUpdate.visibility, input.visibility),
          ),
        );
    }
    const [created] = await tx
      .insert(projectUpdate)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        title: input.title,
        body: input.body,
        visibility: input.visibility,
        importance: input.importance,
        pinnedAt: input.pinned ? new Date() : null,
        createdByUserId: tenant.userId,
      })
      .returning({ id: projectUpdate.id });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_update.published',
      entityType: 'project_update',
      entityId: created!.id,
      requestId,
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, allowed.projectId, 'project_update.published', created!.id),
      );
    return created!;
  });
}

export async function createSiteVersion(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: SiteVersionInput,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    await tx
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, allowed.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .for('update');
    const [next] = await tx
      .select({ value: sql<number>`coalesce(max(${siteVersion.versionNumber}), 0) + 1` })
      .from(siteVersion)
      .where(eq(siteVersion.projectId, allowed.projectId));
    const [created] = await tx
      .insert(siteVersion)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        versionNumber: Number(next?.value ?? 1),
        name: input.name,
        description: input.description,
        changeLog: input.changeLog,
        checkInstructions: input.checkInstructions,
        url: input.url,
        environmentType: input.environmentType,
        accessMode: input.accessMode,
        accessSecretEncrypted: input.accessSecretEncrypted,
        publishedByUserId: tenant.userId,
      })
      .returning({ id: siteVersion.id });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'site_version.created_pending_check',
      entityType: 'site_version',
      entityId: created!.id,
      requestId,
    });
    return created!;
  });
}

export async function publishSiteVersion(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  versionId: string,
  acknowledgeUnreachable: boolean,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  const result = await client.db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.id, versionId),
          eq(siteVersion.projectId, allowed.projectId),
          eq(siteVersion.workspaceId, tenant.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    if (!version) {
      throw new ReviewServiceError('INVALID_STATE');
    }
    if (version.clientVisible) return version;
    if (
      version.securityStatus !== 'safe' ||
      (version.availabilityStatus !== 'reachable' && !acknowledgeUnreachable)
    ) {
      throw new ReviewServiceError('INVALID_STATE');
    }
    if (!version.checkedAt || Date.now() - version.checkedAt.getTime() > 10 * 60 * 1_000) {
      await tx
        .update(siteVersion)
        .set({
          securityStatus: 'pending',
          availabilityStatus: 'pending',
          embedStatus: 'unknown',
          checkAttempts: 0,
          nextCheckAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(siteVersion.id, version.id));
      return null;
    }
    const now = new Date();
    await tx
      .update(siteVersion)
      .set({ clientVisible: true, publishedAt: now, updatedAt: now })
      .where(eq(siteVersion.id, version.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'site_version.published',
      entityType: 'site_version',
      entityId: version.id,
      requestId,
      metadata: {
        source:
          version.availabilityStatus === 'reachable' ? 'safe_reachable' : 'safe_but_unreachable',
      },
    });
    await tx
      .insert(outboxEvent)
      .values(
        domainEvent(tenant.workspaceId, allowed.projectId, 'site_version.published', version.id),
      );
    return version;
  });
  if (!result) throw new ReviewServiceError('INVALID_STATE');
  return result;
}

export async function createFeedback(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: FeedbackInput,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.view');
  if (
    allowed.side !== 'client' ||
    allowed.role === 'observer' ||
    allowed.projectStatus === 'archived'
  ) {
    throw new ReviewServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: siteVersion.id })
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.id, input.siteVersionId),
          eq(siteVersion.projectId, allowed.projectId),
          eq(siteVersion.workspaceId, tenant.workspaceId),
          eq(siteVersion.clientVisible, true),
          eq(siteVersion.securityStatus, 'safe'),
        ),
      )
      .limit(1);
    if (!version) throw new ReviewServiceError('NOT_FOUND');
    if (input.screenshotFileId) {
      const [file] = await tx
        .select({ id: fileObject.id })
        .from(fileObject)
        .where(
          and(
            eq(fileObject.id, input.screenshotFileId),
            eq(fileObject.projectId, allowed.projectId),
            eq(fileObject.workspaceId, tenant.workspaceId),
            eq(fileObject.uploadStatus, 'available'),
            eq(fileObject.scanStatus, 'clean'),
            eq(fileObject.uploadedByUserId, tenant.userId),
          ),
        )
        .limit(1);
      if (!file) throw new ReviewServiceError('NOT_FOUND');
    }
    const [created] = await tx
      .insert(feedbackItem)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        siteVersionId: version.id,
        title: input.title,
        body: input.body,
        priority: input.priority,
        pageUrl: input.pageUrl,
        screenshotFileId: input.screenshotFileId,
        createdByUserId: tenant.userId,
      })
      .returning({ id: feedbackItem.id });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'feedback.created',
      entityType: 'feedback_item',
      entityId: created!.id,
      requestId,
    });
    await tx
      .insert(outboxEvent)
      .values(domainEvent(tenant.workspaceId, allowed.projectId, 'feedback.created', created!.id));
    return created!;
  });
}

export async function transitionFeedback(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  feedbackId: string,
  nextStatus: FeedbackStatus,
  classification: 'in_scope' | 'potential_change',
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.view');
  if (allowed.role === 'observer' || allowed.projectStatus === 'archived') {
    throw new ReviewServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(feedbackItem)
      .where(
        and(
          eq(feedbackItem.id, feedbackId),
          eq(feedbackItem.projectId, allowed.projectId),
          eq(feedbackItem.workspaceId, tenant.workspaceId),
          allowed.side === 'client' ? eq(feedbackItem.visibility, 'client') : undefined,
        ),
      )
      .for('update')
      .limit(1);
    if (!current || !canTransitionFeedback(current.status, nextStatus, allowed.side)) {
      throw new ReviewServiceError('INVALID_STATE');
    }
    const now = new Date();
    await tx
      .update(feedbackItem)
      .set({
        status: nextStatus,
        classification,
        resolvedAt: ['closed', 'rejected'].includes(nextStatus) ? now : null,
        updatedAt: now,
      })
      .where(eq(feedbackItem.id, current.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'feedback.status_changed',
      entityType: 'feedback_item',
      entityId: current.id,
      requestId,
      metadata: { fromStatus: current.status, toStatus: nextStatus },
    });
  });
}

export async function addFeedbackComment(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  feedbackId: string,
  body: string,
  visibility: 'internal' | 'client',
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.view');
  if (allowed.role === 'observer' || (allowed.side === 'client' && visibility === 'internal')) {
    throw new ReviewServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: feedbackItem.id })
      .from(feedbackItem)
      .where(
        and(
          eq(feedbackItem.id, feedbackId),
          eq(feedbackItem.projectId, allowed.projectId),
          eq(feedbackItem.workspaceId, tenant.workspaceId),
          allowed.side === 'client' ? eq(feedbackItem.visibility, 'client') : undefined,
        ),
      )
      .limit(1);
    if (!target) throw new ReviewServiceError('NOT_FOUND');
    const [created] = await tx
      .insert(comment)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        feedbackItemId: target.id,
        body,
        visibility,
        authorUserId: tenant.userId,
      })
      .returning({ id: comment.id });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'feedback.comment_added',
      entityType: 'comment',
      entityId: created!.id,
      requestId,
    });
    return created!;
  });
}

export async function reviseFeedbackComment(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  feedbackId: string,
  commentId: string,
  intent: 'edit' | 'delete',
  body: string | null,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.view');
  if (allowed.role === 'observer' || allowed.projectStatus === 'archived') {
    throw new ReviewServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: comment.id, authorUserId: comment.authorUserId, deletedAt: comment.deletedAt })
      .from(comment)
      .innerJoin(
        feedbackItem,
        and(
          eq(feedbackItem.id, comment.feedbackItemId),
          eq(feedbackItem.projectId, comment.projectId),
          eq(feedbackItem.workspaceId, comment.workspaceId),
        ),
      )
      .where(
        and(
          eq(comment.id, commentId),
          eq(comment.feedbackItemId, feedbackId),
          eq(comment.projectId, allowed.projectId),
          eq(comment.workspaceId, tenant.workspaceId),
          allowed.side === 'client' ? eq(comment.visibility, 'client') : undefined,
        ),
      )
      .for('update')
      .limit(1);
    if (!current || current.authorUserId !== tenant.userId || current.deletedAt) {
      throw new ReviewServiceError('NOT_FOUND');
    }
    if (intent === 'edit' && !body?.trim()) throw new ReviewServiceError('INVALID_INPUT');
    const now = new Date();
    await tx
      .update(comment)
      .set(
        intent === 'delete'
          ? { body: '', deletedAt: now, updatedAt: now }
          : { body: body!.trim(), editedAt: now, updatedAt: now },
      )
      .where(eq(comment.id, current.id));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: intent === 'delete' ? 'feedback.comment_deleted' : 'feedback.comment_edited',
      entityType: 'comment',
      entityId: current.id,
      requestId,
    });
  });
}
