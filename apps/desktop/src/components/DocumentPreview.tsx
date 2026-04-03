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
      }),
    onSuccess: (result) => {
      setHistory([...history, refineInput]);
      setRefineInput('');
      onUpdated(result);
      toast.success('Document refined');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Refinement failed'),
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

  const downloadDocx = async () => {
    setDownloading('docx');
    try {
      const type = activeTab === 'cv' ? 'cv' : 'cover';
      const res = await fetch(sidecarUrl(`/documents/${doc.id}/download/${type}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const arrayBuf = await blob.arrayBuffer();
      await saveFileBytes(new Uint8Array(arrayBuf), `${activeTab === 'cv' ? 'CV' : 'Cover_Letter'}_${company}.docx`);
      toast.success('DOCX saved');
    } catch (err) {
      toast.error('DOCX save failed');
    }
    setDownloading(null);
  };

  const downloadPdf = async () => {
    setDownloading('pdf');
    // For PDF, we use the sidecar's DOCX endpoint as a base
    // and tell the user to use their system's print-to-PDF
    toast.info('Opening print dialog — select "Save as PDF" to download');
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Cannot create print frame');
      iframeDoc.write(`<!DOCTYPE html><html><head>
        <title>${activeTab === 'cv' ? 'CV' : 'Cover Letter'} - ${company}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Calibri, 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; max-width: 680px; margin: 0 auto; padding: 20px; }
          .name { font-size: 18pt; font-weight: bold; margin-bottom: 2px; }
          .heading { font-size: 9pt; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-top: 14px; margin-bottom: 6px; }
          .subtitle { font-weight: 600; margin-top: 6px; }
          .bullet { margin-left: 14px; position: relative; margin-bottom: 2px; }
          .bullet::before { content: "•"; position: absolute; left: -10px; }
          .line { margin-bottom: 2px; }
          @page { margin: 1.5cm; }
        </style>
      </head><body>${formatForPrint(currentText, activeTab === 'cv')}</body></html>`);
      iframeDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 300);
    } catch {
      toast.error('PDF generation failed');
    }
    setDownloading(null);
  };

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
                const lines = currentText.split('\n');
                const elements: React.ReactNode[] = [];
                let isContactBlock = activeTab === 'cv'; // First few lines after name are contact info

                for (let i = 0; i < lines.length; i++) {
                  const trimmed = lines[i].trim();

                  if (!trimmed) {
                    if (isContactBlock && i > 1) isContactBlock = false;
                    elements.push(<div key={i} className="h-2" />);
                    continue;
                  }

                  const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length > 2 && trimmed.length < 60 && /[A-Z]/.test(trimmed);

                  // Name (first line of CV)
                  if (i === 0 && activeTab === 'cv') {
                    elements.push(<div key={i} className={style.name}>{trimmed}</div>);
                    continue;
                  }

                  // Contact info (lines 1-4ish before first heading)
                  if (isContactBlock && !isHeading && i < 6) {
                    // Collect contact lines into a single block
                    if (i === 1 || (i > 1 && !elements.some(e => e && (e as any).props?.className === style.contact))) {
                      const contactLines: string[] = [];
                      let j = i;
                      while (j < lines.length && j < 6) {
                        const cl = lines[j].trim();
                        if (!cl || (cl === cl.toUpperCase() && cl.length > 2 && /[A-Z]/.test(cl))) break;
                        contactLines.push(cl);
                        j++;
                      }
                      elements.push(
                        <div key={`contact-${i}`} className={style.contact}>
                          {contactLines.join(' | ')}
                        </div>
                      );
                      // Skip the lines we consumed
                      for (let skip = i; skip < j - 1; skip++) {
                        elements.push(null);
                      }
                      i = j - 1;
                      isContactBlock = false;
                      continue;
                    }
                    continue;
                  }

                  isContactBlock = false;

                  // Section headings
                  if (isHeading) {
                    elements.push(<div key={i} className={style.heading}>{trimmed}</div>);
                    continue;
                  }

                  // Bullet points
                  if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('● ')) {
                    elements.push(
                      <div key={i} className={`flex gap-2 my-0.5 ${style.bullet}`}>
                        <span className="text-muted-foreground flex-shrink-0">•</span>
                        <span>{trimmed.replace(/^[-•●]\s*/, '')}</span>
                      </div>
                    );
                    continue;
                  }

                  // Subtitles (lines with commas and dates, or shorter bold-looking lines)
                  if ((trimmed.includes(',') && /\d{4}/.test(trimmed)) || (trimmed.length < 80 && trimmed.endsWith(')'))) {
                    elements.push(<div key={i} className={style.subtitle}>{trimmed}</div>);
                    continue;
                  }

                  // Regular text
                  elements.push(<div key={i} className="my-0.5">{trimmed}</div>);
                }

                return elements.filter(Boolean);
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

function formatForPrint(text: string, isCv: boolean): string {
  return text.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return '<br/>';
    const isH = t === t.toUpperCase() && t.length > 2 && t.length < 60 && /[A-Z]/.test(t);
    if (i === 0 && isCv) return `<div class="name">${t}</div>`;
    if (isH) return `<div class="heading">${t}</div>`;
    if (t.startsWith('- ') || t.startsWith('• ')) return `<div class="bullet">${t.replace(/^[-•]\s*/, '')}</div>`;
    if (t.includes('—') && t.length < 100) return `<div class="subtitle">${t}</div>`;
    return `<div class="line">${t}</div>`;
  }).join('');
}
