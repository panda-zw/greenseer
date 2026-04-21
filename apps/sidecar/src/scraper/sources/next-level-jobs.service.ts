import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Next Level Jobs EU — EU-focused listings from companies that hire
 * internationally. Tier: medium.
 *
 * Selectors verified 2026-04 against the live site:
 *   - `details.job-group` wraps each company's job group
 *   - each job inside is an `li` containing
 *     `a[href^="/companies/"][href*="/jobs/"]` with the title text
 *   - company name is in `details > summary span.font-semibold` (shared
 *     across all jobs within that details element)
 *   - location is in `p.text-xs span` inside the `li`
 */
@Injectable()
export class NextLevelJobsService extends HttpScraperBase {
  constructor() {
    super('NextLevelJobsService');
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    const expanded = this.expandCountries(countryCodes, {
      EMEA: ['DE', 'NL', 'IE', 'UK'],
      GLOBAL: ['DE', 'NL', 'IE', 'UK'],
    });

    const keywordRegex = this.makeKeywordRegex(keywords);
    const jobs: RawJob[] = [];

    for (const country of expanded) {
      const slug = this.countrySlug(country);
      if (!slug) continue;

      for (let page = 1; page <= maxPages; page++) {
        const url = `https://nextleveljobs.eu/country/${slug}${page > 1 ? `?page=${page}` : ''}`;
        const $ = await this.fetchDom(url);
        if (!$) break;

        const groups = $('details.job-group');
        if (groups.length === 0) break;

        // Company name lives on the outer <details> element — one per
        // group, shared by every <li> inside.
        groups.each((_, groupEl) => {
          const group = $(groupEl);
          const company = this.clean(group.find('summary span.font-semibold').first().text()) || 'Unknown';

          group.find('li a[href*="/companies/"][href*="/jobs/"]').each((__, linkEl) => {
            const link = $(linkEl);
            const li = link.closest('li');
            const title = this.clean(link.text());
            let href = link.attr('href') || '';
            if (href && !href.startsWith('http')) href = `https://nextleveljobs.eu${href}`;
            // The location is in the second <p> inside the li — the first
            // <p> is the title repeated. `p.text-xs` targets the smaller
            // "Germany" label under the title.
            const location = this.clean(li.find('p.text-xs span').first().text())
              || this.clean(li.find('p').eq(1).text())
              || country;

            if (!title || !href) return;
            if (!keywordRegex.test(title)) return;

            jobs.push({
              source: 'nextLevelJobs',
              title,
              company,
              location,
              description: title,
              url: href,
            });
          });
        });
        await this.delay(600);
      }
    }

    this.logger.log(`Next Level Jobs returned ${jobs.length} jobs`);
    return jobs;
  }

  private countrySlug(code: string): string | null {
    const map: Record<string, string> = { DE: 'de', NL: 'nl', IE: 'ie', UK: 'gb' };
    return map[code] ?? null;
  }
}
