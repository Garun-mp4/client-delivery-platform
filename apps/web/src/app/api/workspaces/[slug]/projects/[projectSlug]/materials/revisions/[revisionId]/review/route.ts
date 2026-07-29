import { NextResponse } from 'next/server';

import { reviewMaterialRevision } from '@garun/core/materials';

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
  try {
    await reviewMaterialRevision(
      database,
      tenant,
      projectSlug,
      revisionId,
      form.get('decision') === 'accepted' ? 'accepted' : 'clarification_requested',
      typeof form.get('comment') === 'string' ? String(form.get('comment')) : null,
      form.get('final') === 'yes',
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/materials?success=reviewed`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/materials?error=review`,
      ),
      303,
    );
  }
}
