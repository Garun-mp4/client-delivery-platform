import { NextResponse, type NextRequest } from 'next/server';

import { getOrCreateRequestId } from '@garun/observability';

function createContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self'${isDevelopment ? ' ws: wss:' : ''}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' blob: data:",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${isDevelopment ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    ...(isDevelopment ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

export function proxy(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers.get('x-request-id'));
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
