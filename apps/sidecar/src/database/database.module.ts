import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { KeyStoreService } from '../keystore.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [PrismaService, KeyStoreService, EncryptionService],
  exports: [PrismaService, KeyStoreService, EncryptionService],
})
export class DatabaseModule {}
