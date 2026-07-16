import { NextResponse } from 'next/server';

import { createInvitation, InvitationError } from '@garun/auth';
import { can } from '@garun/core/identity';

import { tenantFromRequest } from '@/lib/access';
import { allowSensitiveRequest } from '@/lib/rate-limit';
import { database, environment } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant || !can(tenant, 'members.invite')) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  if (!(await allowSensitiveRequest('invitation-create', tenant.userId, 20, 3600))) {
    return NextResponse.redirect(new URL(`/workspace/${slug}?error=rate_limit`, request.url), 303);
  }
  const form = await request.formData();
  const email = form.get('email');
  if (typeof email !== 'string')
    return NextResponse.redirect(new URL(`/workspace/${slug}?error=invite`, request.url), 303);
  try {
    await createInvitation(
      database,
      tenant,
      {
        email,
        appUrl: environment.PUBLIC_APP_URL,
        encryptionKey: environment.OUTBOX_ENCRYPTION_KEY,
        ttlHours: environment.INVITATION_TTL_HOURS,
      },
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(new URL(`/workspace/${slug}?success=invite`, request.url), 303);
  } catch (error) {
    const code = error instanceof InvitationError ? error.code.toLowerCase() : 'invite';
    return NextResponse.redirect(new URL(`/workspace/${slug}?error=${code}`, request.url), 303);
  }
}
