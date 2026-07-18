import { describe, expect, it } from 'vitest';

import { checkSiteUrl, isBlockedAddress, normalizeCheckedUrl } from './url-security';

describe('SSRF URL boundary', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '172.20.1.1',
    '192.168.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks local address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])('allows public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it('blocks credentials, protocols and unexpected ports', () => {
    expect(() => normalizeCheckedUrl('file:///etc/passwd')).toThrow();
    expect(() => normalizeCheckedUrl('https://user:secret@example.com')).toThrow();
    expect(() => normalizeCheckedUrl('https://example.com:8443')).toThrow();
  });

  it('rejects a redirect to a private address before the second request', async () => {
    const requested: string[] = [];
    await expect(
      checkSiteUrl('https://public.example/start', 'https://workspace.example', {
        resolve: async (hostname) => (hostname === 'public.example' ? ['1.1.1.1'] : ['127.0.0.1']),
        request: async (url) => {
          requested.push(url.toString());
          return { status: 302, location: 'http://127.0.0.1/admin' };
        },
      }),
    ).rejects.toThrow('URL_ADDRESS_BLOCKED');
    expect(requested).toEqual(['https://public.example/start']);
  });

  it('rejects DNS answers containing any private address without a request', async () => {
    let requested = false;
    await expect(
      checkSiteUrl('https://mixed.example/', 'https://workspace.example', {
        resolve: async () => ['1.1.1.1', '10.0.0.1'],
        request: async () => {
          requested = true;
          return { status: 200 };
        },
      }),
    ).rejects.toThrow('URL_ADDRESS_BLOCKED');
    expect(requested).toBe(false);
  });
});
