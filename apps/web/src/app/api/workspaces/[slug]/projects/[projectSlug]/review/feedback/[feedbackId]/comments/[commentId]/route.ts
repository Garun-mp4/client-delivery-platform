import { NextResponse } from 'next/server';

import { reviseFeedbackComment } from '@garun/core/review';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ slug: string; projectSlug: string; feedbackId: string; commentId: string }>;
  },
) {
  const { slug, projectSlug, feedbackId, commentId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const input = formRecord(await request.formData());
    const intent = input.intent === 'delete' ? 'delete' : 'edit';
    await reviseFeedbackComment(
      database,
      tenant,
      projectSlug,
      feedbackId,
      commentId,
      intent,
      typeof input.body === 'string' ? input.body : null,
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
