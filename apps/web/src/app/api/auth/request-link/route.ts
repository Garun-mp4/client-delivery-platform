import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { normalizeEmail } from '@garun/core/identity';
import { auditEvent, user, workspaceMembership } from '@garun/db/schema';

import { auth, database } from '@/lib/server';
import { allowSensitiveRequest } from '@/lib/rate-limit';

const generic = { ok: true, message: 'Если адрес разрешён, письмо уже отправлено.' };

export async function POST(request: Request) {
  const form = await request.formData();
  const emailValue = form.get('email');
  if (typeof emailValue !== 'string') return NextResponse.json(generic, { status: 202 });
  const email = normalizeEmail(emailValue);
  const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await allowSensitiveRequest('magic-link', `${source}:${email}`, 5, 300))) {
    return NextResponse.redirect(new URL('/login/sent', request.url), 303);
  }
  const [eligible] = await database.db
    .select({ id: user.id })
    .from(user)
    .innerJoin(workspaceMembership, eq(workspaceMembership.userId, user.id))
    .where(
      and(
        eq(user.email, email),
        eq(user.status, 'active'),
        eq(workspaceMembership.status, 'active'),
      ),
    )
    .limit(1);
  if (eligible) {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/workspace', errorCallbackURL: '/login?error=link' },
      headers: request.headers,
    });
    await database.db.insert(auditEvent).values({
      actorUserId: eligible.id,
      action: 'auth.magic_link_requested',
      entityType: 'user',
      entityId: eligible.id,
      requestId: request.headers.get('x-request-id') ?? undefined,
    });
  }
  return NextResponse.redirect(new URL('/login/sent', request.url), 303);
}
