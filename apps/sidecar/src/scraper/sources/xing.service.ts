import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Xing — Germany's professional network. Tier: low (experimental).
 *
 * Xing uses styled-components so class names have a hashed suffix
 * (e.g. `job-teaser-list-item-styles__Card-sc-f66c105-0`). The semantic
 * prefix is stable across deploys, so we target by partial attribute
 * match: `[class*="job-teaser-list-item-styles__Card"]`.
 *
 * Most listings redirect to a login wall; the public search page does
 * render a small number of cards. We extract what we can and move on.
 * Keep this in the low tier because the site can ship a component
 * rename and silently break our selectors.
 */
@Injectable()
export class XingService extends HttpScraperBase {
  constructor() {
    super('XingService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 1,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, { EMEA: ['DE'], GLOBAL: ['DE'] });
    if (!expanded.includes('DE')) return [];

    const jobs: RawJob[] = [];
    for (const keyword of keywords) {
      try {
        jobs.push(...(await this.scrapeKeyword(keyword, maxPages)));
      } catch (err: any) {
        this.logger.warn(`Xing ${keyword} failed: ${err.message}`);
      }
      await this.delay(900);
    }
    this.logger.log(`Xing returned ${jobs.length} jobs`);
    return jobs;
  }

  private async scrapeKeyword(keyword: string, maxPages: number): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const encoded = encodeURIComponent(keyword);

    for (let page = 1; page <= maxPages; page++) {
      const url = `https://www.xing.com/jobs/search?keywords=${encoded}${page > 1 ? `&page=${page}` : ''}`;
      const $ = await this.fetchDom(url);
      if (!$) break;

      // Bail out if Xing served a login wall instead of results.
      const bodyText = $('body').text();
      if (/log\s*in\s*to\s*xing|create\s*account|please\s*log\s*in/i.test(bodyText) && jobs.length === 0) {
        this.logger.warn('Xing served a login wall — stopping');
        break;
      }

      const cards = $('[class*="job-teaser-list-item-styles__Card"]');
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const card = $(el);
        const title = this.clean(card.find('[class*="job-teaser-list-item-styles__Title"]').first().text());
        const company = this.clean(card.find('[class*="job-teaser-list-item-styles__Company"]').first().text());
        // Xing markers cover both location and publication date — the first
        // marker is usually the location.
        const markers = card.find('[class*="job-teaser-list-item-styles__Marker"]');
        const location = this.clean(markers.eq(0).text()) || 'Germany';
        // The whole card is a link (card-styles__CardLink) — pick any anchor inside.
        let href = card.find('a[href]').first().attr('href') || '';
        if (href && !href.startsWith('http')) {
          href = `https://www.xing.com${href.startsWith('/') ? '' : '/'}${href}`;
        }

        if (!title || !href) return;
        jobs.push({
          source: 'xing',
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
