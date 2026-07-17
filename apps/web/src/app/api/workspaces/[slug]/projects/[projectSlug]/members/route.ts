import { NextResponse } from 'next/server';

import { addInternalProjectMember, type ProjectPermission } from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  const userId = form.get('userId');
  if (typeof userId !== 'string') {
    return NextResponse.json({ error: { code: 'INVALID_INPUT' } }, { status: 400 });
  }
  const grants: ProjectPermission[] = ['project.view.internal'];
  if (form.get('canEdit') === 'yes') grants.push('project.edit', 'project.publish');
  if (form.get('canManageMembers') === 'yes') grants.push('project.members.manage');
  try {
    await addInternalProjectMember(database, tenant, projectSlug, userId, grants, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?success=member`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}?error=member`,
      ),
      303,
    );
  }
}
