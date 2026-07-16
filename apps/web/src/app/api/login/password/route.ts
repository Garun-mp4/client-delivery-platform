import { NextResponse } from 'next/server';

import { normalizeEmail, safeRelativeRedirect } from '@garun/core/identity';

import { publicAppUrl } from '@/lib/public-url';
import { auth, environment } from '@/lib/server';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = form.get('email');
  const password = form.get('password');
  const callback = safeRelativeRedirect(form.get('callback')?.toString(), '/workspace');
  if (typeof email !== 'string' || typeof password !== 'string')
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, '/login?error=credentials'),
      303,
    );
  try {
    const result = await auth.api.signInEmail({
      body: { email: normalizeEmail(email), password },
      headers: request.headers,
      asResponse: true,
    });
    if (!result.ok)
      return NextResponse.redirect(
        publicAppUrl(environment.PUBLIC_APP_URL, '/login?error=credentials'),
        303,
      );
    const outgoing = NextResponse.redirect(publicAppUrl(environment.PUBLIC_APP_URL, callback), 303);
    for (const cookie of result.headers.getSetCookie())
      outgoing.headers.append('set-cookie', cookie);
    return outgoing;
  } catch {
    return NextResponse.redirect(
      publicAppUrl(environment.PUBLIC_APP_URL, '/login?error=credentials'),
      303,
    );
  }
}
