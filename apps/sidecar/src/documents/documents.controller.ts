import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentGeneratorService } from './document-generator.service';
import { DocxExportService } from './docx-export.service';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly generator: DocumentGeneratorService,
    private readonly docxExport: DocxExportService,
  ) {}

  @Post('generate')
  generate(
    @Body()
    body: {
      jobId?: string;
      jobDescription: string;
      jobTitle: string;
      company: string;
      cvProfileId: string;
      countryCode: string;
    },
  ) {
    return this.generator.generate(
      body.jobId || null,
      body.jobDescription,
      body.jobTitle,
      body.company,
      body.cvProfileId,
      body.countryCode,
    );
  }

  @Post('refine')
  async refine(
    @Body() body: {
      documentId: string;
      type: 'cv' | 'coverLetter';
      instruction: string;
    },
  ) {
    return this.generator.refineDocument(body.documentId, body.type, body.instruction);
  }

  @Post('refine-cv')
  async refineCv(
    @Body() body: { cvText: string; instruction: string },
  ) {
    return this.generator.refineCvText(body.cvText, body.instruction);
  }

  @Get('job/:jobId')
  getDocuments(@Param('jobId') jobId: string) {
    return this.generator.getDocuments(jobId);
  }

  @Get(':id')
  getDocument(@Param('id') id: string) {
    return this.generator.getDocument(id);
  }

  @Get(':id/download/:type')
  async downloadDocx(
    @Param('id') id: string,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const doc = await this.generator.getDocument(id);
    const text = type === 'cover' ? doc.coverLetter : doc.cvText;
    const filename = type === 'cover'
      ? `Cover_Letter_${doc.countryCode}.docx`
      : `CV_${doc.countryCode}.docx`;

    const buffer = await this.docxExport.textToDocx(text, type === 'cover' ? 'cover-letter' : 'cv');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }
}
