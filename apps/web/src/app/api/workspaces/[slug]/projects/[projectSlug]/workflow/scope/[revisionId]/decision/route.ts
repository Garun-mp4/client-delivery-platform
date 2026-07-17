import { NextResponse } from 'next/server';

import { decideScopeRevision } from '@garun/core/workflow';

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
  const decision = form.get('decision');
  const comment = form.get('comment');
  try {
    if (decision !== 'agreed' && decision !== 'changes_requested') throw new Error('INVALID');
    await decideScopeRevision(
      database,
      tenant,
      projectSlug,
      revisionId,
      decision,
      typeof comment === 'string' ? comment : null,
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?success=scope-decided`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?error=scope-decision`,
      ),
      303,
    );
  }
}
