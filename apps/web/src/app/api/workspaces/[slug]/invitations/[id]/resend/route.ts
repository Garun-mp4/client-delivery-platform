import { NextResponse } from 'next/server';
import { resendInvitation } from '@garun/auth';
import { tenantFromRequest } from '@/lib/access';
import { database, environment } from '@/lib/server';
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    await resendInvitation(
      database,
      tenant,
      id,
      {
        appUrl: environment.PUBLIC_APP_URL,
        encryptionKey: environment.OUTBOX_ENCRYPTION_KEY,
        ttlHours: environment.INVITATION_TTL_HOURS,
      },
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(new URL(`/workspace/${slug}?success=resent`, request.url), 303);
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
