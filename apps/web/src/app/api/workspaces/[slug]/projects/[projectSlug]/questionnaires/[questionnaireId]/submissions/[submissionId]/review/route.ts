import { NextResponse } from 'next/server';

import {
  reviewQuestionnaireSubmission,
  type QuestionnaireReviewDecision,
} from '@garun/core/questionnaires';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
      projectSlug: string;
      questionnaireId: string;
      submissionId: string;
    }>;
  },
) {
  const { slug, projectSlug, questionnaireId, submissionId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const decision = form.get('decision');
  try {
    if (decision !== 'accepted' && decision !== 'clarification_requested') {
      throw new Error('INVALID_DECISION');
    }
    await reviewQuestionnaireSubmission(
      database,
      tenant,
      projectSlug,
      questionnaireId,
      submissionId,
      decision as QuestionnaireReviewDecision,
      typeof form.get('comment') === 'string' ? String(form.get('comment')) : null,
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/questionnaires/${questionnaireId}?success=reviewed`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/questionnaires/${questionnaireId}?error=review`,
      ),
      303,
    );
  }
}
