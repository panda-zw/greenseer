import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ImportedJob {
  jobTitle: string;
  company: string;
  location: string;
  /** One of the app's SUPPORTED_COUNTRIES codes, or 'GLOBAL' as a fallback. */
  countryCode: string;
  description: string;
  sourceUrl: string;
}

/**
 * Imports job details from a pasted URL so the user does not have to fill out
 * the Generator form manually.
 *
 * Strategies, in order:
 *
 * 1. **LinkedIn guest-jobs endpoint** — for any `linkedin.com/jobs/...` URL we
 *    pull the numeric job id out of the URL and hit
 *    `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}`, which
 *    returns an HTML fragment without requiring login. We parse it with
 *    regex (same pattern as the existing Seek scraper — no HTML parser dep).
 *
 * 2. **Generic JSON-LD JobPosting** — for other URLs we fetch the page and
 *    look for any `<script type="application/ld+json">` block containing a
 *    `JobPosting` schema. Most job boards and ATS systems embed this.
 *
 * If neither works we throw a `BadRequestException` with a helpful message so
 * the user can fall back to filling the form by hand.
 */
@Injectable()
export class JobUrlImporterService {
  private readonly logger = new Logger(JobUrlImporterService.name);

  private readonly userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36';

  async importFromUrl(url: string): Promise<ImportedJob> {
    const parsed = this.parseUrl(url);

    if (parsed.hostname.includes('linkedin.com')) {
      return this.importFromLinkedIn(parsed);
    }

    // Generic fallback for other job boards / ATS pages.
    return this.importViaJsonLd(parsed);
  }

  private parseUrl(url: string): URL {
    try {
      return new URL(url.trim());
    } catch {
      throw new BadRequestException('Invalid URL');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // LinkedIn
  // ────────────────────────────────────────────────────────────────────────

  private async importFromLinkedIn(url: URL): Promise<ImportedJob> {
    const jobId = this.extractLinkedInJobId(url);
    if (!jobId) {
      throw new BadRequestException(
        'Could not find a LinkedIn job id in that URL. Paste the full link from the "Apply" page.',
      );
    }

    const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    let html: string;
    try {
      const res = await axios.get<string>(guestUrl, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15_000,
        // LinkedIn returns 200 with an HTML fragment; anything else is an
        // error we want to surface.
        validateStatus: (s) => s >= 200 && s < 300,
      });
      html = res.data;
    } catch (err: any) {
      this.logger.warn(`LinkedIn guest fetch failed for ${jobId}: ${err.message}`);
      throw new BadRequestException(
        'LinkedIn did not return the job details. It may be behind a login wall — try pasting the description manually.',
      );
    }

    // LinkedIn's HTML uses these stable-ish class names on the guest endpoint.
    const title = this.firstMatch(html, [
      /<h3[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
      /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
    ]);

    const company = this.firstMatch(html, [
      /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
      /<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    ]);

    const location = this.firstMatch(html, [
      /<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
    ]);

    // Description sits inside `show-more-less-html__markup`. Grab the whole
    // inner HTML, then strip tags for plain-text use.
    const descriptionHtml = this.firstMatch(html, [
      /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<section[^>]*class="[^"]*description__text[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
    ]);

    if (!title || !descriptionHtml) {
      throw new BadRequestException(
        'Could not parse the LinkedIn job. LinkedIn may have changed their markup — paste the description manually.',
      );
    }

    return {
      jobTitle: this.cleanText(title),
      company: this.cleanText(company ?? ''),
      location: this.cleanText(location ?? ''),
      countryCode: this.inferCountryCode(location ?? ''),
      description: this.htmlToPlainText(descriptionHtml),
      sourceUrl: url.toString(),
    };
  }

  /**
   * LinkedIn job ids are 10-digit numbers. They can live in:
   *   /jobs/view/1234567890
   *   /jobs/view/senior-engineer-at-company-1234567890
   *   ?currentJobId=1234567890
   *   /jobs-guest/jobs/api/jobPosting/1234567890
   */
  private extractLinkedInJobId(url: URL): string | null {
    const currentJobId = url.searchParams.get('currentJobId');
    if (currentJobId && /^\d{6,}$/.test(currentJobId)) return currentJobId;

    // Trailing digits in the path — matches both bare and slug-prefixed formats.
    const pathMatch = url.pathname.match(/(\d{6,})(?:\/|$)/);
    if (pathMatch) return pathMatch[1];

    return null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Generic JSON-LD fallback
  // ────────────────────────────────────────────────────────────────────────

  private async importViaJsonLd(url: URL): Promise<ImportedJob> {
    let html: string;
    try {
      const res = await axios.get<string>(url.toString(), {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15_000,
        maxRedirects: 5,
      });
      html = typeof res.data === 'string' ? res.data : String(res.data);
    } catch (err: any) {
      this.logger.warn(`Generic fetch failed for ${url}: ${err.message}`);
      throw new BadRequestException(
        `Could not fetch ${url.hostname}. Paste the job details manually instead.`,
      );
    }

    // Find every JSON-LD script block and pick the first one that contains
    // a JobPosting schema. Many ATS pages include multiple (BreadcrumbList,
    // Organization, JobPosting), so we can't assume position.
    const blocks = Array.from(
      html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
    );

    for (const block of blocks) {
      const raw = block[1].trim();
      if (!raw.includes('JobPosting')) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      const posting = this.findJobPosting(parsed);
      if (posting) return this.jobPostingToImported(posting, url);
    }

    throw new BadRequestException(
      `${url.hostname} does not expose structured job data we can read. Paste the job details manually.`,
    );
  }

  private findJobPosting(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findJobPosting(item);
        if (found) return found;
      }
      return null;
    }
    const obj = value as Record<string, any>;
    const type = obj['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) {
      return obj;
    }
    // Recurse into common container fields (@graph, mainEntity, etc.).
    for (const key of Object.keys(obj)) {
      const found = this.findJobPosting(obj[key]);
      if (found) return found;
    }
    return null;
  }

  private jobPostingToImported(p: Record<string, any>, url: URL): ImportedJob {
    const title = typeof p.title === 'string' ? p.title : '';
    const hiring = p.hiringOrganization;
    const company =
      (typeof hiring === 'string' ? hiring : hiring?.name) ?? '';

    // jobLocation can be an object or an array of them.
    const loc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
    const address = loc?.address ?? {};
    const locationStr = [address.addressLocality, address.addressRegion, address.addressCountry]
      .filter((x) => typeof x === 'string' && x.trim())
      .join(', ');

    const description = this.htmlToPlainText(
      typeof p.description === 'string' ? p.description : '',
    );

    return {
      jobTitle: this.cleanText(title),
      company: this.cleanText(String(company)),
      location: this.cleanText(locationStr),
      countryCode: this.inferCountryCode(
        typeof address.addressCountry === 'string' ? address.addressCountry : locationStr,
      ),
      description,
      sourceUrl: url.toString(),
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  private firstMatch(html: string, patterns: RegExp[]): string | null {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  /** Strip HTML tags, decode common entities, collapse whitespace. */
  private htmlToPlainText(html: string): string {
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
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '-')
      .replace(/&ndash;/g, '-')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .trim();
  }

  /** Like htmlToPlainText, but for short one-line fields — strips tags and collapses all whitespace. */
  private cleanText(s: string): string {
    return s
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Map a location string or country name to one of the app's supported
   * country codes. Anything we don't recognise falls back to GLOBAL so the
   * user can pick manually.
   *
   * Matching is substring-based and case-insensitive — "Berlin, Germany" and
   * "Germany (Remote)" both map to DE.
   */
  private inferCountryCode(location: string): string {
    if (!location) return 'GLOBAL';
    const lower = location.toLowerCase();

    const rules: Array<[string, RegExp]> = [
      ['AU', /\baustralia\b|\bsydney\b|\bmelbourne\b|\bbrisbane\b|\bperth\b/],
      ['UK', /\bunited kingdom\b|\bengland\b|\bscotland\b|\bwales\b|\bgreat britain\b|\bu\.?k\.?\b|\blondon\b|\bmanchester\b|\bedinburgh\b/],
      ['IE', /\bireland\b|\bdublin\b|\bcork\b/],
      ['CA', /\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b|\bottawa\b/],
      ['US', /\bunited states\b|\busa\b|\bu\.?s\.?a?\.?\b|\bcalifornia\b|\bnew york\b|\btexas\b|\bseattle\b|\bboston\b|\bsan francisco\b/],
      ['DE', /\bgermany\b|\bdeutschland\b|\bberlin\b|\bmunich\b|\bmünchen\b|\bhamburg\b|\bfrankfurt\b|\bcologne\b/],
      ['NL', /\bnetherlands\b|\bholland\b|\bamsterdam\b|\brotterdam\b|\butrecht\b/],
      ['SG', /\bsingapore\b/],
      ['AE', /\bunited arab emirates\b|\buae\b|\bdubai\b|\babu dhabi\b/],
      ['NZ', /\bnew zealand\b|\bauckland\b|\bwellington\b/],
    ];

    for (const [code, re] of rules) {
      if (re.test(lower)) return code;
    }

    // Any other European location → EMEA rather than GLOBAL.
    if (/\beurope\b|\beuropean\b|\bemea\b/.test(lower)) return 'EMEA';

    return 'GLOBAL';
  }
}
