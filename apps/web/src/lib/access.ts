import { resolveTenantContext } from '@garun/core/identity';
import { auditEvent } from '@garun/db/schema';

import { auth, database } from './server';

export async function tenantFromRequest(request: Request, slug: string) {
  const identity = await auth.api.getSession({ headers: request.headers });
  if (!identity) return null;
  const tenant = await resolveTenantContext(database.db, identity.user.id, slug);
  if (!tenant) {
    await database.db.insert(auditEvent).values({
      actorUserId: identity.user.id,
      action: 'access.denied',
      entityType: 'workspace',
      requestId: request.headers.get('x-request-id') ?? undefined,
      metadata: { reasonCode: 'TENANT_CONTEXT_NOT_RESOLVED' },
    });
  }
  return tenant;
}
