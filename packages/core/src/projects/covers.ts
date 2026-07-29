import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  auditEvent,
  fileObject,
  projectCoverAsset,
  projectCoverCapture,
  siteVersion,
} from '@garun/db/schema';
import { validateUploadDeclaration } from '@garun/storage';

import { isOwner } from '../identity/policies';
import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from './policies';

export const PROJECT_COVER_MAX_BYTES = 10 * 1024 * 1024;
export const projectCoverMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ProjectCoverKind = 'manual' | 'automatic';

export function resolveProjectCoverKind(kinds: readonly ProjectCoverKind[]) {
  return kinds.includes('manual')
    ? ('manual' as const)
    : kinds.includes('automatic')
      ? ('automatic' as const)
      : null;
}

export class ProjectCoverError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_STATE' | 'QUOTA_EXCEEDED') {
    super(code);
    this.name = 'ProjectCoverError';
  }
}

interface UploadInput {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
  readonly idempotencyKey: string;
}

function requireText(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new ProjectCoverError('INVALID_INPUT');
  }
  return value.trim();
}

export function parseProjectCoverUpload(
  value: unknown,
  idempotencyKey: unknown,
  maxBytes = PROJECT_COVER_MAX_BYTES,
): UploadInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectCoverError('INVALID_INPUT');
  }
  const input = value as Record<string, unknown>;
  const mimeType = requireText(input.mimeType, 100);
  const size = input.size;
  const checksum = requireText(input.checksum, 64).toLowerCase();
  if (
    !projectCoverMimeTypes.includes(mimeType as (typeof projectCoverMimeTypes)[number]) ||
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > maxBytes ||
    !/^[a-f0-9]{64}$/.test(checksum)
  ) {
    throw new ProjectCoverError('INVALID_INPUT');
  }
  let normalizedName: string;
  try {
    normalizedName = validateUploadDeclaration({
      name: requireText(input.name, 240),
      mimeType,
      size,
      maxBytes,
    }).normalizedName;
  } catch {
    throw new ProjectCoverError('INVALID_INPUT');
  }
  return {
    name: normalizedName,
    mimeType,
    size,
    checksum,
    idempotencyKey: requireText(idempotencyKey, 100),
  };
}

async function access(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  permission: 'project.view' | 'project.edit',
) {
  const resolved = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(resolved, permission)) throw new ProjectCoverError('NOT_FOUND');
  return resolved!;
}

export async function initiateProjectCoverUpload(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  input: UploadInput,
  options: {
    readonly maxWorkspaceBytes: number;
    readonly uploadExpiresAt: Date;
    readonly requestId?: string;
  },
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [usage] = await tx
      .select({ bytes: sql<number>`coalesce(sum(${fileObject.size}), 0)` })
      .from(fileObject)
      .where(
        and(eq(fileObject.workspaceId, tenant.workspaceId), ne(fileObject.uploadStatus, 'deleted')),
      );
    if (Number(usage?.bytes ?? 0) + input.size > options.maxWorkspaceBytes) {
      throw new ProjectCoverError('QUOTA_EXCEEDED');
    }
    const id = randomUUID();
    const storageKey = `${tenant.workspaceId}/${allowed.projectId}/${id}/original`;
    const [created] = await tx
      .insert(fileObject)
      .values({
        id,
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        storageKey,
        originalName: input.name,
        normalizedName: input.name,
        declaredMimeType: input.mimeType,
        size: input.size,
        clientChecksum: input.checksum,
        uploadSessionKey: `project-cover:${input.idempotencyKey}`,
        uploadedByUserId: tenant.userId,
        uploadExpiresAt: options.uploadExpiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: fileObject.id, storageKey: fileObject.storageKey });
    if (!created) {
      const [existing] = await tx
        .select({
          id: fileObject.id,
          storageKey: fileObject.storageKey,
          uploadStatus: fileObject.uploadStatus,
          originalName: fileObject.originalName,
          declaredMimeType: fileObject.declaredMimeType,
          size: fileObject.size,
          clientChecksum: fileObject.clientChecksum,
        })
        .from(fileObject)
        .where(
          and(
            eq(fileObject.workspaceId, tenant.workspaceId),
            eq(fileObject.uploadedByUserId, tenant.userId),
            eq(fileObject.uploadSessionKey, `project-cover:${input.idempotencyKey}`),
            eq(fileObject.projectId, allowed.projectId),
          ),
        )
        .limit(1);
      if (!existing) throw new ProjectCoverError('INVALID_STATE');
      if (
        existing.uploadStatus !== 'initiated' ||
        existing.originalName !== input.name ||
        existing.declaredMimeType !== input.mimeType ||
        existing.size !== input.size ||
        existing.clientChecksum !== input.checksum
      ) {
        throw new ProjectCoverError('INVALID_STATE');
      }
      return existing;
    }
    await tx.insert(projectCoverAsset).values({
      workspaceId: tenant.workspaceId,
      projectId: allowed.projectId,
      kind: 'manual',
      fileObjectId: created.id,
      createdByUserId: tenant.userId,
    });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_cover.upload_started',
      entityType: 'project',
      entityId: allowed.projectId,
      requestId: options.requestId,
    });
    return created;
  });
}

export async function getPendingProjectCoverUpload(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  fileId: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  const [pending] = await client.db
    .select({ id: fileObject.id, storageKey: fileObject.storageKey })
    .from(fileObject)
    .innerJoin(projectCoverAsset, eq(projectCoverAsset.fileObjectId, fileObject.id))
    .where(
      and(
        eq(fileObject.id, fileId),
        eq(fileObject.workspaceId, tenant.workspaceId),
        eq(fileObject.projectId, allowed.projectId),
        eq(fileObject.uploadedByUserId, tenant.userId),
        inArray(fileObject.uploadStatus, ['initiated', 'uploaded', 'scanning', 'available']),
        eq(projectCoverAsset.kind, 'manual'),
      ),
    )
    .limit(1);
  if (!pending) throw new ProjectCoverError('NOT_FOUND');
  return pending;
}

export async function completeProjectCoverUpload(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  fileId: string,
  observed: { readonly size: number; readonly mimeType?: string; readonly checksum?: string },
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [file] = await tx
      .select()
      .from(fileObject)
      .innerJoin(projectCoverAsset, eq(projectCoverAsset.fileObjectId, fileObject.id))
      .where(
        and(
          eq(fileObject.id, fileId),
          eq(fileObject.workspaceId, tenant.workspaceId),
          eq(fileObject.projectId, allowed.projectId),
          eq(fileObject.uploadedByUserId, tenant.userId),
          eq(projectCoverAsset.kind, 'manual'),
        ),
      )
      .for('update')
      .limit(1);
    const target = file?.file_object;
    if (!target) throw new ProjectCoverError('NOT_FOUND');
    if (target.uploadStatus !== 'initiated') {
      if (['uploaded', 'scanning', 'available'].includes(target.uploadStatus)) return;
      throw new ProjectCoverError('INVALID_STATE');
    }
    if (
      observed.size !== target.size ||
      observed.mimeType !== target.declaredMimeType ||
      observed.checksum !== target.clientChecksum
    ) {
      await tx
        .update(fileObject)
        .set({
          uploadStatus: 'rejected',
          scanStatus: 'error',
          scanResultCode: 'UPLOAD_MISMATCH',
          updatedAt: new Date(),
        })
        .where(eq(fileObject.id, target.id));
      throw new ProjectCoverError('INVALID_STATE');
    }
    await tx
      .update(fileObject)
      .set({ uploadStatus: 'uploaded', uploadedAt: new Date(), updatedAt: new Date() })
      .where(eq(fileObject.id, target.id));
  });
}

export async function getProjectCover(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.view');
  const [cover] = await client.db
    .select({
      id: projectCoverAsset.id,
      kind: projectCoverAsset.kind,
      fileId: fileObject.id,
      storageKey: fileObject.storageKey,
      previewStorageKey: fileObject.previewStorageKey,
      mimeType: fileObject.detectedMimeType,
      updatedAt: projectCoverAsset.updatedAt,
    })
    .from(projectCoverAsset)
    .innerJoin(fileObject, eq(fileObject.id, projectCoverAsset.fileObjectId))
    .where(
      and(
        eq(projectCoverAsset.workspaceId, tenant.workspaceId),
        eq(projectCoverAsset.projectId, allowed.projectId),
        eq(projectCoverAsset.isCurrent, true),
        isNull(projectCoverAsset.supersededAt),
        eq(fileObject.uploadStatus, 'available'),
        eq(fileObject.scanStatus, 'clean'),
      ),
    )
    .orderBy(sql`case when ${projectCoverAsset.kind} = 'manual' then 0 else 1 end`)
    .limit(1);
  return cover ?? null;
}

export async function listProjectCoverKinds(
  client: DatabaseClient,
  tenant: TenantContext,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return client.db
    .select({
      projectId: projectCoverAsset.projectId,
      kind: projectCoverAsset.kind,
      updatedAt: projectCoverAsset.updatedAt,
    })
    .from(projectCoverAsset)
    .innerJoin(fileObject, eq(fileObject.id, projectCoverAsset.fileObjectId))
    .where(
      and(
        eq(projectCoverAsset.workspaceId, tenant.workspaceId),
        inArray(projectCoverAsset.projectId, [...projectIds]),
        eq(projectCoverAsset.isCurrent, true),
        isNull(projectCoverAsset.supersededAt),
        eq(fileObject.uploadStatus, 'available'),
        eq(fileObject.scanStatus, 'clean'),
      ),
    )
    .orderBy(desc(projectCoverAsset.createdAt));
}

export async function removeManualProjectCover(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  return client.db.transaction(async (tx) => {
    const [removed] = await tx
      .update(projectCoverAsset)
      .set({ isCurrent: false, supersededAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(projectCoverAsset.workspaceId, tenant.workspaceId),
          eq(projectCoverAsset.projectId, allowed.projectId),
          eq(projectCoverAsset.kind, 'manual'),
          eq(projectCoverAsset.isCurrent, true),
        ),
      )
      .returning({ id: projectCoverAsset.id });
    if (!removed) throw new ProjectCoverError('NOT_FOUND');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_cover.removed',
      entityType: 'project_cover_asset',
      entityId: removed.id,
      requestId,
    });
  });
}

export async function enqueueProjectCoverCapture(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  idempotencyKey: string,
  requestId?: string,
) {
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  const key = requireText(idempotencyKey, 100);
  return client.db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: siteVersion.id })
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.workspaceId, tenant.workspaceId),
          eq(siteVersion.projectId, allowed.projectId),
          eq(siteVersion.clientVisible, true),
          eq(siteVersion.securityStatus, 'safe'),
          eq(siteVersion.availabilityStatus, 'reachable'),
          eq(siteVersion.accessMode, 'public'),
        ),
      )
      .orderBy(desc(siteVersion.versionNumber))
      .limit(1);
    if (!version) throw new ProjectCoverError('INVALID_STATE');
    const [job] = await tx
      .insert(projectCoverCapture)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: allowed.projectId,
        siteVersionId: version.id,
        requestedByUserId: tenant.userId,
        idempotencyKey: key,
      })
      .onConflictDoNothing()
      .returning({ id: projectCoverCapture.id });
    if (job) {
      await tx.insert(auditEvent).values({
        workspaceId: tenant.workspaceId,
        actorUserId: tenant.userId,
        action: 'project_cover.capture_requested',
        entityType: 'project_cover_capture',
        entityId: job.id,
        requestId,
      });
    }
    return job ?? null;
  });
}

export async function getLatestProjectCoverCapture(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  if (!isOwner(tenant)) throw new ProjectCoverError('NOT_FOUND');
  const allowed = await access(client, tenant, projectSlug, 'project.edit');
  const [job] = await client.db
    .select({
      id: projectCoverCapture.id,
      status: projectCoverCapture.status,
      failureCode: projectCoverCapture.failureCode,
      attempts: projectCoverCapture.attempts,
      updatedAt: projectCoverCapture.updatedAt,
    })
    .from(projectCoverCapture)
    .where(
      and(
        eq(projectCoverCapture.workspaceId, tenant.workspaceId),
        eq(projectCoverCapture.projectId, allowed.projectId),
      ),
    )
    .orderBy(desc(projectCoverCapture.createdAt))
    .limit(1);
  return job ?? null;
}
