import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { AppSettings } from '@greenseer/shared';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(): Promise<AppSettings> {
    return this.settingsService.getSettings();
  }

  @Put()
  updateSettings(@Body() body: Partial<AppSettings>): Promise<AppSettings> {
    return this.settingsService.updateSettings(body);
  }

  @Post('reset')
  resetSettings(): Promise<AppSettings> {
    return this.settingsService.resetSettings();
  }
}
