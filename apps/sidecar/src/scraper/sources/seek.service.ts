import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { RawJob } from '../dto/raw-job.dto';

const SEEK_DOMAINS: Record<string, string> = {
  AU: 'https://www.seek.com.au',
  NZ: 'https://www.seek.co.nz',
};

@Injectable()
export class SeekService {
  private readonly logger = new Logger(SeekService.name);

  async kill() {
    // No browser to kill — we use HTTP
  }

  async scrape(
    countryCodes: string[],
    keywords: string[] = ['software engineer'],
    maxPages: number = 3,
  ): Promise<RawJob[]> {
    const allJobs: RawJob[] = [];

    const seekCountries = countryCodes.filter((c) => c in SEEK_DOMAINS);
    if (seekCountries.length === 0) {
      this.logger.log('No Seek-supported countries enabled');
      return [];
    }

    this.logger.log('Seek: Note — Seek has aggressive bot detection. Results may be limited.');

    for (const countryCode of seekCountries) {
      const baseUrl = SEEK_DOMAINS[countryCode];

      for (const keyword of keywords) {
        try {
          this.logger.log(`Seek: searching "${keyword}" in ${countryCode}...`);
          const jobs = await this.searchKeyword(baseUrl, keyword, countryCode, maxPages);
          this.logger.log(`Seek: "${keyword}" in ${countryCode} → ${jobs.length} jobs`);
          allJobs.push(...jobs);
        } catch (error: any) {
          this.logger.error(`Seek search failed for ${countryCode}/${keyword}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Seek returned ${allJobs.length} total jobs`);
    return allJobs;
  }

  private async searchKeyword(
    baseUrl: string,
    keyword: string,
    countryCode: string,
    maxPages: number,
  ): Promise<RawJob[]> {
    const jobs: RawJob[] = [];
    const encodedKeyword = keyword.replace(/\s+/g, '-');

    for (let page = 1; page <= maxPages; page++) {
      try {
        // Seek's API endpoint returns JSON — much more reliable than scraping HTML
        const apiUrl = `${baseUrl}/api/chalice-search/v4/search?siteKey=${countryCode === 'AU' ? 'AU-Main' : 'NZ-Main'}&where=All+${countryCode}&keywords=${encodeURIComponent(keyword)}&page=${page}&pageSize=25`;

        const response = await axios.get(apiUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });

        const data = response.data;
        const results = data?.data || [];

        for (const result of results) {
          const title = result.title || result.advertiser?.description || '';
          const company = result.advertiser?.description || result.companyName || '';
          const location = result.location || result.suburb || '';
          const salary = result.salary || result.salaryLabel || undefined;
          const jobId = result.id || result.listingId || '';
          const jobUrl = `${baseUrl}/job/${jobId}`;
          const description = result.teaser || result.bulletPoints?.join('\n') || title;
          const postedAt = result.listingDate || result.createdAt || undefined;

          if (title) {
            jobs.push({
              source: 'seek',
              externalId: String(jobId),
              title,
              company,
              location,
              salary,
              description,
              url: jobUrl,
              postedAt,
            });
          }
        }

        this.logger.log(`Seek ${countryCode} page ${page}: ${results.length} results`);

        if (results.length < 20) break; // No more pages
        await this.delay(1000 + Math.random() * 1000);
      } catch (error: any) {
        if (error?.response?.status === 403) {
          this.logger.warn(`Seek API blocked for ${countryCode} page ${page} — trying HTML fallback`);
          const htmlJobs = await this.scrapeHtmlPage(baseUrl, encodedKeyword, countryCode, page);
          jobs.push(...htmlJobs);
          if (htmlJobs.length === 0) break;
        } else {
          this.logger.error(`Seek ${countryCode} page ${page} error: ${error.message}`);
          break;
        }
      }
    }

    return jobs;
  }

  /** Fallback: scrape HTML if API is blocked */
  private async scrapeHtmlPage(
    baseUrl: string,
    keyword: string,
    countryCode: string,
    page: number,
  ): Promise<RawJob[]> {
    try {
      const url = `${baseUrl}/${keyword}-jobs?page=${page}`;
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });

      const html = response.data as string;

      // Try to extract JSON data from the page
      const jsonMatch = html.match(/window\.SEEK_REDUX_DATA\s*=\s*({[\s\S]*?});\s*<\/script>/);
      if (jsonMatch) {
        try {
          const reduxData = JSON.parse(jsonMatch[1]);
          const results = reduxData?.results?.results?.jobs || [];
          return results.map((r: any) => ({
            source: 'seek' as const,
            externalId: String(r.id),
            title: r.title || '',
            company: r.advertiser?.description || '',
            location: r.location || '',
            salary: r.salary || undefined,
            description: r.teaser || r.title || '',
            url: `${baseUrl}/job/${r.id}`,
            postedAt: r.listingDate || undefined,
          })).filter((j: any) => j.title);
        } catch { /* JSON parse failed */ }
      }

      return [];
    } catch {
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
