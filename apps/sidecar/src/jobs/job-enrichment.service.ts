import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import axios from 'axios';

@Injectable()
export class JobEnrichmentService {
  private readonly logger = new Logger(JobEnrichmentService.name);

  private static readonly ALLOWED_HOSTS = [
    'www.linkedin.com',
    'linkedin.com',
    'www.seek.com.au',
    'www.seek.co.nz',
    'seek.com.au',
    'seek.co.nz',
  ];

  constructor(private readonly prisma: PrismaService) {}

  private isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        JobEnrichmentService.ALLOWED_HOSTS.includes(parsed.hostname)
      );
    } catch {
      return false;
    }
  }

  /**
   * Fetch the full description for a job from its original URL.
   * Returns the enriched description or null if it can't be fetched.
   */
  async enrichDescription(jobId: string): Promise<string | null> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return null;

    // Only enrich if description is too short
    if (job.description.length > 200) return job.description;

    // Validate URL against allowlist to prevent SSRF
    if (!this.isAllowedUrl(job.url)) {
      this.logger.warn(`Blocked enrichment for non-allowlisted URL: ${job.url}`);
      return job.description;
    }

    try {
      let description: string | null = null;

      if (job.source === 'linkedin') {
        description = await this.fetchLinkedInDescription(job.url);
      } else if (job.source === 'seek') {
        description = await this.fetchSeekDescription(job.url);
      }

      if (description && description.length > job.description.length) {
        await this.prisma.job.update({
          where: { id: jobId },
          data: { description },
        });
        this.logger.log(`Enriched job ${jobId}: ${job.description.length} -> ${description.length} chars`);
        return description;
      }
    } catch (error: any) {
      this.logger.warn(`Failed to enrich job ${jobId}: ${error.message}`);
    }

    return job.description;
  }

  private async fetchLinkedInDescription(url: string): Promise<string | null> {
    try {
      // LinkedIn public job pages return HTML with the description in a specific div
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      });

      const html = response.data as string;

      // Extract description from the page
      // LinkedIn wraps job description in <div class="show-more-less-html__markup">
      const descMatch = html.match(
        /class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      );

      if (descMatch) {
        return this.htmlToText(descMatch[1]);
      }

      // Alternative: look for description in JSON-LD
      const jsonLdMatch = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
      );

      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          if (jsonLd.description) {
            return this.htmlToText(jsonLd.description);
          }
        } catch { /* invalid JSON-LD */ }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async fetchSeekDescription(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      const html = response.data as string;

      const descMatch = html.match(
        /data-automation="jobAdDetails"[^>]*>([\s\S]*?)<\/div>/,
      );

      if (descMatch) {
        return this.htmlToText(descMatch[1]);
      }

      return null;
    } catch {
      return null;
    }
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
