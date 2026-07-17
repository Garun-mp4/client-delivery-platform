import { NextResponse } from 'next/server';

import { createScopeRevision, parseScopeRevisionInput } from '@garun/core/workflow';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    await createScopeRevision(
      database,
      tenant,
      projectSlug,
      parseScopeRevisionInput(formRecord(await request.formData())),
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?success=scope-created`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?error=scope`,
      ),
      303,
    );
  }
}
