import { Logger } from '@nestjs/common';
import axios, { type AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';

/**
 * Base class for HTTP-based scrapers. Used for sites whose job listings
 * are in the server-rendered HTML (no JS required) — most modern job
 * boards. Preferred over Playwright when it works because it's faster,
 * simpler, and has no Chrome dependency.
 *
 * Use `PlaywrightScraperBase` instead only when the target site renders
 * listings client-side via JS after page load.
 */
export abstract class HttpScraperBase {
  protected readonly logger: Logger;

  constructor(loggerName: string) {
    this.logger = new Logger(loggerName);
  }

  /** Realistic browser UA — most sites accept this without issue. */
  protected readonly userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

  /**
   * GET a URL and return a cheerio-loaded DOM.
   * Returns null on any non-2xx response, network error, or timeout — the
   * caller decides what to do (usually just logs + returns empty).
   */
  protected async fetchDom(url: string, options: AxiosRequestConfig = {}): Promise<cheerio.CheerioAPI | null> {
    try {
      const res = await axios.get<string>(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers,
        },
        timeout: 20_000,
        maxRedirects: 5,
        responseType: 'text',
        ...options,
        // Treat any non-2xx as a failure we can log and skip.
        validateStatus: (s) => s >= 200 && s < 300,
      });
      return cheerio.load(res.data);
    } catch (err: any) {
      const status = err?.response?.status;
      this.logger.warn(`GET ${url} failed${status ? ` (${status})` : ''}: ${err.message}`);
      return null;
    }
  }

  /**
   * Expand region pseudo-codes (EMEA, GLOBAL) to a flat list of real
   * country codes. Each scraper can override the per-region defaults.
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

  /**
   * Normalize whitespace in text extracted from HTML — collapses runs of
   * whitespace (including newlines from formatted markup) to a single
   * space. Use this anywhere you'd otherwise call `.text().trim()`.
   */
  protected clean(s: string | undefined | null): string {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  /** Quick keyword regex matching job title/description text. */
  protected makeKeywordRegex(keywords: string[]): RegExp {
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(escaped.join('|'), 'i');
  }

  /** Polite delay between requests. */
  protected delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
