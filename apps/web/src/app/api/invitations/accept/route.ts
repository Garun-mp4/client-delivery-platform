import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { acceptInvitation, InvitationError } from '@garun/auth';
import { user } from '@garun/db/schema';

import { auth, database } from '@/lib/server';
import { allowSensitiveRequest } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get('token');
  if (typeof token !== 'string')
    return NextResponse.redirect(new URL('/invite/invalid', request.url), 303);
  const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await allowSensitiveRequest('invitation-accept', source, 20, 300))) {
    return NextResponse.redirect(new URL('/invite/invalid', request.url), 303);
  }
  try {
    const accepted = await acceptInvitation(database, token, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    const [acceptedUser] = await database.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, accepted.userId))
      .limit(1);
    if (acceptedUser) {
      await auth.api.signInMagicLink({
        body: {
          email: acceptedUser.email,
          callbackURL: '/workspace',
          errorCallbackURL: '/login?error=link',
        },
        headers: request.headers,
      });
    }
    return NextResponse.redirect(new URL('/invite/accepted', request.url), 303);
  } catch (error) {
    const path =
      error instanceof InvitationError && error.code === 'INVITATION_EXPIRED'
        ? 'expired'
        : 'invalid';
    return NextResponse.redirect(new URL(`/invite/${path}`, request.url), 303);
  }
}
