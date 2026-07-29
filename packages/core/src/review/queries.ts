import { and, asc, desc, eq } from 'drizzle-orm';

import type { DatabaseClient } from '@garun/db';
import {
  comment,
  feedbackItem,
  fileObject,
  projectUpdate,
  siteVersion,
  user,
} from '@garun/db/schema';

import type { TenantContext } from '../identity/tenant';
import { canAccessProject, resolveProjectAccess } from '../projects/policies';
import { ReviewServiceError } from './services';

export async function getProjectReview(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new ReviewServiceError('NOT_FOUND');
  const internal = access!.side === 'internal';
  const [updates, versions, feedback, comments, screenshots] = await Promise.all([
    client.db
      .select()
      .from(projectUpdate)
      .where(
        and(
          eq(projectUpdate.projectId, access!.projectId),
          eq(projectUpdate.workspaceId, tenant.workspaceId),
          internal ? undefined : eq(projectUpdate.visibility, 'client'),
        ),
      )
      .orderBy(desc(projectUpdate.pinnedAt), desc(projectUpdate.publishedAt)),
    client.db
      .select()
      .from(siteVersion)
      .where(
        and(
          eq(siteVersion.projectId, access!.projectId),
          eq(siteVersion.workspaceId, tenant.workspaceId),
          internal ? undefined : eq(siteVersion.clientVisible, true),
        ),
      )
      .orderBy(desc(siteVersion.versionNumber)),
    client.db
      .select()
      .from(feedbackItem)
      .where(
        and(
          eq(feedbackItem.projectId, access!.projectId),
          eq(feedbackItem.workspaceId, tenant.workspaceId),
          internal ? undefined : eq(feedbackItem.visibility, 'client'),
        ),
      )
      .orderBy(desc(feedbackItem.updatedAt)),
    client.db
      .select({
        id: comment.id,
        feedbackItemId: comment.feedbackItemId,
        body: comment.body,
        visibility: comment.visibility,
        editedAt: comment.editedAt,
        deletedAt: comment.deletedAt,
        createdAt: comment.createdAt,
        authorUserId: comment.authorUserId,
        authorName: user.name,
      })
      .from(comment)
      .innerJoin(user, eq(user.id, comment.authorUserId))
      .where(
        and(
          eq(comment.projectId, access!.projectId),
          eq(comment.workspaceId, tenant.workspaceId),
          internal ? undefined : eq(comment.visibility, 'client'),
        ),
      )
      .orderBy(asc(comment.createdAt)),
    client.db
      .select({ id: fileObject.id, name: fileObject.normalizedName })
      .from(fileObject)
      .where(
        and(
          eq(fileObject.projectId, access!.projectId),
          eq(fileObject.workspaceId, tenant.workspaceId),
          eq(fileObject.uploadedByUserId, tenant.userId),
          eq(fileObject.uploadStatus, 'available'),
          eq(fileObject.scanStatus, 'clean'),
        ),
      )
      .orderBy(desc(fileObject.createdAt)),
  ]);
  return {
    access: access!,
    updates,
    versions,
    feedback: feedback.map((item) => ({
      ...item,
      comments: comments.filter((entry) => entry.feedbackItemId === item.id),
    })),
    screenshots,
  };
}

export async function getSiteVersionAccessSecret(
  client: DatabaseClient,
  tenant: TenantContext,
  projectSlug: string,
  versionId: string,
) {
  const access = await resolveProjectAccess(client.db, tenant, projectSlug);
  if (!canAccessProject(access, 'project.view')) throw new ReviewServiceError('NOT_FOUND');
  const [version] = await client.db
    .select({
      id: siteVersion.id,
      name: siteVersion.name,
      accessSecretEncrypted: siteVersion.accessSecretEncrypted,
    })
    .from(siteVersion)
    .where(
      and(
        eq(siteVersion.id, versionId),
        eq(siteVersion.projectId, access!.projectId),
        eq(siteVersion.workspaceId, tenant.workspaceId),
        eq(siteVersion.accessMode, 'password'),
        access!.side === 'client' ? eq(siteVersion.clientVisible, true) : undefined,
        access!.side === 'client' ? eq(siteVersion.securityStatus, 'safe') : undefined,
      ),
    )
    .limit(1);
  if (!version?.accessSecretEncrypted) throw new ReviewServiceError('NOT_FOUND');
  return version;
}
