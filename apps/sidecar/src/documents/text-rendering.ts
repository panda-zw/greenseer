/**
 * Shared text-classification + preprocessing helpers for CV/cover-letter
 * rendering. Used by both `PdfExportService` and `DocxExportService` so
 * they produce identical line categorization.
 *
 * The matching client-side classifier lives in
 * `apps/desktop/src/components/DocumentPreview.tsx`. If you change rules
 * here, mirror them there so on-screen previews match downloaded files.
 */

export type LineKind =
  | 'empty'
  | 'skip' // separator rules, visa notes — not rendered at all
  | 'heading' // ALL-CAPS section heading
  | 'subtitle' // role/project/date header or Trailing-colon sub-heading (bold)
  | 'bullet'
  | 'body';

/** ALL-CAPS line that's clearly a section heading like PROFESSIONAL EXPERIENCE. */
export function isAllCapsHeading(s: string): boolean {
  return (
    s === s.toUpperCase() &&
    s.length > 2 &&
    s.length < 60 &&
    /[A-Z]/.test(s)
  );
}

export function isBulletLine(s: string): boolean {
  return /^[-•●]\s+/.test(s);
}

/**
 * Returns true if the line looks like a date-range header such as
 * "October 2021 - PRESENT" or "Jan 2020 - Dec 2023". A year + a
 * dash/em-dash + (another year or "present"/"current") is enough.
 */
function isDateRangeLine(s: string): boolean {
  if (s.length > 80) return false;
  const hasYear = /\b\d{4}\b/.test(s);
  const hasSeparator = /[-–—]/.test(s);
  const hasTerminator = /\b\d{4}\b|\bpresent\b|\bcurrent\b|\bongoing\b/i.test(s);
  return hasYear && hasSeparator && hasTerminator;
}

/**
 * Full line classifier with lookahead. Returns how a given line should be
 * rendered given its index in the document.
 *
 * Subtitle matching covers several realistic CV formats:
 *   - "Senior Engineer, Acme Corp (Jan 2020 - Dec 2023)" — comma + year
 *   - short "…)" lines (e.g. "Acme Corp (2020 - 2023)")
 *   - "Jan 2020 - Present" — a pure date-range line
 *   - "Remote — Software Developer" followed by a date-range line — the
 *     current line gets promoted to subtitle via lookahead
 *   - "Oono Events" (bare project name) if followed by a date/tech-stack
 *     line or a bullet block — again via lookahead
 *   - lines ending in `:` under 80 chars (sub-sections like "Languages:")
 */
export function classifyLine(lines: string[], i: number): LineKind {
  const raw = lines[i];
  if (raw === undefined) return 'empty';
  const trimmed = raw.trim();
  if (!trimmed) return 'empty';

  // Never render visa notes or ascii separators
  if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) return 'skip';
  if (/^visa:/i.test(trimmed) || /requires.*visa/i.test(trimmed)) return 'skip';

  if (isAllCapsHeading(trimmed)) return 'heading';
  if (isBulletLine(trimmed)) return 'bullet';

  // Trailing-colon sub-heading: "Languages:", "Frameworks:"
  if (trimmed.endsWith(':') && trimmed.length < 80) return 'subtitle';

  // "Ends with )" — short line with parenthetical dates
  if (trimmed.endsWith(')') && trimmed.length < 100) return 'subtitle';

  // Contains comma + 4-digit year → classic "Role, Company (2020 - 2023)" form
  if (trimmed.includes(',') && /\b\d{4}\b/.test(trimmed) && trimmed.length < 120) {
    return 'subtitle';
  }

  // Pure date-range line
  if (isDateRangeLine(trimmed)) return 'subtitle';

  // Lookahead — if the next non-empty, non-bullet, non-heading line looks like
  // a date-range, this line is probably the role/project title. Promote both.
  for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
    const next = lines[j]?.trim();
    if (!next) continue;
    if (isAllCapsHeading(next)) break;
    if (isBulletLine(next)) break;
    if (isDateRangeLine(next) && trimmed.length < 100) return 'subtitle';
    break; // only inspect the immediately-next non-empty line
  }

  return 'body';
}

/**
 * Strip markdown emphasis markers from AI-generated text so they don't
 * appear as literal asterisks/underscores in the rendered output.
 *
 * We're conservative: only remove balanced double markers (`**text**`,
 * `__text__`) because single-asterisk/underscore sequences can be
 * legitimate text (e.g. "C*", variable names, *args). Also strip leading
 * markdown heading markers (`## Heading`) but keep the text.
 *
 * This runs on each line AFTER classification but BEFORE rendering, so the
 * classifier still sees the full line including any markers that might
 * appear in section-title-looking text.
 */
export function stripMarkdown(line: string): string {
  return line
    // Bold/italic with double markers: **text** / __text__
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    // Inline code backticks — keep the text, drop the ticks
    .replace(/`([^`\n]+?)`/g, '$1')
    // Leading ATX heading markers, e.g. "### Experience" → "Experience"
    .replace(/^#{1,6}\s+/, '')
    // Leading markdown list dashes/asterisks are handled elsewhere as bullets,
    // but if a line accidentally contains " * " standalone, leave it alone.
    .trim();
}

/**
 * Consume contact lines after the name — up to `maxLines` non-empty,
 * non-heading lines, stopping at the first empty line. Returns the
 * consumed lines (cleaned of markdown) and the new index to continue from.
 */
export function collectContactBlock(
  lines: string[],
  startIndex: number,
  maxLines = 5,
): { contactLines: string[]; nextIndex: number } {
  const contactLines: string[] = [];
  let j = startIndex;
  let taken = 0;
  while (j < lines.length && taken < maxLines) {
    const ln = lines[j]?.trim() ?? '';
    if (!ln) { j++; break; }
    if (isAllCapsHeading(ln)) break;
    contactLines.push(stripMarkdown(ln));
    j++;
    taken++;
  }
  return { contactLines, nextIndex: j };
}
