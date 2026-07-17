import { NextResponse } from 'next/server';

import { stageStatuses, transitionStage } from '@garun/core/workflow';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; stageId: string }> },
) {
  const { slug, projectSlug, stageId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const status = form.get('status');
  try {
    if (
      typeof status !== 'string' ||
      !stageStatuses.includes(status as (typeof stageStatuses)[number])
    ) {
      throw new Error('INVALID');
    }
    await transitionStage(
      database,
      tenant,
      projectSlug,
      stageId,
      status as (typeof stageStatuses)[number],
      {
        resultSummary:
          typeof form.get('resultSummary') === 'string'
            ? (form.get('resultSummary') as string)
            : null,
        skipReason:
          typeof form.get('skipReason') === 'string' ? (form.get('skipReason') as string) : null,
      },
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?success=stage-updated`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/workflow?error=stage-transition`,
      ),
      303,
    );
  }
}
