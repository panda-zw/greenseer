import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { HealthResponse, KeysPayload } from '@greenseer/shared';
import { KeyStoreService } from './keystore.service';
import { InternalGuard } from './common/internal.guard';

@Controller()
export class AppController {
  private startTime = Date.now();

  constructor(private readonly keyStore: KeyStoreService) {}

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Post('internal/keys')
  @UseGuards(InternalGuard)
  setKeys(@Body() payload: KeysPayload): { ok: boolean } {
    this.keyStore.setKeys(payload);
    return { ok: true };
  }

  getKeys(): KeysPayload {
    return this.keyStore.getKeys();
  }
}
