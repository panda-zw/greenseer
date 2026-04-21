import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Relocate.me — every listing explicitly offers visa sponsorship + relocation.
 * Tier: medium.
 *
 * Selectors verified 2026-04 against the live site:
 *   - `.jobs-list__job` wraps each card
 *   - `.job__title a` holds the role title + permalink
 *   - `.job__info` contains TWO `.job__company` divs — the first (with a
 *     pin SVG) is the location, the second (with a building SVG) is the
 *     actual company. Yes, the class is misnamed in the source HTML.
 *   - URL pattern: /{country}/{city}/{company}/{slug}-{numericId}
 */
@Injectable()
export class RelocateMeService extends HttpScraperBase {
  constructor() {
    super('RelocateMeService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, {
      EMEA: ['DE', 'NL', 'IE', 'UK'],
      GLOBAL: ['DE', 'NL', 'IE', 'UK', 'US', 'CA'],
    });

    const jobs: RawJob[] = [];
    for (const country of expanded) {
      for (const keyword of keywords) {
        try {
          jobs.push(...(await this.scrapeCountryKeyword(country, keyword, maxPages)));
        } catch (err: any) {
          this.logger.warn(`Relocate.me ${country}/${keyword} failed: ${err.message}`);
        }
        await this.delay(800); // polite delay between requests
      }
    }
    this.logger.log(`Relocate.me returned ${jobs.length} jobs`);
    return jobs;
  }

  private async scrapeCountryKeyword(country: string, keyword: string, maxPages: number): Promise<RawJob[]> {
    const slug = this.countrySlug(country);
    if (!slug) return [];

    const jobs: RawJob[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://relocate.me/search?q=${encodeURIComponent(keyword)}&countries=${slug}&page=${page}`;
      const $ = await this.fetchDom(url);
      if (!$) break;

      const cards = $('.jobs-list__job');
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const card = $(el);
        const titleLink = card.find('.job__title a').first();
        const title = this.clean(titleLink.text() || card.find('.job__title').text());
        let href = titleLink.attr('href') || '';
        if (href && !href.startsWith('http')) href = `https://relocate.me${href}`;

        // See doc-comment above: two `.job__company` elements per card,
        // first is location and second is the real company.
        const infoBlocks = card.find('.job__info .job__company p');
        const location = this.clean(infoBlocks.eq(0).text()) || country;
        const company = this.clean(infoBlocks.eq(1).text()) || 'Unknown';

        if (!title || !href) return;
        jobs.push({
          source: 'relocateMe',
          title,
          company,
          location,
          description: title,
          url: href,
        });
      });
    }
    return jobs;
  }

  private countrySlug(code: string): string | null {
    const map: Record<string, string> = {
      DE: 'germany', NL: 'netherlands', IE: 'ireland', UK: 'united-kingdom',
      US: 'united-states', CA: 'canada',
    };
    return map[code] ?? null;
  }
}
