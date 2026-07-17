import { and, eq } from 'drizzle-orm';

import {
  can,
  createOneTimeToken,
  hashOneTimeToken,
  isExpired,
  maskEmail,
  normalizeEmail,
  type TenantContext,
} from '@garun/core/identity';
import type { DatabaseClient } from '@garun/db';
import { auditEvent, invitation, user, workspaceMembership } from '@garun/db/schema';

import { enqueueEmail } from './outbox';

export type InvitationErrorCode =
  'FORBIDDEN' | 'INVITATION_CONFLICT' | 'INVITATION_INVALID' | 'INVITATION_EXPIRED';

export class InvitationError extends Error {
  constructor(readonly code: InvitationErrorCode) {
    super(code);
    this.name = 'InvitationError';
  }
}

interface RequestContext {
  readonly requestId?: string;
}

export async function createInvitation(
  client: DatabaseClient,
  tenant: TenantContext,
  input: { email: string; appUrl: string; encryptionKey: string; ttlHours: number },
  request: RequestContext = {},
) {
  if (!can(tenant, 'members.invite')) throw new InvitationError('FORBIDDEN');
  const email = normalizeEmail(input.email);
  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);

  return client.db.transaction(async (tx) => {
    const [existingMembership] = await tx
      .select({ id: workspaceMembership.id })
      .from(workspaceMembership)
      .innerJoin(user, eq(user.id, workspaceMembership.userId))
      .where(and(eq(workspaceMembership.workspaceId, tenant.workspaceId), eq(user.email, email)))
      .limit(1);
    if (existingMembership) throw new InvitationError('INVITATION_CONFLICT');

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

    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: created.id,
      requestId: request.requestId,
      metadata: { emailMask: maskEmail(email) },
    });
    const url = new URL(`/invite/${token}`, input.appUrl).toString();
    await enqueueEmail(tx, {
      workspaceId: tenant.workspaceId,
      eventType: 'invitation.email.requested',
      aggregateType: 'invitation',
      aggregateId: created.id,
      payload: { template: 'workspace-invitation', invitationId: created.id },
      secret: url,
      encryptionKey: input.encryptionKey,
    });
    return { id: created.id, expiresAt };
  });
}

export async function revokeInvitation(
  client: DatabaseClient,
  tenant: TenantContext,
  invitationId: string,
  request: RequestContext = {},
) {
  if (!can(tenant, 'members.invite')) throw new InvitationError('FORBIDDEN');
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(invitation)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.workspaceId, tenant.workspaceId),
          eq(invitation.status, 'pending'),
        ),
      )
      .returning({ id: invitation.id });
    if (!updated) throw new InvitationError('INVITATION_INVALID');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: updated.id,
      requestId: request.requestId,
    });
  });
}

export async function resendInvitation(
  client: DatabaseClient,
  tenant: TenantContext,
  invitationId: string,
  input: { appUrl: string; encryptionKey: string; ttlHours: number },
  request: RequestContext = {},
) {
  if (!can(tenant, 'members.invite')) throw new InvitationError('FORBIDDEN');
  const token = createOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);
  return client.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(invitation)
      .set({ tokenHash, expiresAt, updatedAt: new Date() })
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.workspaceId, tenant.workspaceId),
          eq(invitation.status, 'pending'),
        ),
      )
      .returning({ id: invitation.id });
    if (!updated) throw new InvitationError('INVITATION_INVALID');
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: updated.id,
      requestId: request.requestId,
    });
    await enqueueEmail(tx, {
      workspaceId: tenant.workspaceId,
      eventType: 'invitation.email.requested',
      aggregateType: 'invitation',
      aggregateId: updated.id,
      payload: { template: 'workspace-invitation', invitationId: updated.id },
      secret: new URL(`/invite/${token}`, input.appUrl).toString(),
      encryptionKey: input.encryptionKey,
    });
    return { expiresAt };
  });
}

export async function acceptInvitation(
  client: DatabaseClient,
  rawToken: string,
  request: RequestContext = {},
) {
  const tokenHash = hashOneTimeToken(rawToken);
  return client.db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash))
      .for('update')
      .limit(1);
    if (!pending || pending.status !== 'pending') throw new InvitationError('INVITATION_INVALID');
    if (isExpired(pending.expiresAt)) {
      await tx
        .update(invitation)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(invitation.id, pending.id));
      throw new InvitationError('INVITATION_EXPIRED');
    }

    let [acceptedUser] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, pending.email))
      .limit(1);
    if (!acceptedUser) {
      [acceptedUser] = await tx
        .insert(user)
        .values({
          name: pending.email.split('@')[0] ?? 'Участник',
          email: pending.email,
          emailVerified: true,
        })
        .returning({ id: user.id });
    }
    if (!acceptedUser) throw new Error('INVITATION_USER_FAILED');

    const [membership] = await tx
      .insert(workspaceMembership)
      .values({ workspaceId: pending.workspaceId, userId: acceptedUser.id, role: pending.role })
      .onConflictDoNothing()
      .returning({ id: workspaceMembership.id });
    if (!membership) throw new InvitationError('INVITATION_CONFLICT');
    await tx
      .update(invitation)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedById: acceptedUser.id,
        updatedAt: new Date(),
      })
      .where(and(eq(invitation.id, pending.id), eq(invitation.status, 'pending')));
    await tx.insert(auditEvent).values([
      {
        workspaceId: pending.workspaceId,
        actorUserId: acceptedUser.id,
        action: 'invitation.accepted',
        entityType: 'invitation',
        entityId: pending.id,
        requestId: request.requestId,
      },
      {
        workspaceId: pending.workspaceId,
        actorUserId: acceptedUser.id,
        action: 'membership.created',
        entityType: 'workspace_membership',
        entityId: membership.id,
        requestId: request.requestId,
      },
    ]);
    return { userId: acceptedUser.id, workspaceId: pending.workspaceId };
  });
}

export async function inspectInvitation(client: DatabaseClient, rawToken: string) {
  const [row] = await client.db
    .select({ status: invitation.status, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(eq(invitation.tokenHash, hashOneTimeToken(rawToken)))
    .limit(1);
  if (!row) return 'invalid' as const;
  if (row.status === 'pending' && isExpired(row.expiresAt)) return 'expired' as const;
  return row.status;
}
