import { NextResponse } from 'next/server';

import {
  initiateProjectCoverUpload,
  parseProjectCoverUpload,
  ProjectCoverError,
} from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { database, environment, objectStorage } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as { file?: unknown; idempotencyKey?: unknown };
    const input = parseProjectCoverUpload(body.file, body.idempotencyKey);
    const created = await initiateProjectCoverUpload(database, tenant, projectSlug, input, {
      maxWorkspaceBytes: environment.WORKSPACE_QUOTA_BYTES,
      uploadExpiresAt: new Date(Date.now() + environment.STORAGE_UPLOAD_TTL_SECONDS * 1_000),
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    const url = await objectStorage.signUpload({
      key: created.storageKey,
      contentType: input.mimeType,
      size: input.size,
      checksum: input.checksum,
      expiresIn: environment.STORAGE_UPLOAD_TTL_SECONDS,
    });
    return NextResponse.json(
      { upload: { id: created.id, url } },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    const code = error instanceof ProjectCoverError ? error.code : 'INVALID_INPUT';
    return NextResponse.json(
      { error: { code } },
      { status: code === 'NOT_FOUND' ? 404 : code === 'QUOTA_EXCEEDED' ? 413 : 422 },
    );
  }
}
