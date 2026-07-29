import { and, desc, eq, gt, or } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import { auditEvent, exportJob, outboxEvent } from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';

export class ProjectExportError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'NOT_READY' | 'EXPIRED') {
    super(code);
    this.name = 'ProjectExportError';
  }
}

async function requireExportAccess(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.export')) throw new ProjectExportError('NOT_FOUND');
  return access!;
}

function effectiveAudience(
  access: NonNullable<Awaited<ReturnType<typeof resolveProjectAccess>>>,
): 'internal' | 'client' {
  return access.side === 'internal' && canAccessProject(access, 'project.view.internal')
    ? 'internal'
    : 'client';
}

export async function requestProjectExport(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  idempotencyKey: string,
  requestId?: string,
) {
  const access = await requireExportAccess(client, tenant, projectSlug);
  const audience = effectiveAudience(access);
  return client.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(exportJob)
      .values({
        workspaceId: tenant.workspaceId,
        projectId: access.projectId,
        requestedByUserId: tenant.userId,
        audience,
        idempotencyKey,
      })
      .onConflictDoNothing({
        target: [exportJob.workspaceId, exportJob.idempotencyKey],
      })
      .returning();
    if (created) {
      await tx.insert(auditEvent).values({
        workspaceId: tenant.workspaceId,
        actorUserId: tenant.userId,
        action: 'project.export_requested',
        entityType: 'project',
        entityId: access.projectId,
        requestId,
        metadata: { source: audience },
      });
      await tx.insert(outboxEvent).values({
        workspaceId: tenant.workspaceId,
        eventType: 'project.export_requested',
        aggregateType: 'project',
        aggregateId: access.projectId,
        payload: {
          template: 'domain-event',
          projectId: access.projectId,
          entityType: 'export_job',
        },
      });
      return created;
    }
    const [existing] = await tx
      .select()
      .from(exportJob)
      .where(
        and(
          eq(exportJob.workspaceId, tenant.workspaceId),
          eq(exportJob.idempotencyKey, idempotencyKey),
          eq(exportJob.projectId, access.projectId),
          eq(exportJob.requestedByUserId, tenant.userId),
        ),
      )
      .limit(1);
    if (!existing) throw new ProjectExportError('NOT_FOUND');
    return existing;
  });
}

export async function listProjectExports(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await requireExportAccess(client, tenant, projectSlug);
  return client.db
    .select({
      id: exportJob.id,
      status: exportJob.status,
      audience: exportJob.audience,
      attachmentCount: exportJob.attachmentCount,
      artifactSize: exportJob.artifactSize,
      failureCode: exportJob.failureCode,
      createdAt: exportJob.createdAt,
      completedAt: exportJob.completedAt,
      expiresAt: exportJob.expiresAt,
    })
    .from(exportJob)
    .where(
      and(
        eq(exportJob.workspaceId, tenant.workspaceId),
        eq(exportJob.projectId, access.projectId),
        eq(exportJob.requestedByUserId, tenant.userId),
      ),
    )
    .orderBy(desc(exportJob.createdAt))
    .limit(10);
}

export async function getProjectExportArtifact(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  exportId: string,
) {
  const access = await requireExportAccess(client, tenant, projectSlug);
  const audience = effectiveAudience(access);
  const [job] = await client.db
    .select()
    .from(exportJob)
    .where(
      and(
        eq(exportJob.id, exportId),
        eq(exportJob.workspaceId, tenant.workspaceId),
        eq(exportJob.projectId, access.projectId),
        eq(exportJob.requestedByUserId, tenant.userId),
        eq(exportJob.status, 'succeeded'),
        gt(exportJob.expiresAt, new Date()),
        or(eq(exportJob.audience, 'client'), eq(exportJob.audience, audience)),
      ),
    )
    .limit(1);
  if (!job?.artifactStorageKey || !job.artifactSha256 || !job.expiresAt) {
    throw new ProjectExportError('NOT_READY');
  }
  return {
    exportId: job.id,
    storageKey: job.artifactStorageKey,
    checksum: job.artifactSha256,
    expiresAt: job.expiresAt,
    filename: `${projectSlug}-history-${job.id.slice(0, 8)}.tar.gz`,
  };
}
