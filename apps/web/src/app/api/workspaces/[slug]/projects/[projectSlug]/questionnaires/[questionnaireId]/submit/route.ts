import { NextResponse } from 'next/server';

import { QuestionnaireServiceError, submitQuestionnaire } from '@garun/core/questionnaires';

import { tenantFromRequest } from '@/lib/access';
import { database } from '@/lib/server';

export async function POST(
  request: Request,
  context: {
    params: Promise<{ slug: string; projectSlug: string; questionnaireId: string }>;
  },
) {
  const { slug, projectSlug, questionnaireId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as { version?: unknown };
    const result = await submitQuestionnaire(
      database,
      tenant,
      projectSlug,
      questionnaireId,
      Number(body.version),
      { requestId: request.headers.get('x-request-id') ?? undefined },
    );
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof QuestionnaireServiceError) {
      const status =
        error.code === 'VALIDATION_FAILED'
          ? 422
          : error.code === 'CONFLICT' || error.code === 'INVALID_STATE'
            ? 409
            : 404;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            ...(error.details ? { fields: error.details } : {}),
            ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
          },
        },
        { status, headers: { 'cache-control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR' } },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
