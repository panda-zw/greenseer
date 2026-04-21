import { Injectable } from '@nestjs/common';
import type { RawJob } from '../dto/raw-job.dto';
import { HttpScraperBase } from './http-base';

/**
 * Jaabz — tech jobs with explicit visa sponsorship + relocation packages.
 * Tier: medium.
 *
 * Selectors verified 2026-04 against the live site:
 *   - `.job-card-professional` wraps each card
 *   - `.job-title-link` is the anchor (title text is inside)
 *   - `.job-location` holds the location
 *   - `.premium-locked` marks cards that require a Jaabz Pro account (we
 *     skip these — they have no readable title/company in the public view)
 *   - `.benefit-visa`, `.benefit-relocation`, `.benefit-remote` are bonus
 *     modifier classes on the card itself — we surface them in the
 *     description so downstream AI matching can see the signal.
 */
@Injectable()
export class JaabzService extends HttpScraperBase {
  constructor() {
    super('JaabzService');
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
    const wantedCountryNames = new Set(
      expanded.map((c) => this.countryName(c)).filter(Boolean) as string[],
    );
    const keywordRegex = this.makeKeywordRegex(keywords);

    const jobs: RawJob[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const url = `https://jaabz.com/jobs${page > 1 ? `?page=${page}` : ''}`;
      const $ = await this.fetchDom(url);
      if (!$) break;

      const cards = $('.job-card-professional');
      if (cards.length === 0) break;

      cards.each((_, el) => {
        const card = $(el);
        // Skip premium-locked cards — their content isn't readable.
        if (card.hasClass('premium-locked')) return;

        const titleLink = card.find('.job-title-link').first();
        const title = this.clean(titleLink.text() || card.find('.job-title').text());
        let href = titleLink.attr('href') || '';
        if (href && !href.startsWith('http')) href = `https://jaabz.com${href}`;

        const company = this.clean(card.find('.job-company, .company-name, h4').first().text());
        const location = this.clean(card.find('.job-location').first().text());

        if (!title || !href) return;
        if (wantedCountryNames.size > 0) {
          const loc = location.toLowerCase();
          const countryMatch = Array.from(wantedCountryNames).some((n) => loc.includes(n.toLowerCase()));
          if (!countryMatch) return;
        }
        if (!keywordRegex.test(title)) return;

        // Flag the benefits so downstream AI can see "this explicitly offers visa sponsorship".
        const benefits: string[] = [];
        if (card.hasClass('benefit-visa')) benefits.push('visa sponsorship');
        if (card.hasClass('benefit-relocation')) benefits.push('relocation');
        if (card.hasClass('benefit-remote')) benefits.push('remote');

        const description = benefits.length > 0
          ? `${title}\n\nBenefits: ${benefits.join(', ')}`
          : title;

        jobs.push({
          source: 'jaabz',
          title,
          company: company || 'Unknown',
          location,
          description,
          url: href,
        });
      });
      await this.delay(600);
    }

    this.logger.log(`Jaabz returned ${jobs.length} jobs`);
    return jobs;
  }

  private countryName(code: string): string | null {
    const map: Record<string, string> = {
      DE: 'Germany', NL: 'Netherlands', IE: 'Ireland', UK: 'United Kingdom',
      US: 'United States', CA: 'Canada',
    };
    return map[code] ?? null;
  }
}
