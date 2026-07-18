import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  actionItem,
  auditEvent,
  fileLink,
  fileObject,
  material,
  materialRevision,
  outboxEvent,
  projectMembership,
  workspace,
  workspaceMembership,
} from '@garun/db/schema';
import { normalizeDisplayName } from '@garun/storage';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import type { MaterialRequestInput, UploadDeclaration } from './types';

export type MaterialServiceErrorCode =
  'NOT_FOUND' | 'CONFLICT' | 'INVALID_STATE' | 'QUOTA_EXCEEDED';

export class MaterialServiceError extends Error {
  constructor(readonly code: MaterialServiceErrorCode) {
    super(code);
    this.name = 'MaterialServiceError';
  }
}

async function access(
  client: DatabaseClient,
  tenant: TenantContext,
  slug: string,
  permission: 'project.view' | 'project.edit',
) {
  const result = await resolveProjectAccess(client.db, tenant, slug);
  if (!canAccessProject(result, permission)) throw new MaterialServiceError('NOT_FOUND');
  return result!;
}

function event(workspaceId: string, projectId: string, type: string, id: string) {
  return {
    workspaceId,
    eventType: type,
    aggregateType: 'material',
    aggregateId: id,
    payload: { template: 'domain-event' as const, projectId, entityType: 'material' },
  };
}

export async function createMaterialRequest(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: MaterialRequestInput,
  requestId?: string,
) {
  const projectAccess = await access(client, tenant, projectSlug, 'project.edit');
  if (projectAccess.projectStatus === 'archived') {
    throw new MaterialServiceError('INVALID_STATE');
  }
  return client.db.transaction(async (tx) => {
    const [assignee] = await tx
      .select({ id: projectMembership.id })
      .from(projectMembership)
      .innerJoin(
        workspaceMembership,
        and(
          eq(workspaceMembership.workspaceId, projectMembership.workspaceId),
          eq(workspaceMembership.userId, projectMembership.userId),
          eq(workspaceMembership.status, 'active'),
        ),
      )
      .where(
        and(
          eq(projectMembership.projectId, projectAccess.projectId),
          eq(projectMembership.workspaceId, tenant.workspaceId),
          eq(projectMembership.userId, input.requestedFromUserId),
          eq(projectMembership.side, 'client'),
          isNull(projectMembership.removedAt),
        ),
      )
      .limit(1);
    if (!assignee) throw new MaterialServiceError('NOT_FOUND');
    const [action] = await tx
      .insert(actionItem)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        stageId: input.stageId,
        title: `Загрузить: ${input.title}`,
        type: 'upload_material',
        visibility: 'client',
        assigneeUserId: input.requestedFromUserId,
        createdByUserId: tenant.userId,
        dueAt: input.dueAt,
        isBlocking: true,
      })
      .returning({ id: actionItem.id });
    const [created] = await tx
      .insert(material)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        stageId: input.stageId,
        actionItemId: action!.id,
        title: input.title,
        type: input.type,
        category: input.category,
        requestedFromUserId: input.requestedFromUserId,
        requestedByUserId: tenant.userId,
        dueAt: input.dueAt,
      })
      .returning({ id: material.id });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'material.requested',
      entityType: 'material',
      entityId: created!.id,
      requestId,
    });
    await tx.insert(outboxEvent).values({
      ...event(tenant.workspaceId, projectAccess.projectId, 'material.requested', created!.id),
      payload: {
        template: 'material-request',
        recipientUserId: input.requestedFromUserId,
        projectId: projectAccess.projectId,
        entityType: 'material',
      },
    });
    return created!;
  });
}

export async function initiateMaterialUpload(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  materialId: string,
  files: readonly UploadDeclaration[],
  idempotencyKey: string,
  options: {
    readonly maxWorkspaceBytes: number;
    readonly uploadExpiresAt: Date;
  },
) {
  const projectAccess = await access(client, tenant, projectSlug, 'project.view');
  if (
    projectAccess.side !== 'client' ||
    projectAccess.projectStatus === 'archived' ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)
  ) {
    throw new MaterialServiceError('NOT_FOUND');
  }
  return client.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: material.id, requestedFromUserId: material.requestedFromUserId })
      .from(material)
      .where(
        and(
          eq(material.id, materialId),
          eq(material.projectId, projectAccess.projectId),
          eq(material.workspaceId, tenant.workspaceId),
          inArray(material.status, ['requested', 'clarification', 'uploaded', 'accepted']),
        ),
      )
      .for('update')
      .limit(1);
    if (!target || target.requestedFromUserId !== tenant.userId) {
      throw new MaterialServiceError('NOT_FOUND');
    }
    await tx
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.id, tenant.workspaceId))
      .for('update');
    const [usage] = await tx
      .select({ bytes: sql<number>`coalesce(sum(${fileObject.size}), 0)::bigint` })
      .from(fileObject)
      .where(
        and(
          eq(fileObject.workspaceId, tenant.workspaceId),
          inArray(fileObject.uploadStatus, ['initiated', 'uploaded', 'scanning', 'available']),
        ),
      );
    const requestedBytes = files.reduce((sum, item) => sum + item.size, 0);
    if (Number(usage?.bytes ?? 0) + requestedBytes > options.maxWorkspaceBytes) {
      throw new MaterialServiceError('QUOTA_EXCEEDED');
    }
    const [existing] = await tx
      .select({ id: materialRevision.id })
      .from(materialRevision)
      .where(
        and(
          eq(materialRevision.materialId, target.id),
          eq(materialRevision.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      return tx
        .select({
          id: fileObject.id,
          storageKey: fileObject.storageKey,
          name: fileObject.normalizedName,
          mimeType: fileObject.declaredMimeType,
          size: fileObject.size,
          checksum: fileObject.clientChecksum,
        })
        .from(fileLink)
        .innerJoin(fileObject, eq(fileObject.id, fileLink.fileObjectId))
        .where(eq(fileLink.materialRevisionId, existing.id));
    }
    const [next] = await tx
      .select({ value: sql<number>`coalesce(max(${materialRevision.revision}), 0) + 1` })
      .from(materialRevision)
      .where(eq(materialRevision.materialId, target.id));
    const revisionNumber = Number(next?.value ?? 1);
    const [revision] = await tx
      .insert(materialRevision)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        materialId: target.id,
        revision: revisionNumber,
        status: 'uploading',
        idempotencyKey,
        expectedFileCount: files.length,
        submittedByUserId: tenant.userId,
      })
      .returning({ id: materialRevision.id });
    const created = [];
    for (const file of files) {
      const fileId = randomUUID();
      const storageKey = `${tenant.workspaceId}/${projectAccess.projectId}/${fileId}/original`;
      const normalizedName = normalizeDisplayName(file.name);
      await tx.insert(fileObject).values({
        id: fileId,
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        storageKey,
        originalName: normalizedName,
        normalizedName,
        declaredMimeType: file.mimeType,
        size: file.size,
        clientChecksum: file.checksum,
        uploadSessionKey: `${idempotencyKey}:${created.length}`,
        uploadedByUserId: tenant.userId,
        uploadExpiresAt: options.uploadExpiresAt,
      });
      await tx.insert(fileLink).values({
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        fileObjectId: fileId,
        materialRevisionId: revision!.id,
        version: revisionNumber,
      });
      created.push({ id: fileId, storageKey, ...file, name: normalizedName });
    }
    return created;
  });
}

export async function submitMaterialContent(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  materialId: string,
  input: { readonly value: string; readonly idempotencyKey: string },
  requestId?: string,
) {
  const projectAccess = await access(client, tenant, projectSlug, 'project.view');
  if (
    projectAccess.side !== 'client' ||
    projectAccess.projectStatus === 'archived' ||
    !/^[a-zA-Z0-9_-]{16,100}$/.test(input.idempotencyKey)
  ) {
    throw new MaterialServiceError('NOT_FOUND');
  }
  const value = input.value.trim();
  if (!value || value.length > 20_000) throw new MaterialServiceError('INVALID_STATE');
  return client.db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: material.id,
        type: material.type,
        actionItemId: material.actionItemId,
        requestedFromUserId: material.requestedFromUserId,
      })
      .from(material)
      .where(
        and(
          eq(material.id, materialId),
          eq(material.projectId, projectAccess.projectId),
          eq(material.workspaceId, tenant.workspaceId),
          inArray(material.status, ['requested', 'clarification', 'uploaded', 'accepted']),
        ),
      )
      .for('update')
      .limit(1);
    if (
      !target ||
      target.requestedFromUserId !== tenant.userId ||
      ['file', 'image', 'video', 'logo', 'document'].includes(target.type)
    ) {
      throw new MaterialServiceError('NOT_FOUND');
    }
    let content: { text?: string; url?: string } = { text: value };
    if (target.type === 'link') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
          throw new Error('INVALID_URL');
        }
        content = { url: url.toString() };
      } catch {
        throw new MaterialServiceError('INVALID_STATE');
      }
    }
    const [existing] = await tx
      .select({ id: materialRevision.id, revision: materialRevision.revision })
      .from(materialRevision)
      .where(
        and(
          eq(materialRevision.materialId, target.id),
          eq(materialRevision.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
    const [next] = await tx
      .select({ value: sql<number>`coalesce(max(${materialRevision.revision}), 0) + 1` })
      .from(materialRevision)
      .where(eq(materialRevision.materialId, target.id));
    const now = new Date();
    const [revision] = await tx
      .insert(materialRevision)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: projectAccess.projectId,
        materialId: target.id,
        revision: Number(next?.value ?? 1),
        status: 'submitted',
        content,
        idempotencyKey: input.idempotencyKey,
        submittedByUserId: tenant.userId,
        submittedAt: now,
      })
      .returning({ id: materialRevision.id, revision: materialRevision.revision });
    await tx
      .update(material)
      .set({ status: 'uploaded', updatedAt: now })
      .where(eq(material.id, target.id));
    if (target.actionItemId) {
      await tx
        .update(actionItem)
        .set({ status: 'done', completedAt: now, updatedAt: now })
        .where(
          and(
            eq(actionItem.id, target.actionItemId),
            inArray(actionItem.status, ['open', 'in_progress']),
          ),
        );
    }
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'material.submitted',
      entityType: 'material_revision',
      entityId: revision!.id,
      requestId,
      metadata: { revision: revision!.revision },
    });
    await tx
      .insert(outboxEvent)
      .values(
        event(tenant.workspaceId, projectAccess.projectId, 'material.submitted', revision!.id),
      );
    return revision!;
  });
}

export async function markUploadCompleted(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  fileId: string,
  observed: { readonly size: number; readonly mimeType?: string; readonly checksum?: string },
) {
  const projectAccess = await access(client, tenant, projectSlug, 'project.view');
  return client.db.transaction(async (tx) => {
    const [file] = await tx
      .select()
      .from(fileObject)
      .where(
        and(
          eq(fileObject.id, fileId),
          eq(fileObject.projectId, projectAccess.projectId),
          eq(fileObject.workspaceId, tenant.workspaceId),
          eq(fileObject.uploadedByUserId, tenant.userId),
        ),
      )
      .for('update')
      .limit(1);
    if (!file) throw new MaterialServiceError('NOT_FOUND');
    if (file.uploadStatus !== 'initiated') {
      if (file.uploadStatus === 'uploaded' || file.uploadStatus === 'scanning') return file;
      throw new MaterialServiceError('INVALID_STATE');
    }
    if (
      observed.size !== file.size ||
      observed.mimeType !== file.declaredMimeType ||
      observed.checksum !== file.clientChecksum
    ) {
      await tx
        .update(fileObject)
        .set({ uploadStatus: 'rejected', scanStatus: 'error', scanResultCode: 'UPLOAD_MISMATCH' })
        .where(eq(fileObject.id, file.id));
      throw new MaterialServiceError('INVALID_STATE');
    }
    await tx
      .update(fileObject)
      .set({ uploadStatus: 'uploaded', uploadedAt: new Date(), updatedAt: new Date() })
      .where(eq(fileObject.id, file.id));
    await tx.execute(sql`
      update material_revision mr
      set status = 'pending_scan', updated_at = now()
      from file_link current_link
      where current_link.file_object_id = ${file.id}
        and current_link.material_revision_id = mr.id
        and mr.status = 'uploading'
        and not exists (
          select 1
          from file_link pending_link
          join file_object pending_file on pending_file.id = pending_link.file_object_id
          where pending_link.material_revision_id = mr.id
            and pending_file.upload_status = 'initiated'
        )
    `);
    return file;
  });
}

export async function reviewMaterialRevision(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  revisionId: string,
  decision: 'accepted' | 'clarification_requested',
  comment: string | null,
  final: boolean,
  requestId?: string,
) {
  const projectAccess = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [revision] = await tx
      .select()
      .from(materialRevision)
      .where(
        and(
          eq(materialRevision.id, revisionId),
          eq(materialRevision.projectId, projectAccess.projectId),
          eq(materialRevision.workspaceId, tenant.workspaceId),
        ),
      )
      .for('update')
      .limit(1);
    if (!revision || revision.status !== 'submitted') {
      throw new MaterialServiceError('NOT_FOUND');
    }
    if (decision === 'clarification_requested' && !comment?.trim()) {
      throw new MaterialServiceError('INVALID_STATE');
    }
    if (decision === 'accepted') {
      const previous = await tx
        .select({ id: materialRevision.id })
        .from(materialRevision)
        .where(
          and(
            eq(materialRevision.materialId, revision.materialId),
            eq(materialRevision.status, 'accepted'),
          ),
        );
      await tx
        .update(materialRevision)
        .set({ status: 'replaced', updatedAt: new Date() })
        .where(
          and(
            eq(materialRevision.materialId, revision.materialId),
            eq(materialRevision.status, 'accepted'),
          ),
        );
      if (previous.length > 0) {
        await tx
          .update(fileLink)
          .set({ isCurrent: false })
          .where(
            inArray(
              fileLink.materialRevisionId,
              previous.map((item) => item.id),
            ),
          );
      }
      await tx
        .update(fileLink)
        .set({ isCurrent: true })
        .where(eq(fileLink.materialRevisionId, revision.id));
    }
    await tx
      .update(materialRevision)
      .set({
        status: decision,
        reviewComment: comment?.trim() || null,
        acceptedByUserId: decision === 'accepted' ? tenant.userId : null,
        acceptedAt: decision === 'accepted' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(materialRevision.id, revision.id));
    await tx
      .update(material)
      .set({
        status: decision === 'accepted' ? 'accepted' : 'clarification',
        currentRevisionId: decision === 'accepted' ? revision.id : null,
        finalAt: decision === 'accepted' && final ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(material.id, revision.materialId), eq(material.workspaceId, tenant.workspaceId)),
      );
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: `material.${decision}`,
      entityType: 'material_revision',
      entityId: revision.id,
      requestId,
      metadata: { revision: revision.revision },
    });
  });
}
