import { NextResponse } from 'next/server';

import { publishSiteVersion } from '@garun/core/review';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; versionId: string }> },
) {
  const { slug, projectSlug, versionId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const form = await request.formData();
    await publishSiteVersion(
      database,
      tenant,
      projectSlug,
      versionId,
      form.get('acknowledgeUnreachable') === 'yes',
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?success=published`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?error=publish`,
      ),
      303,
    );
  }
}
