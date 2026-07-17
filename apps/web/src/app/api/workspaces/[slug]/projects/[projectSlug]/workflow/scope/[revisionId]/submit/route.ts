import { NextResponse } from 'next/server';

import { submitScopeRevision } from '@garun/core/workflow';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; revisionId: string }> },
) {
  const { slug, projectSlug, revisionId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const approverUserId = form.get('approverUserId');
  try {
    if (typeof approverUserId !== 'string') throw new Error('INVALID');
    await submitScopeRevision(database, tenant, projectSlug, revisionId, approverUserId, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?success=scope-submitted`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?error=scope-submit`,
      ),
      303,
    );
  }
}
