import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';

export type ExportTemplate = 'clean' | 'modern' | 'compact';

/**
 * Per-template visual config. These values intentionally mirror the CSS
 * choices in the DocumentPreview modal so the exported PDF visually matches
 * what the user saw on screen. If you tweak a template here, also tweak the
 * corresponding entry in `DocumentPreview.tsx#styles`.
 *
 * Heading styles:
 *   - `underline` = bold heading with a full-width thin rule below (Clean)
 *   - `flanked`   = emerald heading centred between two thin emerald rules
 *                   extending to the page margins (Modern)
 *   - `chip`      = muted-grey filled rounded rectangle with the heading
 *                   text inside, letter-spaced caps (Compact)
 */
interface TemplateStyle {
  nameSize: number;
  nameAlign: 'left' | 'center';
  contactSize: number;
  headingSize: number;
  headingStyle: 'underline' | 'flanked' | 'chip';
  headingColor: ReturnType<typeof rgb>;
  headingAccentColor?: ReturnType<typeof rgb>;
  subHeadingSize: number;
  bodySize: number;
  bodyColor: ReturnType<typeof rgb>;
  lineGap: number;
  paragraphGap: number;
  headingGap: number;
  bulletAccent: boolean;
  bulletAccentColor?: ReturnType<typeof rgb>;
  margin: number;
}

const TEMPLATES: Record<ExportTemplate, TemplateStyle> = {
  clean: {
    nameSize: 20,
    nameAlign: 'center',
    contactSize: 10,
    headingSize: 10,
    headingStyle: 'underline',
    headingColor: rgb(0.07, 0.07, 0.07),
    subHeadingSize: 11,
    bodySize: 10.5,
    bodyColor: rgb(0.13, 0.13, 0.13),
    lineGap: 3,
    paragraphGap: 6,
    headingGap: 10,
    bulletAccent: false,
    margin: 56,
  },
  modern: {
    nameSize: 22,
    nameAlign: 'left',
    contactSize: 10,
    headingSize: 10,
    headingStyle: 'flanked',
    // emerald-600
    headingColor: rgb(0.02, 0.59, 0.41),
    // emerald-200 — used for flanking rules and bullet accent stripes
    headingAccentColor: rgb(0.65, 0.95, 0.82),
    subHeadingSize: 11,
    bodySize: 10.5,
    bodyColor: rgb(0.13, 0.13, 0.13),
    lineGap: 3,
    paragraphGap: 6,
    headingGap: 12,
    bulletAccent: true,
    bulletAccentColor: rgb(0.65, 0.95, 0.82),
    margin: 56,
  },
  compact: {
    nameSize: 16,
    nameAlign: 'left',
    contactSize: 9,
    headingSize: 8.5,
    headingStyle: 'chip',
    // muted foreground — approximates Tailwind `text-muted-foreground`
    headingColor: rgb(0.42, 0.42, 0.45),
    // light grey chip fill — approximates `bg-muted/50`
    headingAccentColor: rgb(0.94, 0.94, 0.95),
    subHeadingSize: 10,
    bodySize: 9.5,
    bodyColor: rgb(0.15, 0.15, 0.18),
    lineGap: 2,
    paragraphGap: 4,
    headingGap: 8,
    bulletAccent: false,
    margin: 42,
  },
};

/**
 * Renders plain-text CVs and cover letters to A4 PDF buffers using `pdf-lib`.
 *
 * Three visual templates match the preview modal 1:1. The `template`
 * parameter is passed through from `/documents/export` — if it's omitted
 * (legacy callers), we default to `clean`.
 *
 * See also `DocumentPreview.tsx#styles` for the matching CSS styles.
 */
@Injectable()
export class PdfExportService {
  async textToPdf(
    text: string,
    type: 'cv' | 'cover-letter',
    template: ExportTemplate = 'clean',
  ): Promise<Buffer> {
    const style = TEMPLATES[template];
    const pdf = await PDFDocument.create();
    pdf.setTitle(type === 'cv' ? 'CV' : 'Cover Letter');
    pdf.setProducer('Greenseer');
    pdf.setCreator('Greenseer');

    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595; // A4 72dpi
    const pageHeight = 842;
    const margin = style.margin;
    const contentWidth = pageWidth - margin * 2;

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const newPage = () => {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    };
    const ensureRoom = (needed: number) => {
      if (y - needed < margin) newPage();
    };

    const wrap = (line: string, font: PDFFont, size: number, maxWidth: number): string[] => {
      if (!line) return [''];
      const words = line.split(/\s+/);
      const out: string[] = [];
      let cur = '';
      for (const word of words) {
        const candidate = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          cur = candidate;
        } else {
          if (cur) out.push(cur);
          if (font.widthOfTextAtSize(word, size) > maxWidth) {
            let chunk = '';
            for (const ch of word) {
              const next = chunk + ch;
              if (font.widthOfTextAtSize(next, size) > maxWidth && chunk) {
                out.push(chunk);
                chunk = ch;
              } else {
                chunk = next;
              }
            }
            cur = chunk;
          } else {
            cur = word;
          }
        }
      }
      if (cur) out.push(cur);
      return out;
    };

    const drawText = (
      content: string,
      opts: {
        font: PDFFont;
        size: number;
        color?: ReturnType<typeof rgb>;
        indent?: number;
        align?: 'left' | 'center';
      },
    ) => {
      const color = opts.color ?? style.bodyColor;
      const indent = opts.indent ?? 0;
      const width = contentWidth - indent;
      const lines = wrap(content, opts.font, opts.size, width);
      for (const line of lines) {
        ensureRoom(opts.size + style.lineGap);
        const x =
          opts.align === 'center'
            ? margin + (contentWidth - opts.font.widthOfTextAtSize(line, opts.size)) / 2
            : margin + indent;
        y -= opts.size;
        page.drawText(line, { x, y, size: opts.size, font: opts.font, color });
        y -= style.lineGap;
      }
    };

    const drawHeading = (heading: string) => {
      const caps = heading.toUpperCase();

      if (style.headingStyle === 'underline') {
        y -= style.headingGap;
        drawText(caps, { font: bold, size: style.headingSize, color: style.headingColor });
        ensureRoom(4);
        page.drawLine({
          start: { x: margin, y },
          end: { x: margin + contentWidth, y },
          thickness: 0.8,
          color: style.headingColor,
        });
        y -= 6;
        return;
      }

      if (style.headingStyle === 'flanked') {
        y -= style.headingGap;
        const textWidth = bold.widthOfTextAtSize(caps, style.headingSize);
        ensureRoom(style.headingSize + 6);
        y -= style.headingSize;
        const centreY = y + style.headingSize / 2 - 1;
        const gap = 8;
        const textStart = margin + (contentWidth - textWidth) / 2;
        const textEnd = textStart + textWidth;
        const ruleColor = style.headingAccentColor ?? style.headingColor;

        if (textStart - gap > margin) {
          page.drawLine({
            start: { x: margin, y: centreY },
            end: { x: textStart - gap, y: centreY },
            thickness: 0.8,
            color: ruleColor,
          });
        }
        if (textEnd + gap < margin + contentWidth) {
          page.drawLine({
            start: { x: textEnd + gap, y: centreY },
            end: { x: margin + contentWidth, y: centreY },
            thickness: 0.8,
            color: ruleColor,
          });
        }
        page.drawText(caps, {
          x: textStart,
          y,
          size: style.headingSize,
          font: bold,
          color: style.headingColor,
        });
        y -= style.lineGap + 4;
        return;
      }

      if (style.headingStyle === 'chip') {
        y -= style.headingGap;
        const chipHeight = style.headingSize + 6;
        ensureRoom(chipHeight + 4);
        const chipTop = y;
        const chipBottom = y - chipHeight;
        page.drawRectangle({
          x: margin,
          y: chipBottom,
          width: contentWidth,
          height: chipHeight,
          color: style.headingAccentColor ?? rgb(0.95, 0.95, 0.95),
        });
        const textX = margin + 8;
        const textY = chipBottom + 4;
        page.drawText(caps, {
          x: textX,
          y: textY,
          size: style.headingSize,
          font: bold,
          color: style.headingColor,
        });
        y = chipBottom - 6;
        return;
      }
    };

    const drawBullet = (body: string) => {
      ensureRoom(style.bodySize + style.lineGap);
      const textIndent = 18;
      const width = contentWidth - textIndent;
      const lines = wrap(body, regular, style.bodySize, width);
      const blockTop = y;

      // Draw bullet glyph at the start of the first visual line
      page.drawText('•', {
        x: margin + 6,
        y: blockTop - style.bodySize,
        size: style.bodySize,
        font: regular,
        color: style.bodyColor,
      });

      // Draw the (possibly wrapped) bullet body at a hanging indent
      for (const line of lines) {
        ensureRoom(style.bodySize + style.lineGap);
        y -= style.bodySize;
        page.drawText(line, {
          x: margin + textIndent,
          y,
          size: style.bodySize,
          font: regular,
          color: style.bodyColor,
        });
        y -= style.lineGap;
      }

      // Modern template accents: thin vertical bar along the bullet row.
      if (style.bulletAccent && style.bulletAccentColor) {
        const accentTop = blockTop - 2;
        const accentBottom = y + style.lineGap;
        if (accentTop > accentBottom) {
          page.drawLine({
            start: { x: margin + textIndent - 6, y: accentTop },
            end: { x: margin + textIndent - 6, y: accentBottom },
            thickness: 1.2,
            color: style.bulletAccentColor,
          });
        }
      }
    };

    const lines = text.split('\n');

    // Line-classification helpers — these MUST stay in sync with the rules in
    // `DocumentPreview.tsx` so the downloaded file visually matches what the
    // user saw on screen. If you add a new kind of line to the preview
    // renderer, mirror it here (and in DocxExportService).
    const isAllCapsHeading = (s: string) =>
      s === s.toUpperCase() && s.length > 2 && s.length < 60 && /[A-Z]/.test(s);
    const isRoleHeader = (s: string) =>
      !isAllCapsHeading(s) &&
      ((s.includes(',') && /\d{4}/.test(s)) || (s.length < 80 && s.endsWith(')')));
    const isTrailingColonSubHeading = (s: string) =>
      !isAllCapsHeading(s) && s.endsWith(':') && s.length < 80;
    const isBulletLine = (s: string) => /^[-•●]\s+/.test(s);

    // First non-empty line of a CV is the name. The preview collects the next
    // few lines (contact info) into a single muted line joined by ` | `.
    let i = 0;

    // Skip leading empties
    while (i < lines.length && !lines[i].trim()) i++;

    // Name
    if (i < lines.length && type === 'cv') {
      const nameText = lines[i].trim();
      drawText(nameText, {
        font: bold,
        size: style.nameSize,
        color: style.headingColor,
        align: style.nameAlign,
      });
      y -= 4;
      i++;

      // Consume contact lines — up to 5 non-empty lines, stopping at an
      // ALL-CAPS heading or an empty line. Join them with a pipe.
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
        drawText(contactLines.join(' | '), {
          font: regular,
          size: style.contactSize,
          color: rgb(0.42, 0.42, 0.45),
          align: style.nameAlign,
        });
        y -= style.paragraphGap;
      }
    }

    // Everything else
    for (; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (!trimmed) {
        y -= style.paragraphGap;
        continue;
      }

      if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) continue;
      if (/^visa:/i.test(trimmed) || /requires.*visa/i.test(trimmed)) continue;

      if (isAllCapsHeading(trimmed)) {
        drawHeading(trimmed);
        continue;
      }

      if (isBulletLine(trimmed)) {
        drawBullet(trimmed.replace(/^[-•●]\s+/, ''));
        continue;
      }

      // Role headers ("Senior Engineer, Acme (2020 - 2023)") and short
      // trailing-colon subheads ("Languages:") both render as bold subtitles,
      // matching the preview's `font-semibold` subtitle style.
      if (isRoleHeader(trimmed) || isTrailingColonSubHeading(trimmed)) {
        y -= 2;
        drawText(trimmed, { font: bold, size: style.subHeadingSize, color: style.headingColor });
        continue;
      }

      drawText(trimmed, { font: regular, size: style.bodySize });
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
