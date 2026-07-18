import { NextResponse, type NextRequest } from 'next/server';

import { getOrCreateRequestId } from '@garun/observability';

function createContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const publicProtocol = process.env.PUBLIC_APP_URL
    ? new URL(process.env.PUBLIC_APP_URL).protocol
    : 'http:';
  const storageOrigin = process.env.STORAGE_PUBLIC_ENDPOINT
    ? new URL(process.env.STORAGE_PUBLIC_ENDPOINT).origin
    : null;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self'${storageOrigin ? ` ${storageOrigin}` : ''}${isDevelopment ? ' ws: wss:' : ''}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' blob: data:",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${isDevelopment ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    ...(!isDevelopment && publicProtocol === 'https:' ? ['upgrade-insecure-requests'] : []),
  ];

  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get('x-request-id'));
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const configuredOrigin = process.env.PUBLIC_APP_URL ?? 'http://localhost:3000';
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(configuredOrigin).origin) {
      return NextResponse.json(
        { error: { code: 'INVALID_ORIGIN', requestId } },
        { status: 403, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
      );
    }
  }
  const nonce = crypto.randomUUID();
  const contentSecurityPolicy = createContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', contentSecurityPolicy);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', contentSecurityPolicy);
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
