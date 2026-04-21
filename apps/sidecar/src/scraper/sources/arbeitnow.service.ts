import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { RawJob } from '../dto/raw-job.dto';

/**
 * Scrapes Arbeitnow's public job board API. Strong DE/NL coverage with
 * visa sponsorship filtering as a first-class feature.
 *
 * API docs: https://documenter.getpostman.com/view/18545278/UVsEVUGQ
 * Response shape: { data: ArbeitnowJob[], meta: { current_page, last_page, ... } }
 */

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string; // HTML
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number; // unix seconds
  visa_sponsorship?: boolean;
}

/**
 * Arbeitnow's API returns listings for all of Europe. We filter client-side
 * by country keyword in the `location` string (the API doesn't expose a
 * country filter).
 */
const COUNTRY_KEYWORDS: Record<string, RegExp> = {
  DE: /\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart)\b/i,
  NL: /\b(netherlands|holland|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague)\b/i,
  UK: /\b(united kingdom|england|scotland|wales|u\.?k\.?|london|manchester|edinburgh|birmingham)\b/i,
  IE: /\b(ireland|dublin|cork|galway)\b/i,
};

@Injectable()
export class ArbeitnowService {
  private readonly logger = new Logger(ArbeitnowService.name);
  private readonly baseUrl = 'https://www.arbeitnow.com/api/job-board-api';

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    // Arbeitnow doesn't support keyword server-side either. We pull as many
    // pages as requested, then filter by country keyword and job title match.
    const all: ArbeitnowJob[] = [];
    try {
      for (let page = 1; page <= maxPages; page++) {
        const res = await axios.get<{ data: ArbeitnowJob[]; meta: any }>(this.baseUrl, {
          params: { page },
          timeout: 15_000,
        });
        if (!res.data.data?.length) break;
        all.push(...res.data.data);
        if (res.data.meta?.current_page >= res.data.meta?.last_page) break;
      }
    } catch (err: any) {
      this.logger.error(`Arbeitnow API error: ${err.message}`);
      return [];
    }

    this.logger.log(`Arbeitnow: fetched ${all.length} jobs from API, filtering…`);

    // Build a case-insensitive match function for keywords (title + tags).
    const keywordRegex = new RegExp(
      keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'i',
    );

    // Expand EMEA/GLOBAL — reuse the same semantics the orchestrator uses.
    const wanted = new Set(
      countryCodes.flatMap((c) => {
        if (c === 'EMEA') return ['DE', 'NL', 'UK', 'IE'];
        if (c === 'GLOBAL') return Object.keys(COUNTRY_KEYWORDS);
        return [c];
      }),
    );

    const results: RawJob[] = [];
    for (const job of all) {
      // Country filter
      const country = Object.entries(COUNTRY_KEYWORDS).find(
        ([code, re]) => wanted.has(code) && re.test(job.location),
      );
      if (!country) continue;

      // Keyword filter (title OR tag match)
      const haystack = `${job.title} ${job.tags.join(' ')}`;
      if (!keywordRegex.test(haystack)) continue;

      results.push({
        source: 'arbeitnow',
        externalId: job.slug,
        title: job.title,
        company: job.company_name,
        location: job.location,
        description: this.stripHtml(job.description),
        url: job.url,
        postedAt: new Date(job.created_at * 1000).toISOString(),
      });
    }

    this.logger.log(`Arbeitnow returned ${results.length} matching jobs`);
    return results;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
