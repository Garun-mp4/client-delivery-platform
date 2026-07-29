import { createHmac } from 'node:crypto';

import { NextResponse } from 'next/server';

import { decideApprovalRequest, parseDecisionInput } from '@garun/core/approvals';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
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
    const input = parseDecisionInput(formRecord(await request.formData()));
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const networkFingerprint = forwarded
      ? createHmac('sha256', environment.BETTER_AUTH_SECRET)
          .update(`${tenant.workspaceId}:${forwarded}`)
          .digest('hex')
      : undefined;
    await decideApprovalRequest(
      database,
      tenant,
      projectSlug,
      requestId,
      {
        ...input,
        networkFingerprint,
        userAgent: request.headers.get('user-agent') ?? undefined,
      },
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?success=decided`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?error=decision`,
      ),
      303,
    );
  }
}
