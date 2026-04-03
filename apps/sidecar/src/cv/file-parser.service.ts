import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';
import * as sharp from 'sharp';

@Injectable()
export class FileParserService {
  private readonly logger = new Logger(FileParserService.name);

  async parseFile(buffer: Buffer, mimetype: string, filename: string): Promise<string> {
    const ext = filename.toLowerCase().split('.').pop();

    if (mimetype === 'application/pdf' || ext === 'pdf') {
      return this.parsePdf(buffer);
    }

    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      return this.parseDocx(buffer);
    }

    if (mimetype === 'text/plain' || ext === 'txt') {
      return buffer.toString('utf-8');
    }

    // Image files — run OCR directly
    if (['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp'].includes(ext || '')) {
      return this.ocrImage(buffer);
    }

    throw new BadRequestException(
      `Unsupported file type: ${ext}. Upload a PDF, DOCX, TXT, or image file.`,
    );
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    // Step 1: Try text extraction
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      const text = data.text?.trim();

      // If we got meaningful text (more than a few chars per page), use it
      if (text && text.length > 50) {
        this.logger.log(`PDF text extraction: ${text.length} chars`);
        return text;
      }
    } catch (error: any) {
      this.logger.warn(`PDF text extraction failed: ${error.message}`);
    }

    // Step 2: Fallback to OCR — convert PDF pages to images via sharp
    this.logger.log('PDF has no selectable text, falling back to OCR...');
    try {
      return await this.ocrPdf(buffer);
    } catch (error: any) {
      this.logger.error(`PDF OCR failed: ${error.message}`);
      throw new BadRequestException(
        'Failed to read PDF. Both text extraction and OCR failed.',
      );
    }
  }

  private async ocrPdf(buffer: Buffer): Promise<string> {
    const { createWorker } = await import('tesseract.js');

    // Convert PDF pages to images using sharp
    // sharp can read PDF first page; for multi-page we process page by page
    const pages: string[] = [];

    try {
      // Get page count by attempting to read metadata
      const metadata = await (sharp as any)(buffer, { density: 200 }).metadata();
      const pageCount = metadata.pages || 1;

      const worker = await createWorker('eng');

      for (let page = 0; page < Math.min(pageCount, 10); page++) {
        try {
          const pngBuffer = await (sharp as any)(buffer, {
            density: 250,
            page,
          })
            .png()
            .toBuffer();

          const { data } = await worker.recognize(pngBuffer);
          if (data.text?.trim()) {
            pages.push(data.text.trim());
          }
        } catch (pageError: any) {
          this.logger.warn(`OCR page ${page} failed: ${pageError.message}`);
        }
      }

      await worker.terminate();
    } catch (sharpError: any) {
      // sharp can't handle this PDF (no libvips PDF support) — try single image OCR
      this.logger.warn(`Sharp PDF conversion failed: ${sharpError.message}, trying single-page`);

      try {
        const pngBuffer = await (sharp as any)(buffer, { density: 250 })
          .png()
          .toBuffer();

        const { createWorker: cw } = await import('tesseract.js');
        const worker = await cw('eng');
        const { data } = await worker.recognize(pngBuffer);
        await worker.terminate();

        if (data.text?.trim()) {
          pages.push(data.text.trim());
        }
      } catch {
        throw new Error('Could not convert PDF to images for OCR');
      }
    }

    if (pages.length === 0) {
      throw new Error('OCR produced no text from PDF');
    }

    const fullText = pages.join('\n\n');
    this.logger.log(`PDF OCR complete: ${fullText.length} chars from ${pages.length} pages`);
    return fullText;
  }

  private async ocrImage(buffer: Buffer): Promise<string> {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data } = await worker.recognize(buffer);
      await worker.terminate();

      const text = data.text?.trim();
      if (!text) throw new Error('OCR produced no text');

      this.logger.log(`Image OCR complete: ${text.length} chars`);
      return text;
    } catch (error: any) {
      this.logger.error(`Image OCR failed: ${error.message}`);
      throw new BadRequestException('Failed to extract text from image via OCR.');
    }
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim();
      if (!text) throw new Error('No text content found');
      return text;
    } catch (error: any) {
      this.logger.error(`DOCX parse failed: ${error.message}`);
      throw new BadRequestException('Failed to read DOCX file.');
    }
  }
}
