import { Injectable, Logger } from '@nestjs/common';
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import type { RawJob } from '../dto/raw-job.dto';

// LinkedIn location IDs for supported countries
const LOCATION_MAP: Record<string, string> = {
  AU: '101452733', // Australia
  UK: '101165590', // United Kingdom
  CA: '101174742', // Canada
  US: '103644278', // United States
  DE: '101282230', // Germany
  NL: '102890719', // Netherlands
  SG: '102454443', // Singapore
  AE: '104305776', // UAE
  NZ: '105490917', // New Zealand
  IE: '104738515', // Ireland
  // Worldwide — LinkedIn's own geoId for global listings. Pair with the
  // `f_WT=2` (remote) filter below so we get remote-friendly roles.
  GLOBAL: '92000000',
};

/**
 * Pseudo-codes that expand into multiple real country codes before searching.
 * Used when the user selects a region instead of a single country.
 */
const REGION_EXPANSIONS: Record<string, string[]> = {
  EMEA: ['UK', 'DE', 'NL', 'IE', 'AE'],
};

/** Country codes that should search for remote roles rather than on-site. */
const REMOTE_ONLY_CODES = new Set(['GLOBAL']);

@Injectable()
export class LinkedInService {
  private readonly logger = new Logger(LinkedInService.name);
  private activeBrowser: Browser | null = null;

  async kill() {
    if (this.activeBrowser) {
      try {
        await this.activeBrowser.close();
      } catch { /* already closed */ }
      this.activeBrowser = null;
      this.logger.log('Browser closed');
    }
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 3,
  ): Promise<RawJob[]> {
    let browser: Browser | null = null;
    const allJobs: RawJob[] = [];

    try {
      browser = await this.launchBrowser();
      this.activeBrowser = browser;
      const listingPage = await browser.newPage();
      const detailPage = await browser.newPage();

      // Expand region pseudo-codes (EMEA, etc.) into their constituent
      // country codes. De-duplicated so selecting both "EMEA" and "UK"
      // doesn't scrape the UK twice.
      const expandedCountries = Array.from(
        new Set(
          countryCodes.flatMap((code) => REGION_EXPANSIONS[code] ?? [code]),
        ),
      );

      this.logger.log(
        `LinkedIn: searching ${expandedCountries.length} countries (from ${countryCodes.length} requested), ${keywords.length} keywords, maxPages=${maxPages}`,
      );

      for (const countryCode of expandedCountries) {
        const locationId = LOCATION_MAP[countryCode];
        if (!locationId) {
          this.logger.warn(`LinkedIn: no location ID for country "${countryCode}", skipping`);
          continue;
        }

        const remoteOnly = REMOTE_ONLY_CODES.has(countryCode);

        for (const keyword of keywords) {
          try {
            this.logger.log(
              `LinkedIn: "${keyword}" in ${countryCode} (geoId=${locationId}${remoteOnly ? ', remote' : ''})...`,
            );
            const jobs = await this.searchJobs(
              listingPage,
              detailPage,
              keyword,
              locationId,
              countryCode,
              maxPages,
              remoteOnly,
            );
            this.logger.log(`LinkedIn: "${keyword}" in ${countryCode} → ${jobs.length} jobs`);
            allJobs.push(...jobs);
          } catch (error) {
            this.logger.error(`LinkedIn search failed for ${countryCode}/${keyword}: ${error}`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`LinkedIn browser launch failed: ${error}`);
    } finally {
      if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
      this.activeBrowser = null;
    }

    this.logger.log(`LinkedIn returned ${allJobs.length} total jobs`);
    return allJobs;
  }

  private async launchBrowser(): Promise<Browser> {
    const possiblePaths = [
      process.env.CHROMIUM_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
    ].filter(Boolean) as string[];

    for (const executablePath of possiblePaths) {
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
        this.logger.warn(`Browser not found at: ${executablePath}`);
      }
    }

    throw new Error('No browser found. Install Google Chrome or set CHROMIUM_PATH env var.');
  }

  private async searchJobs(
    page: Page,
    detailPage: Page,
    keyword: string,
    locationId: string,
    countryCode: string,
    maxPages: number,
    remoteOnly: boolean = false,
  ): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const encodedKeyword = encodeURIComponent(keyword);
    // LinkedIn work-type filter: f_WT=2 means Remote. We only add it when
    // the caller explicitly wants remote-only (currently the GLOBAL code)
    // so per-country searches keep their existing on-site + hybrid results.
    const workTypeFilter = remoteOnly ? '&f_WT=2' : '';

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const start = pageNum * 25;
      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodedKeyword}&location=&geoId=${locationId}&f_SB2=6${workTypeFilter}&start=${start}`;

      this.logger.log(`LinkedIn fetching: ${countryCode} page ${pageNum + 1}`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Polite delay between requests (2-5 seconds)
      await this.delay(2000 + Math.random() * 3000);

      // Wait for job cards to load
      try {
        await page.waitForSelector('.base-card', { timeout: 10000 });
      } catch {
        this.logger.log(`No more job cards at page ${pageNum + 1}`);
        break;
      }

      // Extract job listings from the page
      const listings = await page.$$eval('.base-card', (cards) =>
        cards.map((card) => {
          const titleEl = card.querySelector('.base-search-card__title');
          const companyEl = card.querySelector('.base-search-card__subtitle');
          const locationEl = card.querySelector('.job-search-card__location');
          const linkEl = card.querySelector('a.base-card__full-link');
          const salaryEl = card.querySelector('.job-search-card__salary-info');

          return {
            title: titleEl?.textContent?.trim() || '',
            company: companyEl?.textContent?.trim() || '',
            location: locationEl?.textContent?.trim() || '',
            url: (linkEl as HTMLAnchorElement)?.href || '',
            salary: salaryEl?.textContent?.trim() || undefined,
          };
        }),
      );

      // Add all listings — skip slow detail page fetching
      // The listing card has enough info for visa pre-screening and matching
      for (const listing of listings) {
        if (!listing.title || !listing.company || !listing.url) continue;
        jobs.push({
          source: 'linkedin',
          title: listing.title,
          company: listing.company,
          location: listing.location,
          salary: listing.salary,
          description: listing.title, // Use title as minimal description
          url: listing.url,
        });
      }
    }

    return jobs;
  }

  private async getJobDescription(
    page: Page,
    jobUrl: string,
  ): Promise<string> {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

    try {
      await page.waitForSelector('.show-more-less-html__markup', {
        timeout: 8000,
      });
      const description = await page.$eval(
        '.show-more-less-html__markup',
        (el) => el.textContent?.trim() || '',
      );
      return description;
    } catch {
      // Try alternative selector
      try {
        const description = await page.$eval(
          '.description__text',
          (el) => el.textContent?.trim() || '',
        );
        return description;
      } catch {
        return '';
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
