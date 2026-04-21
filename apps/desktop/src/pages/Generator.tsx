import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Wand2, FileText, Link as LinkIcon, History, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_COUNTRIES } from '@greenseer/shared';
import type { CvProfileDto, GeneratedDocumentDto } from '@greenseer/shared';
import { DocumentPreview } from '@/components/DocumentPreview';

interface ImportedJob {
  jobTitle: string;
  company: string;
  location: string;
  countryCode: string;
  description: string;
  sourceUrl: string;
}

export function Generator() {
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [countryCode, setCountryCode] = useState('GLOBAL');
  // Empty string = "All profiles (combined knowledge base)". The user can
  // pick a specific profile to narrow the source.
  const ALL_PROFILES = '__all__';
  const [selectedProfileId, setSelectedProfileId] = useState<string>(ALL_PROFILES);
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocumentDto | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const { data: profiles } = useQuery<CvProfileDto[]>({
    queryKey: ['cv-profiles'],
    queryFn: () => apiGet('/cv/profiles'),
  });

  const { data: history } = useQuery<any[]>({
    queryKey: ['generation-history'],
    queryFn: () => apiGet('/documents/generation-history'),
  });

  const importJob = useMutation({
    mutationFn: () => apiPost<ImportedJob>('/documents/import-job-url', { url: jobUrl.trim() }),
    onSuccess: (data) => {
      // Populate the form but keep whatever the user typed in fields the
      // importer couldn't fill, so imports never wipe valid input.
      if (data.jobTitle) setJobTitle(data.jobTitle);
      if (data.company) setCompany(data.company);
      if (data.description) setJobDescription(data.description);
      if (data.countryCode) setCountryCode(data.countryCode);
      toast.success(`Imported: ${data.jobTitle || 'job'}${data.location ? ` - ${data.location}` : ''}`);
    },
    onError: (err: any) => toast.error(err?.message || 'Could not import from URL'),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiPost<GeneratedDocumentDto>('/documents/generate', {
        jobDescription,
        jobTitle,
        company: company.trim(),
        // null tells the backend to use every profile as a combined knowledge base.
        cvProfileId: selectedProfileId === ALL_PROFILES ? null : selectedProfileId,
        countryCode,
      }),
    onSuccess: (data) => {
      setGeneratedDoc(data);
      queryClient.invalidateQueries({ queryKey: ['generation-history'] });
      toast.success('Documents generated');
    },
    onError: (err: any) =>
      toast.error(err?.message || 'Generation failed — check your Anthropic API key.'),
  });

  const deleteHistory = useMutation({
    mutationFn: (id: string) => {
      return fetch(`http://127.0.0.1:11434/api/documents/generation-history/${id}`, { method: 'DELETE' })
        .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['generation-history'] }),
  });

  const loadFromHistory = (entry: any) => {
    setGeneratedDoc({
      id: entry.id,
      jobId: '',
      cvProfileId: '',
      countryCode: entry.countryCode,
      cvText: entry.cvText,
      coverLetter: entry.coverLetter,
      generatedAt: entry.createdAt,
    });
    setJobTitle(entry.jobTitle);
    setCompany(entry.company);
    setCountryCode(entry.countryCode);
  };

  // Company is intentionally optional. Profile is also optional — falling back
  // to all profiles combined — so the only hard requirements are the job
  // description, the title, and the existence of at least one CV profile.
  const hasAnyProfile = (profiles?.length ?? 0) > 0;
  const canGenerate = jobDescription.trim() && jobTitle.trim() && hasAnyProfile;

  return (
    <div className="flex h-full">
      {/* Input panel */}
      <div className="w-[380px] border-r border-border flex flex-col bg-card">
        <div className="flex-shrink-0 p-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">Generate Documents</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Paste a LinkedIn link to auto-fill, or enter details manually.
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {/* Quick import from job URL */}
            <div>
              <Label className="text-[12px]">Import from URL</Label>
              <div className="flex gap-1.5 mt-1">
                <Input
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && jobUrl.trim() && !importJob.isPending) {
                      importJob.mutate();
                    }
                  }}
                  placeholder="https://www.linkedin.com/jobs/view/..."
                  className="text-[13px]"
                />
                <Button
                  variant="outline"
                  className="h-9 text-[12px] px-2.5"
                  onClick={() => importJob.mutate()}
                  disabled={!jobUrl.trim() || importJob.isPending}
                  title="Fetch job details from the URL"
                >
                  {importJob.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LinkIcon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Works with LinkedIn and sites that expose structured job data.
              </p>
            </div>

            <div className="border-t border-border -mx-4" />

            <div>
              <Label className="text-[12px]">Job Title</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" className="text-[13px] mt-1" />
            </div>
            <div>
              <Label className="text-[12px]">
                Company <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Leave blank if confidential"
                className="text-[13px] mt-1"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-[12px]">Country</Label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger className="text-[13px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-[12px]">CV Source</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger className="text-[13px] mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PROFILES}>All profiles (combined)</SelectItem>
                    {profiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">Job Description</Label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="w-full h-52 mt-1 bg-muted/30 border border-border rounded-lg p-3 text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Paste the full job description..."
              />
            </div>
            <Button onClick={() => generate.mutate()} disabled={!canGenerate || generate.isPending} className="w-full text-[13px]">
              {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              {generate.isPending ? 'Generating...' : 'Generate'}
            </Button>

            {/* Generation History */}
            {history && history.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">History</span>
                </div>
                <div className="space-y-1">
                  {history.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 cursor-pointer group text-[12px]"
                      onClick={() => loadFromHistory(entry)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {entry.jobTitle}
                        </p>
                        <p className="truncate text-muted-foreground text-[11px]">
                          {entry.company || 'Confidential'} · {entry.countryCode} · {new Date(entry.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={(e) => { e.stopPropagation(); deleteHistory.mutate(entry.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Output panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {generatedDoc ? (
          <>
            {/* Header aligned with input panel header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="text-[14px] font-semibold">
                  {company.trim() || 'Confidential'} · {countryCode}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5">{jobTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-8 text-[12px]"
                  onClick={() => setShowPreview(true)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Preview, Edit & Download
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px]"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending}
                >
                  {generate.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                  Regenerate
                </Button>
              </div>
            </div>

            {/* Two-column document view */}
            <div className="flex-1 flex overflow-hidden">
              {/* CV */}
              <div className="flex-1 flex flex-col border-r border-border">
                <div className="flex-shrink-0 px-4 py-2 border-b border-border">
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">CV / Resume</span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {generatedDoc.cvText}
                  </div>
                </ScrollArea>
              </div>

              {/* Cover Letter */}
              <div className="flex-1 flex flex-col">
                <div className="flex-shrink-0 px-4 py-2 border-b border-border">
                  <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Cover Letter</span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                    {generatedDoc.coverLetter}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Wand2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium">Ready to generate</p>
            <p className="text-[13px] text-muted-foreground text-center max-w-xs">
              Fill in the job details and click Generate to create a country-formatted CV and cover letter.
            </p>
          </div>
        )}
      </div>

      {/* Document preview modal */}
      {showPreview && generatedDoc && (
        <DocumentPreview
          document={generatedDoc}
          company={company}
          onClose={() => setShowPreview(false)}
          onUpdated={(updated) => setGeneratedDoc(updated)}
        />
      )}
    </div>
  );
}
