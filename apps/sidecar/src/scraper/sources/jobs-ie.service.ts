import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Jobs.ie — Irish job board (runs on The StepStone Group's infrastructure).
 * Tier: medium.
 *
 * Selectors verified 2026-04 against the live site. Jobs.ie uses emotion-css
 * so class names are hashed and unstable, but they expose stable
 * `data-at` attributes that we target instead:
 *   - `[data-at="job-item"]` wraps each card
 *   - `[data-at="job-item-title"]` is the title anchor
 *   - `[data-at="job-item-company-name"]` is the company
 *   - `[data-at="job-item-location"]` is the location
 */
@Injectable()
export class JobsIeService extends HttpScraperBase {
  constructor() {
    super('JobsIeService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, { EMEA: ['IE'], GLOBAL: ['IE'] });
    if (!expanded.includes('IE')) return [];

    const jobs: RawJob[] = [];
    for (const keyword of keywords) {
      try {
        jobs.push(...(await this.scrapeKeyword(keyword, maxPages)));
      } catch (err: any) {
        this.logger.warn(`Jobs.ie ${keyword} failed: ${err.message}`);
      }
      await this.delay(800);
    }
    this.logger.log(`Jobs.ie returned ${jobs.length} jobs`);
    return jobs;
  }

  private async scrapeKeyword(keyword: string, maxPages: number): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const encoded = encodeURIComponent(keyword).replace(/%20/g, '-');
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://www.jobs.ie/jobs/${encoded}${page > 1 ? `?page=${page}` : ''}`;
      const $ = await this.fetchDom(url);
      if (!$) break;

      const cards = $('[data-at="job-item"]');
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const card = $(el);
        // Jobs.ie uses emotion-css, which injects <style> tags throughout
        // the DOM. Plain `.text()` concatenates those CSS rules into the
        // title, so we clone + strip style/script before reading text.
        const cleanText = (sel: string): string =>
          card.find(sel).first().clone().find('style,script').remove().end().text().trim();

        const titleEl = card.find('[data-at="job-item-title"]').first();
        const title = cleanText('[data-at="job-item-title"]');
        let href = titleEl.attr('href') || titleEl.find('a').attr('href') || '';
        if (!href) {
          href = card.find('a[href*="/job/"]').first().attr('href') || '';
        }
        if (href && !href.startsWith('http')) {
          href = href.startsWith('//') ? `https:${href}` : `https://www.jobs.ie${href}`;
        }

        const company = cleanText('[data-at="job-item-company-name"]');
        const location = cleanText('[data-at="job-item-location"]') || 'Ireland';

        if (!title || !href) return;
        jobs.push({
          source: 'jobsIe',
          title,
          company: company || 'Unknown',
          location,
          description: title,
          url: href,
        });
      });
    }
    return jobs;
  }
}
