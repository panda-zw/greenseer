import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiModule } from '../ai/ai.module';
import { DedupService } from './dedup.service';
import { AdzunaService } from './sources/adzuna.service';
import { LinkedInService } from './sources/linkedin.service';
import { SeekService } from './sources/seek.service';
import { ScrapeOrchestratorService, JOB_PROCESSOR_TOKEN } from './scrape-orchestrator.service';
import { ScrapeSchedulerService } from './scrape-scheduler.service';
import { ScraperController } from './scraper.controller';
import { JobProcessorService } from '../ai/job-processor.service';

@Module({
  imports: [SettingsModule, AiModule],
  controllers: [ScraperController],
  providers: [
    DedupService,
    AdzunaService,
    LinkedInService,
    SeekService,
    ScrapeOrchestratorService,
    ScrapeSchedulerService,
    {
      provide: JOB_PROCESSOR_TOKEN,
      useExisting: JobProcessorService,
    },
  ],
  exports: [ScrapeOrchestratorService, DedupService],
})
export class ScraperModule {}
