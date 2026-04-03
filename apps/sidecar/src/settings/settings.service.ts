import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_SETTINGS, type AppSettings } from '@greenseer/shared';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AppSettings> {
    const record = await this.prisma.settings.findUnique({
      where: { id: 'singleton' },
    });

    if (!record) {
      return DEFAULT_SETTINGS;
    }

    try {
      const stored = JSON.parse(record.value) as Partial<AppSettings>;
      return this.deepMerge(DEFAULT_SETTINGS, stored);
    } catch {
      this.logger.warn('Failed to parse stored settings, returning defaults');
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(
    partial: Partial<AppSettings>,
  ): Promise<AppSettings> {
    const current = await this.getSettings();
    const merged = this.deepMerge(current, partial);

    await this.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', value: JSON.stringify(merged) },
      update: { value: JSON.stringify(merged) },
    });

    return merged;
  }

  async resetSettings(): Promise<AppSettings> {
    await this.prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', value: JSON.stringify(DEFAULT_SETTINGS) },
      update: { value: JSON.stringify(DEFAULT_SETTINGS) },
    });
    return DEFAULT_SETTINGS;
  }

  private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    for (const key of Object.keys(source) as (keyof T)[]) {
      const sourceVal = source[key];
      const targetVal = target[key];
      if (
        sourceVal !== null &&
        sourceVal !== undefined &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        typeof targetVal === 'object' &&
        targetVal !== null &&
        !Array.isArray(targetVal)
      ) {
        result[key] = this.deepMerge(
          targetVal as Record<string, any>,
          sourceVal as Record<string, any>,
        ) as T[keyof T];
      } else if (sourceVal !== undefined) {
        result[key] = sourceVal as T[keyof T];
      }
    }
    return result;
  }
}
