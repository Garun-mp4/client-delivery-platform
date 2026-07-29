import { NextResponse } from 'next/server';

import { getProjectCover, removeManualProjectCover } from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { database, objectStorage } from '@/lib/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const cover = await getProjectCover(database, tenant, projectSlug);
    if (!cover) throw new Error('NOT_FOUND');
    const key = cover.previewStorageKey ?? cover.storageKey;
    const object = await objectStorage.get(key);
    const bytes = await object.Body?.transformToByteArray();
    if (!bytes) throw new Error('NOT_FOUND');
    return new Response(Uint8Array.from(bytes).buffer, {
      headers: {
        'cache-control': 'private, max-age=300',
        'content-length': String(bytes.byteLength),
        'content-type': cover.previewStorageKey ? 'image/webp' : (cover.mimeType ?? 'image/webp'),
        vary: 'Cookie',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND' } },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    await removeManualProjectCover(
      database,
      tenant,
      projectSlug,
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.json({ status: 'removed' });
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
