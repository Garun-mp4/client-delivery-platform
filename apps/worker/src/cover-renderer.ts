import { chromium } from 'playwright-core';

import { fetchSafeResource, normalizeCheckedUrl } from './url-security';

export interface ProjectCoverRenderer {
  render(url: string): Promise<Uint8Array>;
}

export interface CoverRendererOptions {
  readonly executablePath: string;
  readonly timeoutMs: number;
  readonly maxRequests: number;
  readonly maxBytes: number;
}

export class PlaywrightProjectCoverRenderer implements ProjectCoverRenderer {
  constructor(private readonly options: CoverRendererOptions) {}

  async render(rawUrl: string) {
    const target = normalizeCheckedUrl(rawUrl);
    const browser = await chromium.launch({
      executablePath: this.options.executablePath,
      headless: true,
      // Docker Desktop blocks namespace creation for a non-root Chromium process.
      // The worker remains non-root and all traffic is route-fulfilled by the
      // SSRF-safe transport; production must provide a hardened container runtime.
      chromiumSandbox: false,
      args: [
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-domain-reliability',
        '--disable-features=MediaRouter,OptimizationHints,Translate',
        '--disable-quic',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--metrics-recording-only',
        '--no-first-run',
      ],
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        javaScriptEnabled: true,
        serviceWorkers: 'block',
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
      });
      const page = await context.newPage();
      let requests = 0;
      let transferred = 0;
      await page.route('**/*', async (route) => {
        try {
          const requestUrl = route.request().url();
          if (!requestUrl.startsWith('http://') && !requestUrl.startsWith('https://')) {
            await route.abort('blockedbyclient');
            return;
          }
          requests += 1;
          if (requests > this.options.maxRequests) throw new Error('CAPTURE_REQUEST_LIMIT');
          const remaining = this.options.maxBytes - transferred;
          if (remaining <= 0) throw new Error('CAPTURE_SIZE_LIMIT');
          const resource = await fetchSafeResource(requestUrl, {
            maxBytes: Math.min(5 * 1024 * 1024, remaining),
            timeoutMs: Math.min(this.options.timeoutMs, 8_000),
          });
          transferred += resource.body.byteLength;
          await route.fulfill({
            status: resource.status,
            headers: resource.headers,
            body: Buffer.from(resource.body),
          });
        } catch {
          await route.abort('blockedbyclient');
        }
      });
      await page.routeWebSocket('**/*', (socket) => socket.close());
      page.on('download', (download) => void download.cancel());
      await page.goto(target.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeoutMs,
      });
      await page.waitForTimeout(750);
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
      });
      await context.close();
      return screenshot;
    } finally {
      await browser.close();
    }
  }
}
