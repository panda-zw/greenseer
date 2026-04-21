import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AiModule } from '../ai/ai.module';
import { DedupService } from './dedup.service';
import { AdzunaService } from './sources/adzuna.service';
import { ArbeitnowService } from './sources/arbeitnow.service';
import { LinkedInService } from './sources/linkedin.service';
import { SeekService } from './sources/seek.service';
import { RelocateMeService } from './sources/relocate-me.service';
import { NextLevelJobsService } from './sources/next-level-jobs.service';
import { IrishJobsService } from './sources/irish-jobs.service';
import { JobsIeService } from './sources/jobs-ie.service';
import { JaabzService } from './sources/jaabz.service';
import { MakeItInGermanyService } from './sources/make-it-in-germany.service';
import { StepstoneService } from './sources/stepstone.service';
import { GlassdoorService } from './sources/glassdoor.service';
import { XingService } from './sources/xing.service';
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
    ArbeitnowService,
    LinkedInService,
    SeekService,
    RelocateMeService,
    NextLevelJobsService,
    IrishJobsService,
    JobsIeService,
    JaabzService,
    MakeItInGermanyService,
    StepstoneService,
    GlassdoorService,
    XingService,
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
