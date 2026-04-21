import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X,
  Copy,
  Download,
  Send,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import type { GeneratedDocumentDto } from '@greenseer/shared';

const tabClass = "text-[13px] px-3 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent text-muted-foreground data-[state=active]:text-foreground";

function sidecarUrl(path: string): string {
  return `http://127.0.0.1:11434/api${path}`;
}

async function saveFile(content: string, filename: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: filename, filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (path) await writeTextFile(path, content);
    else throw new Error('Cancelled');
  } else {
    triggerDownload(content, filename, 'text/plain');
  }
}

async function saveFileBytes(bytes: Uint8Array, filename: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const ext = filename.split('.').pop() || 'docx';
    const path = await save({ defaultPath: filename, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (path) await writeFile(path, bytes);
    else throw new Error('Cancelled');
  } else {
    const blob = new Blob([bytes]);
    triggerBlobDownload(blob, filename);
  }
}

type Template = 'clean' | 'modern' | 'compact';

const TEMPLATES: { value: Template; label: string }[] = [
  { value: 'clean', label: 'Clean' },
  { value: 'modern', label: 'Modern' },
  { value: 'compact', label: 'Compact' },
];

function cleanText(text: string): string {
  return text
    .replace(/—/g, ' - ')  // Replace em-dashes
    .replace(/–/g, '-')     // Replace en-dashes
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (/^-{3,}$/.test(t) || /^_{3,}$/.test(t) || /^\*{3,}$/.test(t)) return false;
      if (/^visa:/i.test(t)) return false;
      if (/requires.*visa/i.test(t) && t.length < 80) return false;
      if (/sponsorship.*required/i.test(t) && t.length < 80) return false;
      return true;
    })
    .join('\n');
}

export function DocumentPreview({
  document: doc,
  company,
  onClose,
  onUpdated,
}: {
  document: GeneratedDocumentDto;
  company: string;
  onClose: () => void;
  onUpdated: (doc: GeneratedDocumentDto) => void;
}) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'cv' | 'cover'>('cv');
  const [template, setTemplate] = useState<Template>('clean');
  const [refineInput, setRefineInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);

  const rawText = activeTab === 'cv' ? doc.cvText : doc.coverLetter;
  const currentText = cleanText(rawText);

  const refine = useMutation({
    mutationFn: () =>
      apiPost<GeneratedDocumentDto>('/documents/refine', {
        documentId: doc.id,
        type: activeTab === 'cv' ? 'cv' : 'coverLetter',
        instruction: refineInput,
        // Manual (non-persisted) docs generated from the Generator page need
        // to send their current text along — the server has no DB row for them.
        ...(doc.id === 'manual' && {
          currentCvText: doc.cvText,
          currentCoverLetter: doc.coverLetter,
        }),
      }),
    onSuccess: (result) => {
      setHistory([...history, refineInput]);
      setRefineInput('');
      onUpdated(result);
      toast.success('Document refined');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Refinement failed'),
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentText);
    toast.success(`${activeTab === 'cv' ? 'CV' : 'Cover letter'} copied`);
  };

  const [downloading, setDownloading] = useState<string | null>(null);

  const downloadTxt = async () => {
    setDownloading('txt');
    try {
      await saveFile(currentText, `${activeTab === 'cv' ? 'CV' : 'Cover_Letter'}_${company}.txt`);
      toast.success('TXT saved');
    } catch { toast.error('Save failed'); }
    setDownloading(null);
  };

  /**
   * Stateless export via POST /documents/export — works for both stored
   * (job-linked) and manual (Generator-page) documents, since we ship the
   * current in-memory text directly rather than asking the server to load
   * by id. This also means refinements made in this modal are persisted
   * into the exported file, which the old GET-by-id flow missed.
   */
  const downloadFile = async (format: 'pdf' | 'docx') => {
    setDownloading(format);
    try {
      const res = await fetch(sidecarUrl('/documents/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentText,
          format,
          type: activeTab === 'cv' ? 'cv' : 'cover-letter',
          // Pass the selected preview template so the downloaded file
          // visually matches what the user saw on screen.
          template,
          filename: `${activeTab === 'cv' ? 'CV' : 'Cover_Letter'}_${company || 'Document'}.${format}`,
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const arrayBuf = await blob.arrayBuffer();
      await saveFileBytes(
        new Uint8Array(arrayBuf),
        `${activeTab === 'cv' ? 'CV' : 'Cover_Letter'}_${company || 'Document'}.${format}`,
      );
      toast.success(`${format.toUpperCase()} saved`);
    } catch (err: any) {
      toast.error(err?.message || `${format.toUpperCase()} save failed`);
    }
    setDownloading(null);
  };

  const downloadDocx = () => downloadFile('docx');
  const downloadPdf = () => downloadFile('pdf');

  // Template styles — each genuinely different layout
  const styles = {
    clean: {
      wrapper: 'px-10 py-8',
      name: 'text-[22px] font-bold text-foreground text-center',
      contact: 'text-center text-[12px] text-muted-foreground mt-1 mb-4',
      heading: 'text-[11px] font-bold tracking-[0.2em] uppercase text-foreground border-b-2 border-foreground pb-1 mt-6 mb-3',
      subtitle: 'font-semibold text-foreground mt-3',
      body: 'text-[13px] leading-relaxed',
      bullet: 'ml-4',
    },
    modern: {
      wrapper: 'px-10 py-8',
      name: 'text-[24px] font-bold text-foreground',
      contact: 'text-[12px] text-muted-foreground mt-1 mb-4 pb-4 border-b border-border',
      heading: 'text-[12px] font-bold tracking-[0.1em] uppercase text-emerald-600 dark:text-emerald-400 mt-6 mb-2 flex items-center gap-2 before:content-[""] before:h-px before:flex-1 before:bg-emerald-200 before:dark:bg-emerald-800 after:content-[""] after:h-px after:flex-1 after:bg-emerald-200 after:dark:bg-emerald-800',
      subtitle: 'font-semibold text-foreground mt-3',
      body: 'text-[13px] leading-relaxed',
      bullet: 'ml-4 pl-2 border-l-2 border-emerald-200 dark:border-emerald-800',
    },
    compact: {
      wrapper: 'px-8 py-6',
      name: 'text-[18px] font-bold text-foreground',
      contact: 'text-[11px] text-muted-foreground mt-0.5 mb-3',
      heading: 'text-[9px] font-bold tracking-[0.25em] uppercase text-muted-foreground bg-muted/50 px-2 py-1 rounded mt-4 mb-2',
      subtitle: 'font-semibold text-[12px] text-foreground mt-2',
      body: 'text-[12px] leading-snug',
      bullet: 'ml-3',
    },
  };
  const style = styles[template];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold">Document Preview</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">{company} · {doc.countryCode}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'cv' | 'cover')}>
              <TabsList className="h-auto bg-transparent p-0 rounded-none">
                <TabsTrigger value="cv" className={tabClass}>CV / Resume</TabsTrigger>
                <TabsTrigger value="cover" className={tabClass}>Cover Letter</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={template} onValueChange={(v) => setTemplate(v as Template)}>
              <SelectTrigger className="h-7 w-28 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 py-2">
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={copyToClipboard}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={downloadTxt} disabled={downloading === 'txt'}>
              {downloading === 'txt' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />} TXT
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={downloadDocx} disabled={downloading === 'docx'}>
              {downloading === 'docx' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />} DOCX
            </Button>
            <Button variant="default" size="sm" className="h-7 text-[12px]" onClick={downloadPdf} disabled={downloading === 'pdf'}>
              {downloading === 'pdf' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />} PDF
            </Button>
          </div>
        </div>

        {/* Preview */}
        <ScrollArea className="flex-1 bg-muted/20">
          <div className={`max-w-2xl mx-auto bg-card border border-border rounded-lg my-6 min-h-[500px] ${style.wrapper}`}>
            <div className={style.body}>
              {(() => {
                // Classifier mirrors `apps/sidecar/src/documents/text-rendering.ts`.
                // Keep rules in sync across preview + PDF + DOCX so the file
                // the user downloads visually matches what they saw.
                const lines = currentText.split('\n');

                const isAllCapsHeading = (s: string) =>
                  s === s.toUpperCase() && s.length > 2 && s.length < 60 && /[A-Z]/.test(s);
                const isBulletLine = (s: string) => /^[-•●]\s+/.test(s);
                const isDateRangeLine = (s: string) => {
                  if (s.length > 80) return false;
                  const hasYear = /\b\d{4}\b/.test(s);
                  const hasSeparator = /[-–—]/.test(s);
                  const hasTerminator = /\b\d{4}\b|\bpresent\b|\bcurrent\b|\bongoing\b/i.test(s);
                  return hasYear && hasSeparator && hasTerminator;
                };
                const stripMarkdown = (line: string) =>
                  line
                    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
                    .replace(/__([^_\n]+?)__/g, '$1')
                    .replace(/`([^`\n]+?)`/g, '$1')
                    .replace(/^#{1,6}\s+/, '')
                    .trim();

                // Returns 'heading' | 'subtitle' | 'bullet' | 'body' | 'skip' | 'empty'
                const classify = (idx: number): 'heading' | 'subtitle' | 'bullet' | 'body' | 'skip' | 'empty' => {
                  const t = lines[idx]?.trim();
                  if (!t) return 'empty';
                  if (/^-{3,}$/.test(t) || /^_{3,}$/.test(t)) return 'skip';
                  if (/^visa:/i.test(t) || /requires.*visa/i.test(t)) return 'skip';
                  if (isAllCapsHeading(t)) return 'heading';
                  if (isBulletLine(t)) return 'bullet';
                  if (t.endsWith(':') && t.length < 80) return 'subtitle';
                  if (t.endsWith(')') && t.length < 100) return 'subtitle';
                  if (t.includes(',') && /\b\d{4}\b/.test(t) && t.length < 120) return 'subtitle';
                  if (isDateRangeLine(t)) return 'subtitle';
                  // Lookahead: if the next non-empty line is a date range, THIS
                  // line is a role/project title. Both should be bold.
                  for (let j = idx + 1; j < Math.min(lines.length, idx + 4); j++) {
                    const next = lines[j]?.trim();
                    if (!next) continue;
                    if (isAllCapsHeading(next)) break;
                    if (isBulletLine(next)) break;
                    if (isDateRangeLine(next) && t.length < 100) return 'subtitle';
                    break;
                  }
                  return 'body';
                };

                const elements: React.ReactNode[] = [];
                let i = 0;

                // Skip leading empties
                while (i < lines.length && !lines[i].trim()) i++;

                // Name + contact block (CV only)
                if (i < lines.length && activeTab === 'cv') {
                  elements.push(
                    <div key={`name-${i}`} className={style.name}>
                      {stripMarkdown(lines[i].trim())}
                    </div>,
                  );
                  i++;
                  // Collect up to 5 non-empty non-heading lines as contact info.
                  const contactLines: string[] = [];
                  let taken = 0;
                  while (i < lines.length && taken < 5) {
                    const ln = lines[i]?.trim() ?? '';
                    if (!ln) { i++; break; }
                    if (isAllCapsHeading(ln)) break;
                    contactLines.push(stripMarkdown(ln));
                    i++;
                    taken++;
                  }
                  if (contactLines.length > 0) {
                    elements.push(
                      <div key={`contact-${i}`} className={style.contact}>
                        {contactLines.join(' | ')}
                      </div>,
                    );
                  }
                }

                for (; i < lines.length; i++) {
                  const kind = classify(i);
                  if (kind === 'skip') continue;
                  if (kind === 'empty') {
                    elements.push(<div key={i} className="h-2" />);
                    continue;
                  }
                  const trimmed = stripMarkdown(lines[i].trim());
                  if (kind === 'heading') {
                    elements.push(<div key={i} className={style.heading}>{trimmed}</div>);
                    continue;
                  }
                  if (kind === 'bullet') {
                    elements.push(
                      <div key={i} className={`flex gap-2 my-0.5 ${style.bullet}`}>
                        <span className="text-muted-foreground flex-shrink-0">•</span>
                        <span>{trimmed.replace(/^[-•●]\s*/, '')}</span>
                      </div>,
                    );
                    continue;
                  }
                  if (kind === 'subtitle') {
                    elements.push(<div key={i} className={style.subtitle}>{trimmed}</div>);
                    continue;
                  }
                  elements.push(<div key={i} className="my-0.5">{trimmed}</div>);
                }

                return elements;
              })()}
            </div>
          </div>
        </ScrollArea>

        {/* Refine */}
        <div className="flex-shrink-0 border-t border-border px-5 py-3">
          {history.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {history.map((h, i) => (
                <span key={i} className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">{h}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && refineInput.trim() && refine.mutate()}
              placeholder="e.g. 'Make it shorter', 'Emphasize React', 'More formal tone'..."
              className="flex-1 h-8 text-[13px]"
              disabled={refine.isPending}
            />
            <Button
              size="sm" className="h-8 text-[12px]"
              onClick={() => refine.mutate()}
              disabled={!refineInput.trim() || refine.isPending}
            >
              {refine.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
              Refine
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

