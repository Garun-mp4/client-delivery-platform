import { NextResponse } from 'next/server';

import { createApprovalRequest, parseCreateApprovalRequestInput } from '@garun/core/approvals';

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
    const form = await request.formData();
    const record = formRecord(form);
    record.approverUserIds = form.getAll('approverUserIds');
    const target = form.get('target');
    if (typeof target !== 'string') throw new Error('INVALID_TARGET');
    const separator = target.indexOf(':');
    record.entityType = separator === -1 ? target : target.slice(0, separator);
    record.entityId = separator === -1 ? '' : target.slice(separator + 1);
    await createApprovalRequest(
      database,
      tenant,
      projectSlug,
      parseCreateApprovalRequestInput(record),
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?success=requested`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/approvals?error=request`,
      ),
      303,
    );
  }
}
