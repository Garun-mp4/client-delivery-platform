import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { can, resolveTenantContext } from '@garun/core/identity';
import { auditEvent } from '@garun/db/schema';

import { auth, database } from './server';

export const requireTenantPage = cache(async function requireTenantPage(workspaceSlug: string) {
  const requestHeaders = await headers();
  const identity = await auth.api.getSession({ headers: requestHeaders });
  if (!identity) redirect(`/login?callback=/workspace/${workspaceSlug}`);
  const tenant = await resolveTenantContext(database.db, identity.user.id, workspaceSlug);
  if (!tenant || !can(tenant, 'workspace.view')) {
    await database.db.insert(auditEvent).values({
      actorUserId: identity.user.id,
      action: 'access.denied',
      entityType: 'workspace',
      requestId: requestHeaders.get('x-request-id') ?? undefined,
      metadata: { reasonCode: 'TENANT_CONTEXT_NOT_RESOLVED' },
    });
    notFound();
  }
  return { identity, tenant, requestHeaders };
});
