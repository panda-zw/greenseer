import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';
import { SkillsExtractionService } from './skills-extraction.service';
import { FileParserService } from './file-parser.service';

@Module({
  imports: [AiModule],
  controllers: [CvController],
  providers: [CvService, SkillsExtractionService, FileParserService],
  exports: [CvService],
})
export class CvModule {}
