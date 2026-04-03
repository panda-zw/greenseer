import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { ScrapeOrchestratorService } from './scrape-orchestrator.service';
import { ScrapeSchedulerService } from './scrape-scheduler.service';
import { KeyStoreService } from '../keystore.service';
import type { JobSource, ScrapeLogDto } from '@greenseer/shared';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly scheduler: ScrapeSchedulerService,
    private readonly keyStore: KeyStoreService,
  ) {}

  @Get('status')
  getStatus() {
    return this.orchestrator.getStatus();
  }

  @Post('run')
  @Throttle({ scraper: { ttl: 300000, limit: 3 } })
  async runAll() {
    const keys = this.keyStore.getKeys();
    const result = await this.orchestrator.runAll({
      adzunaAppId: keys.adzunaAppId,
      adzunaKey: keys.adzunaKey,
    });
    return result;
  }

  @Post('run/:source')
  @Throttle({ scraper: { ttl: 300000, limit: 3 } })
  async runSource(@Param('source') source: JobSource) {
    const keys = this.keyStore.getKeys();
    const result = await this.orchestrator.runSingle(source, {
      adzunaAppId: keys.adzunaAppId,
      adzunaKey: keys.adzunaKey,
    });
    return result;
  }

  @Post('cancel')
  cancel() {
    this.orchestrator.cancel();
    return { ok: true };
  }

  @Post('toggle-pause')
  togglePause() {
    const paused = this.orchestrator.togglePause();
    return { paused };
  }

  @Get('logs')
  async getLogs(
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ): Promise<ScrapeLogDto[]> {
    const logs = await this.prisma.scrapeLog.findMany({
      where: source ? { source } : undefined,
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit || '20', 10),
    });

    return logs.map((log) => ({
      id: log.id,
      source: log.source as JobSource,
      startedAt: log.startedAt.toISOString(),
      completedAt: log.completedAt?.toISOString() || null,
      jobsFound: log.jobsFound,
      jobsAfterDedup: log.jobsAfterDedup,
      error: log.error,
    }));
  }

  @Get('logs/latest')
  async getLatestLogs(): Promise<Record<string, ScrapeLogDto | null>> {
    const sources: JobSource[] = ['adzuna', 'linkedin', 'seek'];
    const result: Record<string, ScrapeLogDto | null> = {};

    for (const source of sources) {
      const log = await this.prisma.scrapeLog.findFirst({
        where: { source },
        orderBy: { startedAt: 'desc' },
      });

      result[source] = log
        ? {
            id: log.id,
            source: log.source as JobSource,
            startedAt: log.startedAt.toISOString(),
            completedAt: log.completedAt?.toISOString() || null,
            jobsFound: log.jobsFound,
            jobsAfterDedup: log.jobsAfterDedup,
            error: log.error,
          }
        : null;
    }

    return result;
  }
}
