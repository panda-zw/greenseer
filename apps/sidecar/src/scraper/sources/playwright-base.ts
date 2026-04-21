import { Logger } from '@nestjs/common';
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';

/**
 * Shared Playwright plumbing for HTML-scraping sources. Each concrete source
 * extends this and implements `scrape()`, calling `withPage()` to get a
 * managed browser/page pair with polite delays and graceful Chrome
 * discovery.
 *
 * We reuse the same Chrome-discovery logic as the LinkedIn scraper so all
 * Playwright-based sources share one installed browser.
 */
export abstract class PlaywrightScraperBase {
  protected readonly logger: Logger;

  constructor(loggerName: string) {
    this.logger = new Logger(loggerName);
  }

  /** Minimal user-agent spoof — good enough for sites without heavy bot detection. */
  protected readonly userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

  protected async launchBrowser(): Promise<Browser> {
    const candidatePaths = [
      process.env.CHROMIUM_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ].filter(Boolean) as string[];

    for (const executablePath of candidatePaths) {
      try {
        return await chromium.launch({
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--headless=new',
            '--disable-gpu',
            '--no-startup-window',
            '--disable-background-networking',
          ],
        });
      } catch {
        // Try next path
      }
    }

    throw new Error('No Chrome/Chromium binary found. Install Chrome or set CHROMIUM_PATH.');
  }

  /**
   * Run `work` with a fresh browser + page. Always cleans up the browser,
   * even if `work` throws. Returns whatever `work` returns, or an empty
   * array on launch failure (so one misconfigured scraper never takes
   * down the whole orchestrator run).
   */
  protected async withPage<T>(work: (page: Page, browser: Browser) => Promise<T>): Promise<T | null> {
    let browser: Browser | null = null;
    try {
      browser = await this.launchBrowser();
      const page = await browser.newPage({ userAgent: this.userAgent });
      return await work(page, browser);
    } catch (err: any) {
      this.logger.error(`Scraper failed: ${err.message}`);
      return null;
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 2-5 second jittered delay, used between page loads to stay polite. */
  protected politeDelay(): Promise<void> {
    return this.delay(2000 + Math.random() * 3000);
  }

  /**
   * Expand region pseudo-codes to a flat list of real country codes. Every
   * scraper hits this first so EMEA/GLOBAL semantics are consistent.
   */
  protected expandCountries(
    countryCodes: string[],
    perRegion: { EMEA?: string[]; GLOBAL?: string[] } = {},
  ): string[] {
    const EMEA = perRegion.EMEA ?? ['UK', 'DE', 'NL', 'IE', 'AE'];
    const GLOBAL = perRegion.GLOBAL ?? ['US', 'UK', 'DE', 'NL', 'CA', 'AU', 'NZ', 'SG', 'IE'];
    return Array.from(
      new Set(
        countryCodes.flatMap((c) => {
          if (c === 'EMEA') return EMEA;
          if (c === 'GLOBAL') return GLOBAL;
          return [c];
        }),
      ),
    );
  }
}
