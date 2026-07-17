import { NextResponse } from 'next/server';

import { publishProject } from '@garun/core/projects';

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
  if (form.get('confirm') !== 'yes') {
    return NextResponse.json({ error: { code: 'CONFIRMATION_REQUIRED' } }, { status: 400 });
  }
  try {
    await publishProject(database, tenant, projectSlug, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?success=published`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?error=publish`,
      ),
      303,
    );
  }
}
