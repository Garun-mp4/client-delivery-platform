import { NextResponse } from 'next/server';

import { markAllNotificationsRead } from '@garun/core/notifications';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  await markAllNotificationsRead(database, tenant);
  return NextResponse.redirect(
    publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/notifications`),
    303,
  );
}
