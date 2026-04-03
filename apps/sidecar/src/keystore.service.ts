import { Injectable, Logger } from '@nestjs/common';
import type { KeysPayload } from '@greenseer/shared';

@Injectable()
export class KeyStoreService {
  private readonly logger = new Logger(KeyStoreService.name);
  private keys: KeysPayload = {};

  constructor() {
    // Also read from env vars as fallback (for dev/testing)
    if (process.env.ANTHROPIC_API_KEY) {
      this.keys.anthropicKey = process.env.ANTHROPIC_API_KEY;
      this.logger.log('Loaded Anthropic key from env');
    }
    if (process.env.ADZUNA_APP_ID) {
      this.keys.adzunaAppId = process.env.ADZUNA_APP_ID;
      this.logger.log('Loaded Adzuna App ID from env');
    }
    if (process.env.ADZUNA_API_KEY) {
      this.keys.adzunaKey = process.env.ADZUNA_API_KEY;
      this.logger.log('Loaded Adzuna API key from env');
    }
  }

  setKeys(payload: KeysPayload) {
    const keyNames = Object.entries(payload)
      .filter(([, v]) => v)
      .map(([k]) => k);
    this.logger.log(`Keys updated: ${keyNames.join(', ') || '(empty)'}`);
    this.keys = { ...this.keys, ...payload };
  }

  getKeys(): KeysPayload {
    return this.keys;
  }

  hasAdzunaKeys(): boolean {
    return !!this.keys.adzunaAppId && !!this.keys.adzunaKey;
  }

  hasAnthropicKey(): boolean {
    return !!this.keys.anthropicKey;
  }
}
