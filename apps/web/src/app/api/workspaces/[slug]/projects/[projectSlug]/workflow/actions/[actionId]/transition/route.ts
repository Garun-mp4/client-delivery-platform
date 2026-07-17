import { NextResponse } from 'next/server';

import { transitionAction, type ActionStatus } from '@garun/core/workflow';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; actionId: string }> },
) {
  const { slug, projectSlug, actionId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const status = form.get('status');
  try {
    if (!['in_progress', 'done', 'cancelled'].includes(String(status))) throw new Error('INVALID');
    await transitionAction(database, tenant, projectSlug, actionId, status as ActionStatus, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?success=action-updated`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?error=action-transition`,
      ),
      303,
    );
  }
}
