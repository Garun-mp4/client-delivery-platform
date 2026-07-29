import { NextResponse } from 'next/server';

import { getProjectExportArtifact } from '@garun/core/exports';
import { auditEvent } from '@garun/db/schema';

import { tenantFromRequest } from '@/lib/access';
import { database, environment, objectStorage } from '@/lib/server';

export async function GET(
  request: Request,
  context: {
    params: Promise<{ slug: string; projectSlug: string; exportId: string }>;
  },
) {
  const { slug, projectSlug, exportId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(exportId)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const artifact = await getProjectExportArtifact(database, tenant, projectSlug, exportId);
    const remainingSeconds = Math.max(
      30,
      Math.floor((artifact.expiresAt.getTime() - Date.now()) / 1_000),
    );
    const url = await objectStorage.signDownload({
      key: artifact.storageKey,
      filename: artifact.filename,
      contentType: 'application/gzip',
      disposition: 'attachment',
      expiresIn: Math.min(environment.STORAGE_DOWNLOAD_TTL_SECONDS, remainingSeconds),
    });
    await database.db.insert(auditEvent).values({
      workspaceId: tenant.workspaceId,
      actorUserId: tenant.userId,
      action: 'project.export_downloaded',
      entityType: 'export_job',
      entityId: artifact.exportId,
      requestId: request.headers.get('x-request-id') ?? undefined,
      metadata: { source: 'private_signed_download' },
    });
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
