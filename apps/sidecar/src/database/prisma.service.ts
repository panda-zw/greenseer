import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { EncryptionService } from './encryption.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(public readonly encryption: EncryptionService) {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./dev.db',
        },
      },
    });
  }

  async onModuleInit() {
    // Find sidecar root (where prisma/schema.prisma lives)
    // __dirname is dist/database/ in compiled output
    const sidecarRoot = resolve(__dirname, '..', '..');

    this.logger.log(`Syncing database schema (cwd: ${sidecarRoot})...`);
    try {
      const output = execSync(
        'npx prisma db push --skip-generate 2>&1',
        {
          cwd: sidecarRoot,
          env: { ...process.env },
          timeout: 30000,
          encoding: 'utf-8',
        },
      );
      this.logger.log('Schema sync complete');
    } catch (e: any) {
      const stderr = e.stderr || e.stdout || e.message || '';
      this.logger.error(`Schema sync failed: ${stderr.slice(0, 300)}`);
      // Try to connect anyway — tables may already exist
    }

    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
