import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { RawJob } from '../dto/raw-job.dto';

// Adzuna country codes mapped to API endpoint country strings
const COUNTRY_MAP: Record<string, string> = {
  AU: 'au',
  UK: 'gb',
  CA: 'ca',
  US: 'us',
  DE: 'de',
  NL: 'nl',
  SG: 'sg',
  NZ: 'nz',
  // AE and IE not directly supported by Adzuna, skip
};

/**
 * Region pseudo-codes expanded into Adzuna-supported country codes before
 * searching. Adzuna has no "worldwide" endpoint, so GLOBAL fans out across
 * all supported markets and EMEA across the European ones we support.
 */
const REGION_EXPANSIONS: Record<string, string[]> = {
  GLOBAL: ['US', 'UK', 'DE', 'NL', 'CA', 'AU', 'NZ', 'SG'],
  EMEA: ['UK', 'DE', 'NL'],
};

interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  description: string;
  redirect_url: string;
  category?: { label: string };
  created: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
  count: number;
}

@Injectable()
export class AdzunaService {
  private readonly logger = new Logger(AdzunaService.name);
  private readonly baseUrl = 'https://api.adzuna.com/v1/api/jobs';

  async scrape(
    appId: string,
    apiKey: string,
    countryCodes: string[],
    keywords: string[] = ['software engineer', 'developer'],
    maxPages: number = 2,
  ): Promise<RawJob[]> {
    const allJobs: RawJob[] = [];

    // Expand region pseudo-codes (GLOBAL, EMEA) into real country codes,
    // then de-dupe so overlapping selections don't cause repeat searches.
    const expandedCountries = Array.from(
      new Set(
        countryCodes.flatMap((code) => REGION_EXPANSIONS[code] ?? [code]),
      ),
    );

    for (const countryCode of expandedCountries) {
      const adzunaCountry = COUNTRY_MAP[countryCode];
      if (!adzunaCountry) {
        this.logger.debug(`Adzuna does not support country: ${countryCode}`);
        continue;
      }

      for (const keyword of keywords) {
        try {
          const jobs = await this.searchCountry(
            appId,
            apiKey,
            adzunaCountry,
            keyword,
            maxPages,
          );
          allJobs.push(...jobs);
        } catch (error) {
          this.logger.error(
            `Adzuna search failed for ${adzunaCountry}/${keyword}: ${error}`,
          );
        }
      }
    }

    this.logger.log(`Adzuna returned ${allJobs.length} total jobs`);
    return allJobs;
  }

  private async searchCountry(
    appId: string,
    apiKey: string,
    country: string,
    keyword: string,
    pages: number = 2,
  ): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    for (let page = 1; page <= pages; page++) {
      try {
        const url = `${this.baseUrl}/${country}/search/${page}`;
        const response = await axios.get<AdzunaResponse>(url, {
          params: {
            app_id: appId,
            app_key: apiKey,
            what: keyword,
            results_per_page: 50,
          },
          timeout: 15000,
        });

        for (const result of response.data.results) {
          jobs.push(this.normalizeResult(result, country));
        }

        this.logger.log(
          `Adzuna ${country} page ${page}: ${response.data.results.length} jobs`,
        );
      } catch (error: any) {
        if (error?.response?.status === 429) {
          this.logger.warn(`Adzuna rate limited for ${country}, stopping`);
          break;
        }
        this.logger.error(`Adzuna ${country} page ${page} error: ${error?.response?.status || error.message}`);
        throw error;
      }
    }

    return jobs;
  }

  private normalizeResult(result: AdzunaResult, country: string): RawJob {
    let salary: string | undefined;
    if (result.salary_min && result.salary_max) {
      salary = `${Math.round(result.salary_min)} - ${Math.round(result.salary_max)}`;
    } else if (result.salary_min) {
      salary = `From ${Math.round(result.salary_min)}`;
    } else if (result.salary_max) {
      salary = `Up to ${Math.round(result.salary_max)}`;
    }

    return {
      source: 'adzuna',
      externalId: result.id,
      title: result.title.trim(),
      company: result.company.display_name.trim(),
      location: result.location.display_name.trim(),
      salary,
      description: result.description,
      url: result.redirect_url,
      postedAt: result.created,
      raw: JSON.stringify(result),
    };
  }
}
