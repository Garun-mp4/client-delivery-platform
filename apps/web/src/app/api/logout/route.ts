import { NextResponse } from 'next/server';

import { auditEvent } from '@garun/db/schema';

import { auth, database } from '@/lib/server';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const response = await auth.api.signOut({ headers: request.headers, asResponse: true });
  if (session) {
    await database.db.insert(auditEvent).values({
      actorUserId: session.user.id,
      action: 'auth.logout',
      entityType: 'session',
      entityId: session.session.id,
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
  }
  const outgoing = new NextResponse(null, {
    status: 303,
    headers: { location: new URL('/login', request.url).toString() },
  });
  for (const cookie of response.headers.getSetCookie())
    outgoing.headers.append('set-cookie', cookie);
  return outgoing;
}
