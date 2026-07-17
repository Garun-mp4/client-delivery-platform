import { NextResponse } from 'next/server';

import { commentOnQuestionnaireAnswer } from '@garun/core/questionnaires';

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
  const fieldId = form.get('fieldId');
  const body = form.get('body');
  try {
    await commentOnQuestionnaireAnswer(
      database,
      tenant,
      projectSlug,
      questionnaireId,
      submissionId,
      typeof fieldId === 'string' ? fieldId : '',
      typeof body === 'string' ? body : '',
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/questionnaires/${questionnaireId}?success=commented#answer-${String(fieldId)}`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/questionnaires/${questionnaireId}?error=comment`,
      ),
      303,
    );
  }
}
