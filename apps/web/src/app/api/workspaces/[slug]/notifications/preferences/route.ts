import { NextResponse } from 'next/server';

import { updateNotificationPreference } from '@garun/core/notifications';

import { tenantFromRequest } from '@/lib/access';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

function timeToMinute(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value === '') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  const form = await request.formData();
  try {
    await updateNotificationPreference(database, tenant, {
      emailEnabled: form.get('emailEnabled') === 'yes',
      remindersEnabled: form.get('remindersEnabled') === 'yes',
      timezone: String(form.get('timezone') ?? '').trim(),
      quietHoursStartMinute: timeToMinute(form.get('quietHoursStart')),
      quietHoursEndMinute: timeToMinute(form.get('quietHoursEnd')),
    });
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/notifications?success=saved`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, `/workspace/${slug}/notifications?error=invalid`),
      303,
    );
  }
}
