import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { auditEvent, session } from '@garun/db/schema';

import { publicAppUrl } from '@/lib/public-url';
import { auth, database, environment } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await auth.api.getSession({ headers: request.headers });
  if (!identity) return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  const form = await request.formData();
  if (form.get('confirm') !== 'yes')
    return NextResponse.json({ error: { code: 'CONFIRMATION_REQUIRED' } }, { status: 400 });
  const { id } = await context.params;
  const [revoked] = await database.db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, identity.user.id)))
    .returning({ id: session.id });
  if (!revoked) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  await database.db.insert(auditEvent).values({
    actorUserId: identity.user.id,
    action: 'session.revoked',
    entityType: 'session',
    entityId: revoked.id,
    requestId: request.headers.get('x-request-id') ?? undefined,
  });
  return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, '/workspace'), 303);
}
