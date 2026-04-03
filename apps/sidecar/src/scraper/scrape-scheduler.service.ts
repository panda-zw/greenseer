import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { ScrapeOrchestratorService } from './scrape-orchestrator.service';
import { KeyStoreService } from '../keystore.service';

@Injectable()
export class ScrapeSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScrapeSchedulerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private currentIntervalHours = 0;

  constructor(
    private readonly settings: SettingsService,
    private readonly orchestrator: ScrapeOrchestratorService,
    private readonly keyStore: KeyStoreService,
  ) {}

  async onModuleInit() {
    // Delay setup to ensure DB is ready
    setTimeout(() => this.init(), 5000);
  }

  private async init() {
    await this.setupSchedule();
    // Run first scrape after additional delay for API keys
    setTimeout(() => this.triggerScrape(), 25_000);
  }

  async setupSchedule() {
    const appSettings = await this.settings.getSettings();
    const intervalHours = appSettings.schedule.intervalHours;

    if (intervalHours === this.currentIntervalHours && this.intervalHandle) {
      return; // No change
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }

    this.currentIntervalHours = intervalHours;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.intervalHandle = setInterval(() => this.triggerScrape(), intervalMs);

    this.logger.log(`Scrape scheduled every ${intervalHours} hours`);
  }

  async triggerScrape() {
    // Check quiet hours
    const appSettings = await this.settings.getSettings();
    if (this.isQuietHours(appSettings.schedule)) {
      this.logger.debug('In quiet hours, skipping scrape');
      return;
    }

    const keys = this.keyStore.getKeys();
    if (!keys.adzunaAppId && !keys.adzunaKey && !keys.anthropicKey) {
      this.logger.debug('No API keys configured yet, skipping scheduled scrape');
      return;
    }

    try {
      await this.orchestrator.runAll({
        adzunaAppId: keys.adzunaAppId,
        adzunaKey: keys.adzunaKey,
      });
    } catch (error) {
      this.logger.error(`Scheduled scrape failed: ${error}`);
    }

    // Re-check schedule in case settings changed
    await this.setupSchedule();
  }

  private isQuietHours(schedule: {
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  }): boolean {
    if (!schedule.quietHoursStart || !schedule.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = schedule.quietHoursStart.split(':').map(Number);
    const [endH, endM] = schedule.quietHoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same day range (e.g., 09:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 - 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }
}
