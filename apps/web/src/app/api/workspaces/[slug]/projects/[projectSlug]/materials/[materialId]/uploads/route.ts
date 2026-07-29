import { NextResponse } from 'next/server';

import {
  initiateMaterialUpload,
  MaterialServiceError,
  parseUploadDeclarations,
} from '@garun/core/materials';

import { tenantFromRequest } from '@/lib/access';
import { database, environment, objectStorage } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; materialId: string }> },
) {
  const { slug, projectSlug, materialId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as { files?: unknown; idempotencyKey?: unknown };
    const files = parseUploadDeclarations(body.files, environment.FILE_MAX_BYTES);
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    const created = await initiateMaterialUpload(
      database,
      tenant,
      projectSlug,
      materialId,
      files,
      idempotencyKey,
      {
        maxWorkspaceBytes: environment.WORKSPACE_QUOTA_BYTES,
        uploadExpiresAt: new Date(Date.now() + environment.STORAGE_UPLOAD_TTL_SECONDS * 1000),
      },
    );
    const uploads = await Promise.all(
      created.map(async (file) => ({
        id: file.id,
        url: await objectStorage.signUpload({
          key: file.storageKey,
          contentType: file.mimeType,
          size: file.size,
          checksum: file.checksum,
          expiresIn: environment.STORAGE_UPLOAD_TTL_SECONDS,
        }),
      })),
    );
    return NextResponse.json({ uploads }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = error instanceof MaterialServiceError ? error.code : 'VALIDATION_FAILED';
    const status = code === 'QUOTA_EXCEEDED' ? 413 : code === 'NOT_FOUND' ? 404 : 422;
    return NextResponse.json({ error: { code } }, { status });
  }
}
