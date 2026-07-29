import { NextResponse } from 'next/server';

import { submitMaterialContent } from '@garun/core/materials';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; materialId: string }> },
) {
  const { slug, projectSlug, materialId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  try {
    await submitMaterialContent(
      database,
      tenant,
      projectSlug,
      materialId,
      {
        value: String(form.get('value') ?? ''),
        idempotencyKey: String(form.get('idempotencyKey') ?? ''),
      },
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/materials?success=submitted`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/materials?error=submit`,
      ),
      303,
    );
  }
}
