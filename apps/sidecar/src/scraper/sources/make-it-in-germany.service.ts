import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Make it in Germany — the German government's official international
 * recruitment portal. Tier: medium.
 *
 * Selectors verified 2026-04 against the live site:
 *   - Correct URL is `/en/working-in-germany/job-listings` (NOT `/en/jobs/jobsearch`)
 *   - `article.card.card--job` wraps each listing
 *   - Title + link: `h3.h5 a`
 *   - Company: first `<p>` immediately after `<header>` inside `.card__text`
 *     (no semantic class, so we target it positionally)
 *   - Location: `li.icon--pin span.element`
 *
 * Filtering is done client-side by matching keyword against title, since
 * the MIG TYPO3 Solr search URL parameters are brittle.
 */
@Injectable()
export class MakeItInGermanyService extends HttpScraperBase {
  constructor() {
    super('MakeItInGermanyService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, { EMEA: ['DE'], GLOBAL: ['DE'] });
    if (!expanded.includes('DE')) return [];

    const keywordRegex = this.makeKeywordRegex(keywords);
    const jobs: RawJob[] = [];

    for (let page = 1; page <= maxPages; page++) {
      // MIG uses ?tx_solr%5Bpage%5D=N for pagination when in-solr-search mode.
      // The default listings page (no query string) shows the most recent
      // jobs — filtering by keyword happens client-side in this scraper.
      const url = `https://www.make-it-in-germany.com/en/working-in-germany/job-listings${page > 1 ? `?tx_solr%5Bpage%5D=${page}` : ''}`;
      const $ = await this.fetchDom(url);
      if (!$) break;

      const cards = $('article.card.card--job');
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const card = $(el);
        const titleAnchor = card.find('h3.h5 a').first();
        const title = this.clean(titleAnchor.text());
        let href = titleAnchor.attr('href') || '';
        if (href && !href.startsWith('http')) {
          href = `https://www.make-it-in-germany.com${href}`;
        }

        // Company is the first <p> sibling of <header>, with no class.
        const company = this.clean(card.find('.card__text > p').first().text())
          || this.clean(card.find('header').nextAll('p').first().text());

        const location = this.clean(
          card.find('li.icon--pin span.element, li.icon--before.icon--pin span.element').first().text(),
        ) || 'Germany';

        if (!title || !href) return;
        if (!keywordRegex.test(title)) return;

        jobs.push({
          source: 'makeItInGermany',
          title,
          company: company || 'Unknown',
          location,
          description: title,
          url: href,
        });
      });
      await this.delay(600);
    }

    this.logger.log(`Make it in Germany returned ${jobs.length} jobs`);
    return jobs;
  }
}
