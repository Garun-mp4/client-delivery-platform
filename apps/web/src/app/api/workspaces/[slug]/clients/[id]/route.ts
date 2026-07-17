import { NextResponse } from 'next/server';

import { parseClientCompanyInput, updateClientCompany } from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const input = parseClientCompanyInput(formRecord(await request.formData()));
    await updateClientCompany(database, tenant, id, input, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/clients/${id}?success=updated`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/clients/${id}?error=update`),
      303,
    );
  }
}
