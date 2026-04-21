import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from 'docx';
import { classifyLine, stripMarkdown, collectContactBlock } from './text-rendering';

export type ExportTemplate = 'clean' | 'modern' | 'compact';

/**
 * Per-template DOCX style knobs. Mirrors the PDF exporter (which mirrors the
 * preview modal) so all three output surfaces — on-screen preview, downloaded
 * PDF, downloaded DOCX — share the same visual identity per template.
 *
 * DOCX font sizes use half-points (size: 20 → 10pt). Colours are hex without
 * the leading `#`. Borders/shading are what give each template its character.
 */
interface TemplateStyle {
  nameSizeHalfPt: number;
  nameAlign: 'left' | 'center';
  headingSizeHalfPt: number;
  headingColorHex: string;
  headingCaps: boolean;
  headingTreatment: 'underline' | 'flanked' | 'chip';
  headingAccentHex: string;
  subHeadingSizeHalfPt: number;
  bodySizeHalfPt: number;
  bodyColorHex: string;
  bulletAccentHex?: string; // if set, bullet paragraphs get this as a left border
}

const TEMPLATES: Record<ExportTemplate, TemplateStyle> = {
  clean: {
    nameSizeHalfPt: 36,
    nameAlign: 'center',
    headingSizeHalfPt: 22,
    headingColorHex: '111111',
    headingCaps: true,
    headingTreatment: 'underline',
    headingAccentHex: '111111',
    subHeadingSizeHalfPt: 22,
    bodySizeHalfPt: 21,
    bodyColorHex: '222222',
  },
  modern: {
    nameSizeHalfPt: 40,
    nameAlign: 'left',
    headingSizeHalfPt: 22,
    // emerald-600
    headingColorHex: '059669',
    headingCaps: true,
    headingTreatment: 'flanked',
    // emerald-200 — flanking rule + bullet left border
    headingAccentHex: 'A7F3D0',
    subHeadingSizeHalfPt: 22,
    bodySizeHalfPt: 21,
    bodyColorHex: '222222',
    bulletAccentHex: 'A7F3D0',
  },
  compact: {
    nameSizeHalfPt: 28,
    nameAlign: 'left',
    headingSizeHalfPt: 17,
    // muted-foreground
    headingColorHex: '6B6B73',
    headingCaps: true,
    headingTreatment: 'chip',
    // light grey chip background
    headingAccentHex: 'EDEDEF',
    subHeadingSizeHalfPt: 20,
    bodySizeHalfPt: 19,
    bodyColorHex: '262629',
  },
};

@Injectable()
export class DocxExportService {
  async textToDocx(
    text: string,
    type: 'cv' | 'cover-letter',
    template: ExportTemplate = 'clean',
  ): Promise<Buffer> {
    const style = TEMPLATES[template];
    const lines = text.split('\n');
    const paragraphs: Paragraph[] = [];

    // Body text run factory — defaults to the template's body size/colour.
    const bodyRun = (content: string) =>
      new TextRun({
        text: content,
        size: style.bodySizeHalfPt,
        font: 'Calibri',
        color: style.bodyColorHex,
      });

    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;

    // Name + contact block
    if (i < lines.length && type === 'cv') {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: stripMarkdown(lines[i].trim()),
              bold: true,
              size: style.nameSizeHalfPt,
              font: 'Calibri',
              color: style.headingColorHex,
            }),
          ],
          alignment: style.nameAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 80 },
        }),
      );
      i++;

      const { contactLines, nextIndex } = collectContactBlock(lines, i);
      i = nextIndex;
      if (contactLines.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: contactLines.join(' | '),
                size: Math.max(16, style.bodySizeHalfPt - 2),
                font: 'Calibri',
                color: '6B6B73',
              }),
            ],
            alignment: style.nameAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { after: 160 },
          }),
        );
      }
    }

    for (; i < lines.length; i++) {
      const kind = classifyLine(lines, i);
      if (kind === 'skip') continue;
      if (kind === 'empty') {
        paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }
      const trimmed = stripMarkdown(lines[i].trim());

      if (kind === 'heading') {
        paragraphs.push(renderHeading(trimmed, style));
        continue;
      }

      if (kind === 'bullet') {
        const bulletBody = trimmed.replace(/^[-•●]\s*/, '');
        paragraphs.push(
          new Paragraph({
            children: [bodyRun(bulletBody)],
            bullet: { level: 0 },
            spacing: { after: 40 },
            ...(style.bulletAccentHex && {
              border: {
                left: {
                  style: BorderStyle.SINGLE,
                  size: 12,
                  color: style.bulletAccentHex,
                  space: 4,
                },
              },
            }),
          }),
        );
        continue;
      }

      if (kind === 'subtitle') {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                bold: true,
                size: style.subHeadingSizeHalfPt,
                font: 'Calibri',
                color: style.headingColorHex,
              }),
            ],
            spacing: { before: 160, after: 60 },
          }),
        );
        continue;
      }

      // body
      paragraphs.push(
        new Paragraph({
          children: [bodyRun(trimmed)],
          spacing: { after: 60 },
        }),
      );
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

/**
 * Build a heading paragraph styled according to the template's heading
 * treatment. DOCX can do underlines via paragraph bottom borders, and "chip"
 * styling via paragraph shading + full-width background. The "flanked"
 * preview style (rule — heading — rule) doesn't have a clean DOCX primitive;
 * the closest faithful approximation is a coloured heading with a
 * full-width thin top+bottom rule in the accent colour, which visually reads
 * similarly on a printed page.
 */
function renderHeading(text: string, style: TemplateStyle): Paragraph {
  const caps = style.headingCaps ? text.toUpperCase() : text;
  const run = new TextRun({
    text: caps,
    bold: true,
    size: style.headingSizeHalfPt,
    font: 'Calibri',
    color: style.headingColorHex,
    // Letter spacing — tracks a hair wider to match the CSS `tracking-*` feel.
    characterSpacing: 20,
  });

  if (style.headingTreatment === 'underline') {
    return new Paragraph({
      children: [run],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: style.headingAccentHex, space: 2 },
      },
    });
  }

  if (style.headingTreatment === 'flanked') {
    return new Paragraph({
      children: [run],
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: style.headingAccentHex, space: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: style.headingAccentHex, space: 4 },
      },
    });
  }

  // 'chip' — muted shaded background block with small caps inside
  return new Paragraph({
    children: [run],
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    shading: {
      type: ShadingType.SOLID,
      color: style.headingAccentHex,
      fill: style.headingAccentHex,
    },
    indent: { left: 120, right: 120 },
  });
}
