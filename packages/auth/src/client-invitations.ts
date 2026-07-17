import { and, eq } from 'drizzle-orm';

import {
  canAccessProject,
  createOneTimeToken,
  hashOneTimeToken,
  maskEmail,
  normalizeEmail,
  resolveProjectAccess,
  type TenantContext,
} from '@garun/core';
import type { DatabaseClient } from '@garun/db';
import {
  auditEvent,
  clientInvitationContext,
  invitation,
  invitationProjectGrant,
  project,
} from '@garun/db/schema';

import { InvitationError } from './invitations';
import { enqueueEmail } from './outbox';

export async function createClientProjectInvitation(
  client: DatabaseClient,
  tenant: TenantContext,
  input: {
    email: string;
    projectSlug: string;
    projectRole: 'client' | 'observer';
    companyRole: 'primary' | 'member';
    canApprove: boolean;
    appUrl: string;
    encryptionKey: string;
    ttlHours: number;
  },
  request: { readonly requestId?: string } = {},
) {
  const access = await resolveProjectAccess(client.db, tenant, input.projectSlug);
  if (!canAccessProject(access, 'project.members.manage')) {
    throw new InvitationError('FORBIDDEN');
  }
  const email = normalizeEmail(input.email);
  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);

  return client.db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: project.id, companyId: project.clientCompanyId, status: project.status })
      .from(project)
      .where(and(eq(project.id, access!.projectId), eq(project.workspaceId, tenant.workspaceId)))
      .limit(1);
    if (!target || target.status === 'draft' || target.status === 'archived') {
      throw new InvitationError('INVITATION_INVALID');
    }
    const [created] = await tx
      .insert(invitation)
      .values({
        workspaceId: tenant.workspaceId,
        email,
        role: 'member',
        tokenHash,
        expiresAt,
        invitedById: tenant.userId,
      })
      .returning({ id: invitation.id });
    if (!created) throw new Error('INVITATION_INSERT_FAILED');
    await tx.insert(clientInvitationContext).values({
      invitationId: created.id,
      workspaceId: tenant.workspaceId,
      clientCompanyId: target.companyId,
      role: input.companyRole,
      canApprove: input.canApprove,
    });
    await tx.insert(invitationProjectGrant).values({
      invitationId: created.id,
      workspaceId: tenant.workspaceId,
      projectId: target.id,
      role: input.projectRole,
    });
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project_invitation.created',
      entityType: 'invitation',
      entityId: created.id,
      requestId: request.requestId,
      metadata: { emailMask: maskEmail(email) },
    });
    await enqueueEmail(tx, {
      workspaceId: tenant.workspaceId,
      eventType: 'project_invitation.email.requested',
      aggregateType: 'invitation',
      aggregateId: created.id,
      payload: { template: 'project-invitation', invitationId: created.id },
      secret: new URL(`/invite/${token}`, input.appUrl).toString(),
      encryptionKey: input.encryptionKey,
    });
    return { id: created.id, expiresAt };
  });
}
