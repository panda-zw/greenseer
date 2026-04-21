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

    // Classifiers — MUST stay in sync with `DocumentPreview.tsx` and
    // `PdfExportService`. See those files for rationale.
    const isAllCapsHeading = (s: string) =>
      s === s.toUpperCase() && s.length > 2 && s.length < 60 && /[A-Z]/.test(s);
    const isRoleHeader = (s: string) =>
      !isAllCapsHeading(s) &&
      ((s.includes(',') && /\d{4}/.test(s)) || (s.length < 80 && s.endsWith(')')));
    const isTrailingColonSubHeading = (s: string) =>
      !isAllCapsHeading(s) && s.endsWith(':') && s.length < 80;
    const isBulletLine = (s: string) =>
      s.startsWith('- ') || s.startsWith('• ') || s.startsWith('● ');

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

    // Name
    if (i < lines.length && type === 'cv') {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: lines[i].trim(),
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

      // Contact block: collect next ≤5 non-empty, non-heading lines and
      // render as a single pipe-joined muted-coloured line.
      const contactLines: string[] = [];
      let consumed = 0;
      while (i < lines.length && consumed < 5) {
        const ln = lines[i].trim();
        if (!ln) { i++; break; }
        if (isAllCapsHeading(ln)) break;
        contactLines.push(ln);
        i++;
        consumed++;
      }
      if (contactLines.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: contactLines.join(' | '),
                size: Math.max(16, style.bodySizeHalfPt - 2), // slightly smaller
                font: 'Calibri',
                color: '6B6B73', // muted foreground
              }),
            ],
            alignment: style.nameAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { after: 160 },
          }),
        );
      }
    }

    for (; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (!trimmed) {
        paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
        continue;
      }

      if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) continue;
      if (/^visa:/i.test(trimmed) || /requires.*visa/i.test(trimmed)) continue;

      if (isAllCapsHeading(trimmed)) {
        paragraphs.push(renderHeading(trimmed, style));
        continue;
      }

      if (isBulletLine(trimmed)) {
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

      // Role headers + trailing-colon sub-headings both render as bold
      // subtitles, matching the preview's `font-semibold` treatment. This
      // was the missing classification that caused "Senior Engineer, Acme
      // (2020 - 2023)" lines to export as plain body instead of bold.
      if (isRoleHeader(trimmed) || isTrailingColonSubHeading(trimmed)) {
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
