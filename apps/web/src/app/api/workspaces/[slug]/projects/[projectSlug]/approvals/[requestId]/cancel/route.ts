import { NextResponse } from 'next/server';

import { cancelApprovalRequest } from '@garun/core/approvals';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; requestId: string }> },
) {
  const { slug, projectSlug, requestId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const reason = (await request.formData()).get('reason');
    if (typeof reason !== 'string') throw new Error('INVALID');
    await cancelApprovalRequest(database, tenant, projectSlug, requestId, reason, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?success=cancelled`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?error=cancel`,
      ),
      303,
    );
  }
}
