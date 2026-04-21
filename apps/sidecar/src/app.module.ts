import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { ActivityModule } from './activity/activity.module';
import { SettingsModule } from './settings/settings.module';
import { ScraperModule } from './scraper/scraper.module';
import { AiModule } from './ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { CvModule } from './cv/cv.module';
import { DocumentsModule } from './documents/documents.module';
import { TrackerModule } from './tracker/tracker.module';
import { SponsorsModule } from './sponsors/sponsors.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    // Throttler available for per-route use (scraper endpoints), not applied globally
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'scraper', ttl: 300000, limit: 3 },
      ],
    }),
    DatabaseModule,
    ActivityModule,
    SettingsModule,
    ScraperModule,
    AiModule,
    JobsModule,
    CvModule,
    DocumentsModule,
    TrackerModule,
    SponsorsModule,
    ProjectsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
