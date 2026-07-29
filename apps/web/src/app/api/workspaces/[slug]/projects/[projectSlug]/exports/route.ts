import { NextResponse } from 'next/server';

import { requestProjectExport } from '@garun/core/exports';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { allowSensitiveRequest } from '@/lib/rate-limit';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const allowed = await allowSensitiveRequest(
    'project-export',
    `${tenant.workspaceId}:${tenant.userId}`,
    3,
    60 * 60,
  );
  if (!allowed) {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/export?error=rate`,
      ),
      303,
    );
  }
  const form = await request.formData();
  const idempotencyKey = form.get('idempotencyKey');
  if (typeof idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  }
  try {
    await requestProjectExport(
      database,
      tenant,
      projectSlug,
      idempotencyKey,
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/export?requested=1`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/export?error=request`,
      ),
      303,
    );
  }
}
