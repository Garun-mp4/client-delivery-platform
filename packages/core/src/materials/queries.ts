import { and, asc, desc, eq, isNotNull, ne, or } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import { fileLink, fileObject, material, materialRevision, questionnaire } from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { MaterialServiceError } from './services';

export async function listProjectMaterials(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  filters: { readonly query?: string; readonly category?: string } = {},
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new MaterialServiceError('NOT_FOUND');
  const items = await client.db
    .select()
    .from(material)
    .where(
      and(eq(material.projectId, access!.projectId), eq(material.workspaceId, tenant.workspaceId)),
    )
    .orderBy(asc(material.category), asc(material.dueAt), asc(material.title));
  const revisions = await client.db
    .select({
      id: materialRevision.id,
      materialId: materialRevision.materialId,
      revision: materialRevision.revision,
      status: materialRevision.status,
      content: materialRevision.content,
      reviewComment: materialRevision.reviewComment,
      submittedAt: materialRevision.submittedAt,
      acceptedAt: materialRevision.acceptedAt,
    })
    .from(materialRevision)
    .where(
      and(
        eq(materialRevision.projectId, access!.projectId),
        eq(materialRevision.workspaceId, tenant.workspaceId),
      ),
    )
    .orderBy(desc(materialRevision.revision));
  const files = await client.db
    .select({
      id: fileObject.id,
      revisionId: fileLink.materialRevisionId,
      status: fileObject.uploadStatus,
      name: fileObject.normalizedName,
      mimeType: fileObject.detectedMimeType,
      size: fileObject.size,
    })
    .from(fileLink)
    .innerJoin(
      fileObject,
      and(
        eq(fileObject.id, fileLink.fileObjectId),
        eq(fileObject.projectId, access!.projectId),
        eq(fileObject.workspaceId, tenant.workspaceId),
      ),
    );
  const normalizedQuery = filters.query?.trim().toLocaleLowerCase('ru-RU').slice(0, 120) ?? '';
  const normalizedCategory = filters.category?.trim().slice(0, 120) ?? '';
  const filteredItems = items.filter((item) => {
    if (normalizedCategory && item.category !== normalizedCategory) return false;
    if (!normalizedQuery) return true;
    const materialFiles = revisions
      .filter((revision) => revision.materialId === item.id)
      .flatMap((revision) =>
        files.filter((file) => file.revisionId === revision.id && file.status === 'available'),
      );
    return [item.title, item.category ?? '', ...materialFiles.map((file) => file.name)]
      .join(' ')
      .toLocaleLowerCase('ru-RU')
      .includes(normalizedQuery);
  });
  return {
    access: access!,
    categories: [...new Set(items.map((item) => item.category).filter((value) => value !== null))],
    materials: filteredItems.map((item) => ({
      ...item,
      revisions: revisions
        .filter((revision) => revision.materialId === item.id)
        .map((revision) => ({
          ...revision,
          files: files
            .filter((file) => file.revisionId === revision.id)
            .map((file) =>
              file.status === 'available'
                ? file
                : { id: file.id, revisionId: file.revisionId, status: file.status },
            ),
        })),
    })),
  };
}

export async function getAvailableFile(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  fileId: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new MaterialServiceError('NOT_FOUND');
  const [file] = await client.db
    .select({
      id: fileObject.id,
      workspaceId: fileObject.workspaceId,
      projectId: fileObject.projectId,
      storageKey: fileObject.storageKey,
      previewStorageKey: fileObject.previewStorageKey,
      normalizedName: fileObject.normalizedName,
      detectedMimeType: fileObject.detectedMimeType,
    })
    .from(fileLink)
    .innerJoin(fileObject, eq(fileObject.id, fileLink.fileObjectId))
    .leftJoin(
      questionnaire,
      and(
        eq(questionnaire.id, fileLink.questionnaireId),
        eq(questionnaire.workspaceId, tenant.workspaceId),
      ),
    )
    .where(
      and(
        eq(fileObject.id, fileId),
        eq(fileObject.projectId, access!.projectId),
        eq(fileObject.workspaceId, tenant.workspaceId),
        eq(fileObject.uploadStatus, 'available'),
        eq(fileObject.scanStatus, 'clean'),
        access!.side === 'client'
          ? eq(fileObject.uploadedByUserId, tenant.userId)
          : or(
              isNotNull(fileLink.materialRevisionId),
              and(isNotNull(fileLink.questionnaireId), ne(questionnaire.status, 'open')),
            ),
      ),
    )
    .limit(1);
  if (!file) throw new MaterialServiceError('NOT_FOUND');
  return file;
}

export async function getPendingUploadForCompletion(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  fileId: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view') || access?.side !== 'client') {
    throw new MaterialServiceError('NOT_FOUND');
  }
  const [file] = await client.db
    .select({
      id: fileObject.id,
      storageKey: fileObject.storageKey,
    })
    .from(fileObject)
    .where(
      and(
        eq(fileObject.id, fileId),
        eq(fileObject.projectId, access.projectId),
        eq(fileObject.workspaceId, tenant.workspaceId),
        eq(fileObject.uploadedByUserId, tenant.userId),
        eq(fileObject.uploadStatus, 'initiated'),
      ),
    )
    .limit(1);
  if (!file) throw new MaterialServiceError('NOT_FOUND');
  return file;
}
