import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Glassdoor — Tier: LOW (confirmed blocked).
 *
 * Returns 403 with a "you're blocked" body to non-browser requests.
 * A stealth browser is the only realistic path to make this work.
 */
@Injectable()
export class GlassdoorService extends HttpScraperBase {
  constructor() {
    super('GlassdoorService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    _maxPages: number = 1,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, {
      EMEA: ['DE', 'NL', 'UK', 'IE'],
      GLOBAL: ['DE', 'NL', 'UK', 'US'],
    });

    const jobs: RawJob[] = [];
    for (const country of expanded) {
      const domain = { DE: 'glassdoor.de', NL: 'glassdoor.nl', UK: 'glassdoor.co.uk', US: 'glassdoor.com' }[country];
      if (!domain) continue;

      const url = `https://www.${domain}/Job/${encodeURIComponent(keywords[0] || 'software-engineer').replace(/%20/g, '-')}-jobs-SRCH_KO0.htm`;
      const $ = await this.fetchDom(url);
      if (!$) {
        this.logger.warn(`Glassdoor ${country} blocked (expected — 403). Stealth browser required.`);
        continue;
      }

      // If unblocked, attempt to extract listings.
      $('[data-test="jobListing"], .react-job-listing, article').each((_, el) => {
        const card = $(el);
        const titleEl = card.find('[data-test="job-title"], a.jobLink').first();
        const title = titleEl.text().trim();
        const href = titleEl.attr('href') || '';
        if (!title || !href) return;
        jobs.push({
          source: 'glassdoor',
          title,
          company: card.find('[data-test="employer-name"], .employerName').first().text().trim() || 'Unknown',
          location: card.find('[data-test="emp-location"], .location').first().text().trim() || country,
          description: title,
          url: href.startsWith('http') ? href : `https://www.${domain}${href}`,
        });
      });
    }

    this.logger.log(`Glassdoor returned ${jobs.length} jobs`);
    return jobs;
  }
}
