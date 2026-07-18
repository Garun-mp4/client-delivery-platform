import { NextResponse } from 'next/server';

import { encryptOutboxSecret } from '@garun/auth/crypto';
import { createSiteVersion, parseSiteVersionInput } from '@garun/core/review';

import { tenantFromRequest } from '@/lib/access';
import { formRecord } from '@/lib/form-record';
import { publicAppUrl } from '@/lib/public-url';
import { database, environment } from '@/lib/server';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const input = formRecord(await request.formData());
    const secret =
      input.accessMode === 'password' &&
      typeof input.accessSecret === 'string' &&
      input.accessSecret.length >= 1 &&
      input.accessSecret.length <= 500
        ? encryptOutboxSecret(input.accessSecret, environment.OUTBOX_ENCRYPTION_KEY)
        : null;
    await createSiteVersion(
      database,
      tenant,
      projectSlug,
      parseSiteVersionInput(input, secret),
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?success=version`,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      publicAppUrl(
        environment.PUBLIC_APP_URL,
        `/workspace/${slug}/projects/${projectSlug}/review?error=version`,
      ),
      303,
    );
  }
}
