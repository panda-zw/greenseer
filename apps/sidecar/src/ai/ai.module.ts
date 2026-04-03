import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ClaudeService } from './claude.service';
import { VisaVerificationService } from './visa-verification.service';
import { CvMatchingService } from './cv-matching.service';
import { JobProcessorService } from './job-processor.service';
import { KnownSponsorsService } from './known-sponsors.service';

@Module({
  imports: [SettingsModule],
  providers: [
    ClaudeService,
    VisaVerificationService,
    CvMatchingService,
    JobProcessorService,
    KnownSponsorsService,
  ],
  exports: [JobProcessorService, ClaudeService, KnownSponsorsService],
})
export class AiModule {}
