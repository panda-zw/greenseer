import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * IrishJobs.ie — Tier: LOW (confirmed blocked).
 *
 * This site returns 403 to non-browser requests. The scraper is kept so the
 * source remains listed in the catalog (and users can opt in), but it will
 * almost always return 0 jobs until we add a stealth browser that can
 * bypass the block.
 */
@Injectable()
export class IrishJobsService extends HttpScraperBase {
  constructor() {
    super('IrishJobsService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    _maxPages: number = 1,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, { EMEA: ['IE'], GLOBAL: ['IE'] });
    if (!expanded.includes('IE')) return [];

    const url = `https://www.irishjobs.ie/jobs/${encodeURIComponent(keywords[0] || 'software-engineer').replace(/%20/g, '-')}/in-ireland`;
    const $ = await this.fetchDom(url);
    if (!$) {
      this.logger.warn('IrishJobs blocked (expected — 403). Stealth browser required.');
      return [];
    }

    // Future-proof: if the block is ever lifted, look for standard IrishJobs job cards.
    const jobs: RawJob[] = [];
    $('article.job, .job-result, [data-testid="job-card"]').each((_, el) => {
      const card = $(el);
      const titleEl = card.find('h2 a, h3 a, .job-title a').first();
      const title = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      if (!title || !href) return;
      jobs.push({
        source: 'irishJobs',
        title,
        company: card.find('.company, .company-name').first().text().trim() || 'Unknown',
        location: card.find('.location').first().text().trim() || 'Ireland',
        description: title,
        url: href.startsWith('http') ? href : `https://www.irishjobs.ie${href}`,
      });
    });
    this.logger.log(`IrishJobs returned ${jobs.length} jobs`);
    return jobs;
  }
}
