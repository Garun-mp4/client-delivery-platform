import { NextResponse } from 'next/server';

import { addFeedbackComment, parseCommentBody } from '@garun/core/review';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; feedbackId: string }> },
) {
  const { slug, projectSlug, feedbackId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const input = formRecord(await request.formData());
    await addFeedbackComment(
      database,
      tenant,
      projectSlug,
      feedbackId,
      parseCommentBody(input),
      input.internal === 'yes' ? 'internal' : 'client',
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?success=comment`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?error=comment`,
      ),
      303,
    );
  }
}
