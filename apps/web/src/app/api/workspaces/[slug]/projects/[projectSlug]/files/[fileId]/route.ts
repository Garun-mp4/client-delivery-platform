import { NextResponse } from 'next/server';

import { getAvailableFile } from '@garun/core/materials';

import { tenantFromRequest } from '@/lib/access';
import { database, environment, objectStorage } from '@/lib/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string; fileId: string }> },
) {
  const { slug, projectSlug, fileId } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const file = await getAvailableFile(database, tenant, projectSlug, fileId);
    const preview = new URL(request.url).searchParams.get('preview') === '1';
    const canInline =
      preview &&
      (file.detectedMimeType?.startsWith('image/') || file.detectedMimeType === 'application/pdf');
    const key = canInline && file.previewStorageKey ? file.previewStorageKey : file.storageKey;
    const mimeType =
      canInline && file.previewStorageKey
        ? 'image/webp'
        : (file.detectedMimeType ?? 'application/octet-stream');
    const url = await objectStorage.signDownload({
      key,
      filename: file.normalizedName,
      contentType: mimeType,
      disposition: canInline ? 'inline' : 'attachment',
      expiresIn: environment.STORAGE_DOWNLOAD_TTL_SECONDS,
    });
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND' } },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
}
