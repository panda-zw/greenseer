import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentGeneratorService } from './document-generator.service';
import { DocxExportService } from './docx-export.service';
import { PdfExportService } from './pdf-export.service';
import { JobUrlImporterService } from './job-url-importer.service';
import { LinkedInOptimizerService } from './linkedin-optimizer.service';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly generator: DocumentGeneratorService,
    private readonly docxExport: DocxExportService,
    private readonly pdfExport: PdfExportService,
    private readonly jobImporter: JobUrlImporterService,
    private readonly linkedInOptimizer: LinkedInOptimizerService,
  ) {}

  @Post('linkedin/analyze')
  async analyzeLinkedIn(
    @Body()
    body: {
      headline?: string;
      about?: string;
      experience?: string;
      skills?: string;
      targetRoles?: string;
      positioning?: string;
    },
  ) {
    return this.linkedInOptimizer.analyzeProfile(body);
  }

  @Get('linkedin/history')
  getLinkedInHistory() {
    return this.linkedInOptimizer.getHistory();
  }

  @Delete('linkedin/history/:id')
  deleteLinkedInHistory(@Param('id') id: string) {
    return this.linkedInOptimizer.deleteHistory(id);
  }

  @Get('generation-history')
  getGenerationHistory() {
    return this.generator.getGenerationHistory();
  }

  @Delete('generation-history/:id')
  deleteGenerationHistory(@Param('id') id: string) {
    return this.generator.deleteGenerationHistory(id);
  }

  @Post('import-job-url')
  async importJobUrl(@Body() body: { url: string }) {
    if (!body?.url || typeof body.url !== 'string') {
      throw new BadRequestException('Request body must include a `url` string.');
    }
    return this.jobImporter.importFromUrl(body.url);
  }

  @Post('generate')
  generate(
    @Body()
    body: {
      jobId?: string;
      jobDescription: string;
      jobTitle: string;
      company: string;
      /** Null/omitted means "use all profiles as a combined knowledge base". */
      cvProfileId?: string | null;
      countryCode: string;
    },
  ) {
    return this.generator.generate(
      body.jobId || null,
      body.jobDescription,
      body.jobTitle,
      body.company,
      body.cvProfileId || null,
      body.countryCode,
    );
  }

  @Post('refine')
  async refine(
    @Body() body: {
      documentId: string;
      type: 'cv' | 'coverLetter';
      instruction: string;
      /** Required when `documentId === 'manual'` (ad-hoc Generator page flow). */
      currentCvText?: string;
      currentCoverLetter?: string;
    },
  ) {
    return this.generator.refineDocument({
      documentId: body.documentId,
      type: body.type,
      instruction: body.instruction,
      currentCvText: body.currentCvText,
      currentCoverLetter: body.currentCoverLetter,
    });
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

  /**
   * Stateless export endpoint — works for both stored job-linked documents
   * and "manual" documents generated from the Generator page that have no
   * DB row. The caller provides the current text (whatever it looks like now
   * after any refinements), the format, and a document type for formatting.
   */
  @Post('export')
  async exportDocument(
    @Body()
    body: {
      text: string;
      format: 'pdf' | 'docx';
      type: 'cv' | 'cover-letter';
      filename?: string;
      /**
       * Visual template to apply. Must match one of the three the preview
       * modal offers so the downloaded file looks the same as what was shown.
       * Defaults to 'clean' if omitted (legacy callers).
       */
      template?: 'clean' | 'modern' | 'compact';
    },
    @Res() res: Response,
  ) {
    if (!body?.text || typeof body.text !== 'string') {
      throw new BadRequestException('`text` is required');
    }
    if (body.format !== 'pdf' && body.format !== 'docx') {
      throw new BadRequestException('`format` must be "pdf" or "docx"');
    }

    const docType = body.type === 'cover-letter' ? 'cover-letter' : 'cv';
    const template =
      body.template && ['clean', 'modern', 'compact'].includes(body.template)
        ? body.template
        : 'clean';
    const ext = body.format;
    const defaultName = docType === 'cv' ? `CV.${ext}` : `Cover_Letter.${ext}`;
    const filename = body.filename?.trim() || defaultName;

    const buffer =
      body.format === 'pdf'
        ? await this.pdfExport.textToPdf(body.text, docType, template)
        : await this.docxExport.textToDocx(body.text, docType, template);

    const mime =
      body.format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.set({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
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
