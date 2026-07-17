import { NextResponse } from 'next/server';

import { can } from '@garun/core/identity';
import { createProject, parseProjectInput } from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant || !can(tenant, 'projects.create')) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  try {
    const input = parseProjectInput(formRecord(await request.formData()));
    const created = await createProject(database, tenant, input, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${created.slug}?success=created`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/projects?error=create`),
      303,
    );
  }
}
