import { NextResponse } from 'next/server';

import { autosaveQuestionnaireDraft, QuestionnaireServiceError } from '@garun/core/questionnaires';

import { tenantFromRequest } from '@/lib/access';
import { database } from '@/lib/server';

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ slug: string; projectSlug: string; questionnaireId: string }>;
  },
) {
  const { slug, projectSlug, questionnaireId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as {
      answers?: unknown;
      version?: unknown;
      idempotencyKey?: unknown;
    };
    const saved = await autosaveQuestionnaireDraft(database, tenant, projectSlug, questionnaireId, {
      answers:
        body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
          ? (body.answers as Record<string, unknown>)
          : {},
      version: Number(body.version),
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    });
    return NextResponse.json(saved, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof QuestionnaireServiceError) {
      const status =
        error.code === 'CONFLICT'
          ? 409
          : error.code === 'VALIDATION_FAILED'
            ? 422
            : error.code === 'INVALID_STATE'
              ? 409
              : 404;
      return NextResponse.json(
        {
          error: {
            code: error.code,
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
