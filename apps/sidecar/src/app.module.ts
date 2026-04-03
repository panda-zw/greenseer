import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60000, limit: 300 },   // 300 req/min general
        { name: 'scraper', ttl: 300000, limit: 3 },     // 3 scraper runs per 5 min
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
