import { NextResponse } from 'next/server';

import { createClientProjectInvitation } from '@garun/auth';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const email = form.get('email');
  const projectRole = form.get('projectRole');
  const companyRole = form.get('companyRole');
  if (
    typeof email !== 'string' ||
    (projectRole !== 'client' && projectRole !== 'observer') ||
    (companyRole !== 'primary' && companyRole !== 'member')
  ) {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?error=invite`,
      ),
      303,
    );
  }
  try {
    await createClientProjectInvitation(
      database,
      tenant,
      {
        email,
        projectSlug,
        projectRole,
        companyRole,
        canApprove: form.get('canApprove') === 'yes',
        appUrl: environment.PUBLIC_APP_URL,
        encryptionKey: environment.OUTBOX_ENCRYPTION_KEY,
        ttlHours: environment.INVITATION_TTL_HOURS,
      },
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?success=invited`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?error=invite`,
      ),
      303,
    );
  }
}
