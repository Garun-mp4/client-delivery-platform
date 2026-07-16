import { NextResponse } from 'next/server';

import { getOrCreateRequestId } from '@garun/observability';

import { createHealthResponse } from '@/lib/health';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const requestId = getOrCreateRequestId(request.headers.get('x-request-id'));
  return NextResponse.json(createHealthResponse(requestId), {
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
}
