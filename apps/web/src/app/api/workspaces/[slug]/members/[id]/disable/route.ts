import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { can } from '@garun/core/identity';
import { auditEvent, session, workspaceMembership } from '@garun/db/schema';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant || !can(tenant, 'members.manage'))
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  if (form.get('confirm') !== 'yes')
    return NextResponse.json({ error: { code: 'CONFIRMATION_REQUIRED' } }, { status: 400 });
  const [target] = await database.db
    .select({
      id: workspaceMembership.id,
      userId: workspaceMembership.userId,
      role: workspaceMembership.role,
    })
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.id, id),
        eq(workspaceMembership.workspaceId, tenant.workspaceId),
        eq(workspaceMembership.status, 'active'),
      ),
    )
    .limit(1);
  if (!target || target.role === 'owner')
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  await database.db.transaction(async (tx) => {
    await tx
      .update(workspaceMembership)
      .set({ status: 'disabled', disabledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(workspaceMembership.id, target.id),
          eq(workspaceMembership.workspaceId, tenant.workspaceId),
        ),
      );
    await tx.delete(session).where(eq(session.userId, target.userId));
    await tx.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'membership.disabled',
      entityType: 'workspace_membership',
      entityId: target.id,
      requestId: request.headers.get('x-request-id') ?? undefined,
      metadata: { targetUserId: target.userId },
    });
  });
  return NextResponse.redirect(
    publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/access?success=disabled`),
    303,
  );
}
