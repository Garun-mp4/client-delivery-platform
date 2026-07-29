import { NextResponse } from 'next/server';

import {
  enqueueProjectCoverCapture,
  getLatestProjectCoverCapture,
  ProjectCoverError,
} from '@garun/core/projects';

import { tenantFromRequest } from '@/lib/access';
import { database } from '@/lib/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    return NextResponse.json(
      { capture: await getLatestProjectCoverCapture(database, tenant, projectSlug) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; projectSlug: string }> },
) {
  const { slug, projectSlug } = await context.params;
  const tenant = await tenantFromRequest(request, slug);
  if (!tenant) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const body = (await request.json()) as { idempotencyKey?: unknown };
    const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    const capture = await enqueueProjectCoverCapture(
      database,
      tenant,
      projectSlug,
      key,
      request.headers.get('x-request-id') ?? undefined,
    );
    return NextResponse.json({ capture }, { status: capture ? 202 : 200 });
  } catch (error) {
    const status =
      error instanceof ProjectCoverError && error.code === 'INVALID_STATE'
        ? 409
        : error instanceof ProjectCoverError && error.code === 'NOT_FOUND'
          ? 404
          : 422;
    return NextResponse.json({ error: { code: 'CAPTURE_NOT_AVAILABLE' } }, { status });
  }
}
