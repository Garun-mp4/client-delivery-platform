import { NextResponse } from 'next/server';

import { parseUploadDeclarations } from '@garun/core/materials';
import { initiateQuestionnaireFileUpload } from '@garun/core/questionnaires';

import { tenantFromRequest } from '@/lib/access';
import { database, environment, objectStorage } from '@/lib/server';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
      projectSlug: string;
      questionnaireId: string;
      fieldId: string;
    }>;
  },
) {
  const { slug, projectSlug, questionnaireId, fieldId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as { file?: unknown; idempotencyKey?: unknown };
    const [file] = parseUploadDeclarations([body.file], environment.FILE_MAX_BYTES);
    if (!file) throw new Error('INVALID_INPUT');
    const created = await initiateQuestionnaireFileUpload(
      database,
      tenant,
      projectSlug,
      questionnaireId,
      fieldId,
      {
        ...file,
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
        maxWorkspaceBytes: environment.WORKSPACE_QUOTA_BYTES,
        uploadExpiresAt: new Date(Date.now() + environment.STORAGE_UPLOAD_TTL_SECONDS * 1000),
      },
    );
    return NextResponse.json({
      id: created.id,
      url: await objectStorage.signUpload({
        key: created.storageKey,
        contentType: created.mimeType,
        size: created.size,
        checksum: created.checksum,
        expiresIn: environment.STORAGE_UPLOAD_TTL_SECONDS,
      }),
    });
  } catch {
    return NextResponse.json({ error: { code: 'UPLOAD_NOT_ACCEPTED' } }, { status: 422 });
  }
}
