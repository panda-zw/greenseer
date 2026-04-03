import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);
  private readonly fingerprints = new Set<string>();
  private readonly suppressed = new Set<string>();
  private loaded = false;

  constructor(private readonly prisma: PrismaService) {}

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const jobs = await this.prisma.job.findMany({
        select: { fingerprint: true },
      });
      for (const job of jobs) {
        this.fingerprints.add(job.fingerprint);
      }

      const applications = await this.prisma.application.findMany({
        select: { job: { select: { fingerprint: true } } },
      });
      for (const app of applications) {
        if (app.job) {
          this.suppressed.add(app.job.fingerprint);
        }
      }

      this.logger.log(
        `Loaded ${this.fingerprints.size} fingerprints and ${this.suppressed.size} suppressed jobs`,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to load dedup data: ${error.message}`);
      this.loaded = false; // Retry next time
    }
  }

  generateFingerprint(company: string, title: string, location: string): string {
    const normalized = this.normalize(`${company}|${title}|${location}`);
    return createHash('sha256').update(normalized).digest('hex').slice(0, 32);
  }

  async isDuplicate(fingerprint: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.fingerprints.has(fingerprint) || this.suppressed.has(fingerprint);
  }

  registerFingerprint(fingerprint: string) {
    this.fingerprints.add(fingerprint);
  }

  suppress(fingerprint: string) {
    this.suppressed.add(fingerprint);
  }

  private normalize(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^\w\s|]/g, '')
      .replace(/\b(ltd|inc|pty|llc|gmbh|corp|limited|corporation)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
