import { NextResponse } from 'next/server';

import {
  getPendingUploadForCompletion,
  markUploadCompleted,
  MaterialServiceError,
} from '@garun/core/materials';

import { tenantFromRequest } from '@/lib/access';
import { database, objectStorage } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; fileId: string }> },
) {
  const { slug, projectSlug, fileId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const pending = await getPendingUploadForCompletion(database, tenant, projectSlug, fileId);
    const head = await objectStorage.head(pending.storageKey);
    await markUploadCompleted(database, tenant, projectSlug, fileId, {
      size: Number(head.ContentLength),
      mimeType: head.ContentType,
      checksum: head.Metadata?.['client-sha256'],
    });
    return NextResponse.json({ status: 'pending_scan' }, { status: 202 });
  } catch (error) {
    const status = error instanceof MaterialServiceError && error.code === 'NOT_FOUND' ? 404 : 409;
    return NextResponse.json({ error: { code: 'UPLOAD_NOT_ACCEPTED' } }, { status });
  }
}
