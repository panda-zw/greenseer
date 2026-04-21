import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ProjectsModule } from '../projects/projects.module';
import { DocumentsController } from './documents.controller';
import { DocumentGeneratorService } from './document-generator.service';
import { DocxExportService } from './docx-export.service';
import { PdfExportService } from './pdf-export.service';
import { JobUrlImporterService } from './job-url-importer.service';
import { LinkedInOptimizerService } from './linkedin-optimizer.service';

@Module({
  imports: [AiModule, ProjectsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentGeneratorService,
    DocxExportService,
    PdfExportService,
    JobUrlImporterService,
    LinkedInOptimizerService,
  ],
  exports: [DocumentGeneratorService],
})
export class DocumentsModule {}
