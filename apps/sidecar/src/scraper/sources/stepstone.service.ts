import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * StepStone.de — Tier: LOW (confirmed blocked).
 *
 * Returns 403 to non-browser requests. If we ever add a stealth browser,
 * the same `data-at` selectors that work for Jobs.ie should work here
 * (both run on the same StepStone Group stack).
 */
@Injectable()
export class StepstoneService extends HttpScraperBase {
  constructor() {
    super('StepstoneService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    _maxPages: number = 1,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, { EMEA: ['DE'], GLOBAL: ['DE'] });
    if (!expanded.includes('DE')) return [];

    const url = `https://www.stepstone.de/jobs/${encodeURIComponent(keywords[0] || 'software-engineer').replace(/%20/g, '-')}`;
    const $ = await this.fetchDom(url);
    if (!$) {
      this.logger.warn('StepStone blocked (expected — 403). Stealth browser required.');
      return [];
    }

    // If the block lifts, use the same data-at selectors that work for Jobs.ie.
    const jobs: RawJob[] = [];
    $('[data-at="job-item"]').each((_, el) => {
      const card = $(el);
      const title = card.find('[data-at="job-item-title"]').first().text().trim();
      const href = card.find('[data-at="job-item-title"]').first().attr('href')
        || card.find('a[href*="/stellenangebote--"]').first().attr('href')
        || '';
      if (!title || !href) return;
      jobs.push({
        source: 'stepstone',
        title,
        company: card.find('[data-at="job-item-company-name"]').first().text().trim() || 'Unknown',
        location: card.find('[data-at="job-item-location"]').first().text().trim() || 'Germany',
        description: title,
        url: href.startsWith('http') ? href : `https://www.stepstone.de${href}`,
      });
    });
    this.logger.log(`StepStone returned ${jobs.length} jobs`);
    return jobs;
  }
}
