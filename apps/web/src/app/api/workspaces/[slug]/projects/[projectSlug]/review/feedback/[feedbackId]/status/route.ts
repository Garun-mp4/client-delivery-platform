import { NextResponse } from 'next/server';

import { transitionFeedback, type FeedbackStatus } from '@garun/core/review';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

const statuses: readonly FeedbackStatus[] = [
  'new',
  'accepted',
  'clarification',
  'in_progress',
  'fixed',
  'awaiting_verification',
  'closed',
  'rejected',
];

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; feedbackId: string }> },
) {
  const { slug, projectSlug, feedbackId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const input = formRecord(await request.formData());
    const status = statuses.find((item) => item === input.status);
    if (!status) throw new Error('INVALID_STATUS');
    await transitionFeedback(
      database,
      tenant,
      projectSlug,
      feedbackId,
      status,
      input.potentialChange === 'yes' || input.classification === 'potential_change'
        ? 'potential_change'
        : 'in_scope',
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?success=status`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?error=status`,
      ),
      303,
    );
  }
}
