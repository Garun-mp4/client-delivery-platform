import { NextResponse } from 'next/server';

import {
  handoverChecklist,
  setHandoverChecklistItem,
  type HandoverChecklistKey,
} from '@garun/core/projects';

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
  const itemKey = String(form.get('itemKey') ?? '');
  if (!handoverChecklist.some((item) => item.key === itemKey)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
  try {
    await setHandoverChecklistItem(
      database,
      tenant,
      projectSlug,
      itemKey as HandoverChecklistKey,
      form.get('completed') === 'yes',
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/completion`,
      ),
      303,
    );
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
