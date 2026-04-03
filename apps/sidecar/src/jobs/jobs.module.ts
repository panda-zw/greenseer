import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobEnrichmentService } from './job-enrichment.service';
import { ScraperModule } from '../scraper/scraper.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ScraperModule, AiModule],
  controllers: [JobsController],
  providers: [JobsService, JobEnrichmentService],
  exports: [JobsService],
})
export class JobsModule {}
