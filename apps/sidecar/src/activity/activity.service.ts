import { Injectable } from '@nestjs/common';

export type ActivityLevel = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  source: string;
  message: string;
  detail?: string;
}

@Injectable()
export class ActivityService {
  private entries: ActivityEntry[] = [];
  private counter = 0;

  log(level: ActivityLevel, source: string, message: string, detail?: string) {
    this.entries.unshift({
      id: String(++this.counter),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      detail,
    });

    // Keep last 200 entries
    if (this.entries.length > 200) {
      this.entries = this.entries.slice(0, 200);
    }
  }

  info(source: string, message: string, detail?: string) {
    this.log('info', source, message, detail);
  }

  success(source: string, message: string, detail?: string) {
    this.log('success', source, message, detail);
  }

  warn(source: string, message: string, detail?: string) {
    this.log('warning', source, message, detail);
  }

  error(source: string, message: string, detail?: string) {
    this.log('error', source, message, detail);
  }

  getEntries(limit = 50, level?: ActivityLevel): ActivityEntry[] {
    let result = this.entries;
    if (level) {
      result = result.filter((e) => e.level === level);
    }
    return result.slice(0, limit);
  }

  clear() {
    this.entries = [];
  }
}
