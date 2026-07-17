import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { acceptInvitation, createInvitationSessionResponse, InvitationError } from '@garun/auth';
import { user, workspace } from '@garun/db/schema';

import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';
import { allowSensitiveRequest } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get('token');
  if (typeof token !== 'string')
    return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, '/invite/invalid'), 303);
  const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await allowSensitiveRequest('invitation-accept', source, 20, 300))) {
    return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, '/invite/invalid'), 303);
  }
  let accepted: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    accepted = await acceptInvitation(database, token, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
  } catch (error) {
    const path =
      error instanceof InvitationError && error.code === 'INVITATION_EXPIRED'
        ? 'expired'
        : 'invalid';
    return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, `/invite/${path}`), 303);
  }

  const [acceptedIdentity] = await database.db
    .select({ email: user.email, workspaceSlug: workspace.slug })
    .from(user)
    .innerJoin(workspace, eq(workspace.id, accepted.workspaceId))
    .where(eq(user.id, accepted.userId))
    .limit(1);
  if (!acceptedIdentity)
    return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, '/invite/accepted'), 303);

  try {
    return await createInvitationSessionResponse(database.db, environment, {
      email: acceptedIdentity.email,
      callbackURL: `/workspace/${acceptedIdentity.workspaceSlug}`,
      headers: new Headers(request.headers),
    });
  } catch {
    return NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, '/invite/accepted'), 303);
  }
}
