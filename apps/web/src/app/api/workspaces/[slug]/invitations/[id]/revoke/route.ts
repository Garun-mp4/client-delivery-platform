import { NextResponse } from 'next/server';
import { revokeInvitation } from '@garun/auth';
import { tenantFromRequest } from '@/lib/access';
import { database } from '@/lib/server';
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  if (form.get('confirm') !== 'yes')
    return NextResponse.json({ error: { code: 'CONFIRMATION_REQUIRED' } }, { status: 400 });
  try {
    await revokeInvitation(database, tenant, id, {
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
    return NextResponse.redirect(new URL(`/workspace/${slug}?success=revoked`, request.url), 303);
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}
