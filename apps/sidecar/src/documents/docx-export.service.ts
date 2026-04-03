import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';

@Injectable()
export class DocxExportService {
  async textToDocx(text: string, type: 'cv' | 'cover-letter'): Promise<Buffer> {
    const lines = text.split('\n');
    const paragraphs: Paragraph[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }

      // Skip separator lines and visa notes
      if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) continue;
      if (/^visa:/i.test(trimmed) || /requires.*visa/i.test(trimmed)) continue;

      // Detect headings — all caps lines or lines ending with ':'
      const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 2 && trimmed.length < 60 && /[A-Z]/.test(trimmed);
      const isSubHeading = trimmed.endsWith(':') && trimmed.length < 80;

      if (isHeading) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                bold: true,
                size: 24,
                font: 'Calibri',
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          }),
        );
      } else if (isSubHeading) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                bold: true,
                size: 22,
                font: 'Calibri',
              }),
            ],
            spacing: { before: 200, after: 80 },
          }),
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('● ')) {
        // Bullet point
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed.replace(/^[-•●]\s*/, ''),
                size: 20,
                font: 'Calibri',
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 40 },
          }),
        );
      } else if (lines.indexOf(line) === 0 && type === 'cv') {
        // Name — first line of CV
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                bold: true,
                size: 32,
                font: 'Calibri',
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { after: 80 },
          }),
        );
      } else {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                size: 20,
                font: 'Calibri',
              }),
            ],
            spacing: { after: 60 },
          }),
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return Buffer.from(buffer);
  }
}
