import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5_000;

function ipv4Number(address: string) {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function ipv4In(address: string, network: string, bits: number) {
  const value = ipv4Number(address);
  const base = ipv4Number(network);
  if (value === null || base === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]!;
  if (normalized.startsWith('::ffff:')) return isBlockedAddress(normalized.slice(7));
  const family = isIP(normalized);
  if (family === 4) {
    return [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ].some(([network, bits]) => ipv4In(normalized, network as string, bits as number));
  }
  if (family === 6) {
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }
  return true;
}

export function normalizeCheckedUrl(raw: string): URL {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL_SCHEME_BLOCKED');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('URL_PORT_BLOCKED');
  url.hash = '';
  return url;
}

async function safeAddress(
  hostname: string,
  resolver: (hostname: string) => Promise<readonly string[]>,
) {
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('URL_ADDRESS_BLOCKED');
    return hostname;
  }
  const addresses = await resolver(hostname);
  if (addresses.length === 0) throw new Error('URL_DNS_EMPTY');
  if (addresses.some((address) => isBlockedAddress(address))) {
    throw new Error('URL_ADDRESS_BLOCKED');
  }
  return addresses[0]!;
}

function requestHeaders(url: URL, address: string) {
  return new Promise<{
    status: number;
    location?: string;
    xFrameOptions?: string;
    contentSecurityPolicy?: string;
  }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'HEAD',
        servername: url.hostname,
        headers: {
          host: url.host,
          'user-agent': 'Garun-Workspace-URL-Checker/1.0',
          accept: 'text/html,*/*;q=0.1',
        },
      },
      (response) => {
        const firstHeader = (value: string | string[] | undefined) =>
          Array.isArray(value) ? value[0] : value;
        const result = {
          status: response.statusCode ?? 0,
          location: response.headers.location,
          xFrameOptions: firstHeader(response.headers['x-frame-options']),
          contentSecurityPolicy: firstHeader(response.headers['content-security-policy']),
        };
        response.destroy();
        resolve(result);
      },
    );
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('URL_TIMEOUT')));
    request.once('error', reject);
    request.end();
  });
}

function embedAllowed(
  targetOrigin: string,
  appOrigin: string,
  headers: { xFrameOptions?: string; contentSecurityPolicy?: string },
) {
  if (headers.xFrameOptions) return false;
  const directive = headers.contentSecurityPolicy
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('frame-ancestors '));
  if (!directive) return true;
  const sources = directive.split(/\s+/).slice(1);
  return (
    sources.includes('*') ||
    sources.includes(appOrigin) ||
    (sources.includes("'self'") && targetOrigin === appOrigin)
  );
}

export async function checkSiteUrl(
  raw: string,
  publicAppUrl: string,
  dependencies: {
    readonly resolve?: (hostname: string) => Promise<readonly string[]>;
    readonly request?: typeof requestHeaders;
  } = {},
) {
  const resolver =
    dependencies.resolve ??
    (async (hostname: string) =>
      (await lookup(hostname, { all: true, verbatim: true })).map((item) => item.address));
  const requester = dependencies.request ?? requestHeaders;
  let current = normalizeCheckedUrl(raw);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const address = await safeAddress(current.hostname, resolver);
    let response;
    try {
      response = await requester(current, address);
    } catch {
      return {
        security: 'safe' as const,
        availability: 'unreachable' as const,
        embed: 'unknown' as const,
        code: 'URL_UNREACHABLE',
        finalOrigin: current.origin,
      };
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirect === MAX_REDIRECTS) throw new Error('URL_REDIRECT_LIMIT');
      current = normalizeCheckedUrl(new URL(response.location, current).toString());
      continue;
    }
    const appOrigin = new URL(publicAppUrl).origin;
    return {
      security: 'safe' as const,
      availability: 'reachable' as const,
      embed: embedAllowed(current.origin, appOrigin, response)
        ? ('allowed' as const)
        : ('blocked' as const),
      code: `HTTP_${response.status || 0}`,
      finalOrigin: current.origin,
    };
  }
  throw new Error('URL_REDIRECT_LIMIT');
}
