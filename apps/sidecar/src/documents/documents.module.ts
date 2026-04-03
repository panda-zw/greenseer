import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DocumentsController } from './documents.controller';
import { DocumentGeneratorService } from './document-generator.service';
import { DocxExportService } from './docx-export.service';

@Module({
  imports: [AiModule],
  controllers: [DocumentsController],
  providers: [DocumentGeneratorService, DocxExportService],
  exports: [DocumentGeneratorService],
})
export class DocumentsModule {}
