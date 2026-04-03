import { Injectable, Logger, Optional, Inject, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ActivityService } from '../activity/activity.service';
import { DedupService } from './dedup.service';
import { AdzunaService } from './sources/adzuna.service';
import { LinkedInService } from './sources/linkedin.service';
import { SeekService } from './sources/seek.service';
import type { RawJob } from './dto/raw-job.dto';
import type { JobSource } from '@greenseer/shared';

export const JOB_PROCESSOR_TOKEN = 'JOB_PROCESSOR';

export interface IJobProcessor {
  enqueueMany(jobIds: string[]): Promise<void>;
}

@Injectable()
export class ScrapeOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(ScrapeOrchestratorService.name);
  private isRunning = false;
  private isPaused = false;
  private isCancelled = false;
  private startedAt: Date | null = null;
  private lastCompletedAt: Date | null = null;
  private lastResult: { found: number; new: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly activity: ActivityService,
    private readonly dedup: DedupService,
    private readonly adzuna: AdzunaService,
    private readonly linkedin: LinkedInService,
    private readonly seek: SeekService,
    @Optional() @Inject(JOB_PROCESSOR_TOKEN) private readonly jobProcessor?: IJobProcessor,
  ) {}

  async onModuleDestroy() {
    await Promise.allSettled([
      this.linkedin.kill(),
      this.seek.kill(),
    ]);
  }

  getStatus() {
    return {
      running: this.isRunning,
      paused: this.isPaused,
      startedAt: this.startedAt?.toISOString() || null,
      lastCompletedAt: this.lastCompletedAt?.toISOString() || null,
      lastResult: this.lastResult,
    };
  }

  get running() {
    return this.isRunning;
  }

  get paused() {
    return this.isPaused;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.logger.log(`Scraping ${this.isPaused ? 'paused' : 'resumed'}`);
    return this.isPaused;
  }

  async cancel() {
    if (this.isRunning) {
      this.isCancelled = true;
      this.activity.warn('Scraper', 'Search cancelled by user');
      this.logger.log('Scrape cancelled — killing browsers');
      // Force close any running browser instances
      await Promise.allSettled([
        this.linkedin.kill(),
        this.seek.kill(),
      ]);
    }
  }

  /**
   * Run all enabled sources.
   */
  async runAll(keys: { adzunaAppId?: string; adzunaKey?: string }): Promise<{
    totalFound: number;
    totalNew: number;
  }> {
    if (this.isRunning) {
      this.logger.warn('Scrape already in progress, skipping');
      return { totalFound: 0, totalNew: 0 };
    }

    if (this.isPaused) {
      this.logger.debug('Scraping is paused, skipping');
      return { totalFound: 0, totalNew: 0 };
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.startedAt = new Date();
    let totalFound = 0;
    let totalNew = 0;
    const appSettings = await this.settings.getSettings();

    try {
      const enabledCountries = appSettings.search.countries
        .filter((c) => c.enabled)
        .map((c) => c.code);

      if (enabledCountries.length === 0) {
        this.logger.warn('No countries enabled, skipping scrape');
        this.activity.warn('Scraper', 'No countries enabled — configure in Settings');
        return { totalFound: 0, totalNew: 0 };
      }

      const keywords = appSettings.search.keywords.length > 0
        ? appSettings.search.keywords
        : ['software engineer', 'developer'];

      const maxPages = appSettings.search.maxPagesPerSource || 2;

      if (appSettings.search.keywords.length === 0) {
        this.activity.warn('Scraper', 'No search keywords set — using defaults', 'Add keywords in Settings > Search');
      }

      // Run Adzuna
      if (appSettings.sources.adzuna.enabled) {
        if (!keys.adzunaAppId || !keys.adzunaKey) {
          this.activity.warn('Scraper', 'Adzuna skipped — API keys not configured', 'Add your Adzuna App ID and API Key in Settings > API Keys');
        } else {
          const result = await this.runSource('adzuna', () =>
            this.adzuna.scrape(keys.adzunaAppId!, keys.adzunaKey!, enabledCountries, keywords, maxPages),
          );
          totalFound += result.found;
          totalNew += result.new;
        }
      }

      // Run LinkedIn
      if (appSettings.sources.linkedin.enabled && !this.isCancelled) {
        const result = await this.runSource('linkedin', () =>
          this.linkedin.scrape(enabledCountries, keywords, maxPages),
        );
        totalFound += result.found;
        totalNew += result.new;
      }

      // Run Seek
      if (appSettings.sources.seek.enabled && !this.isCancelled) {
        const result = await this.runSource('seek', () =>
          this.seek.scrape(enabledCountries, keywords, maxPages),
        );
        totalFound += result.found;
        totalNew += result.new;
      }
    } finally {
      this.isRunning = false;
      this.lastCompletedAt = new Date();
      this.lastResult = { found: totalFound, new: totalNew };
    }

    this.logger.log(
      `Scrape complete: ${totalFound} found, ${totalNew} new after dedup`,
    );

    if (totalFound === 0 && totalNew === 0) {
      // Check if any source actually ran
      const adzunaOn = appSettings.sources.adzuna.enabled;
      const linkedinOn = appSettings.sources.linkedin.enabled;
      const seekOn = appSettings.sources.seek.enabled;
      if (!adzunaOn && !linkedinOn && !seekOn) {
        this.activity.warn('Scraper', 'No sources enabled', 'Enable at least one source in Settings > Sources');
      }
    }

    return { totalFound, totalNew };
  }

  /**
   * Run a single source by name.
   */
  async runSingle(
    source: JobSource,
    keys: { adzunaAppId?: string; adzunaKey?: string },
  ): Promise<{ found: number; new: number }> {
    const appSettings = await this.settings.getSettings();
    const enabledCountries = appSettings.search.countries
      .filter((c) => c.enabled)
      .map((c) => c.code);
    const keywords = appSettings.search.keywords.length > 0
      ? appSettings.search.keywords
      : ['software engineer', 'developer'];
    const maxPages = appSettings.search.maxPagesPerSource || 2;

    switch (source) {
      case 'adzuna':
        if (!keys.adzunaAppId || !keys.adzunaKey) {
          throw new Error('Adzuna API keys not configured');
        }
        return this.runSource('adzuna', () =>
          this.adzuna.scrape(keys.adzunaAppId!, keys.adzunaKey!, enabledCountries, keywords, maxPages),
        );
      case 'linkedin':
        return this.runSource('linkedin', () =>
          this.linkedin.scrape(enabledCountries, keywords, maxPages),
        );
      case 'seek':
        return this.runSource('seek', () =>
          this.seek.scrape(enabledCountries, keywords, maxPages),
        );
    }
  }

  private async runSource(
    source: JobSource,
    scrapeFn: () => Promise<RawJob[]>,
  ): Promise<{ found: number; new: number }> {
    const log = await this.prisma.scrapeLog.create({
      data: { source },
    });

    let found = 0;
    let afterDedup = 0;
    const newJobIds: string[] = [];

    try {
      this.logger.log(`Starting ${source} scrape...`);
      this.activity.info('Scraper', `Starting ${source} search...`);
      const rawJobs = await scrapeFn();
      found = rawJobs.length;

      // Dedup and store
      for (const rawJob of rawJobs) {
        const fingerprint = this.dedup.generateFingerprint(
          rawJob.company,
          rawJob.title,
          rawJob.location,
        );

        if (await this.dedup.isDuplicate(fingerprint)) {
          continue;
        }

        try {
          const created = await this.prisma.job.create({
            data: {
              source: rawJob.source,
              externalId: rawJob.externalId,
              title: rawJob.title,
              company: rawJob.company,
              location: rawJob.location,
              salary: rawJob.salary,
              description: rawJob.description,
              url: rawJob.url,
              fingerprint,
              postedAt: rawJob.postedAt ? new Date(rawJob.postedAt) : undefined,
              raw: rawJob.raw,
            },
          });
          this.dedup.registerFingerprint(fingerprint);
          newJobIds.push(created.id);
          afterDedup++;
        } catch (error: any) {
          // Unique constraint violation means duplicate — skip silently
          if (error?.code === 'P2002') {
            this.dedup.registerFingerprint(fingerprint);
            continue;
          }
          this.logger.error(`Failed to store job: ${error}`);
        }
      }

      // Enqueue new jobs for AI processing
      if (newJobIds.length > 0 && this.jobProcessor) {
        await this.jobProcessor.enqueueMany(newJobIds);
      }

      await this.prisma.scrapeLog.update({
        where: { id: log.id },
        data: {
          completedAt: new Date(),
          jobsFound: found,
          jobsAfterDedup: afterDedup,
        },
      });

      this.logger.log(
        `${source}: ${found} found, ${afterDedup} new after dedup`,
      );
      this.activity.success('Scraper', `${source}: ${found} found, ${afterDedup} new`, afterDedup > 0 ? `${afterDedup} jobs queued for AI analysis` : undefined);
    } catch (error: any) {
      await this.prisma.scrapeLog.update({
        where: { id: log.id },
        data: {
          completedAt: new Date(),
          jobsFound: found,
          jobsAfterDedup: afterDedup,
          error: error?.message || String(error),
        },
      });
      this.logger.error(`${source} scrape failed: ${error}`);
      this.activity.error('Scraper', `${source} failed: ${error?.message || error}`);
    }

    return { found, new: afterDedup };
  }
}
