import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { DocumentPreview } from './DocumentPreview';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  X,
  ExternalLink,
  CheckCircle2,
  XCircle,
  FileText,
  Copy,
  Bookmark,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { JobFeedItem, GeneratedDocumentDto, ApplicationDto } from '@greenseer/shared';
import { APPLICATION_STATUSES } from '@greenseer/shared';

const tabClass = "text-[13px] px-3 py-2.5 rounded-none shadow-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground";

function formatDatePosted(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString();
}

async function openUrl(url: string) {
  try {
    if ('__TAURI_INTERNALS__' in window) {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } else {
      window.open(url, '_blank');
    }
  } catch {
    window.open(url, '_blank');
  }
}

export function JobDetailPanel({
  job,
  onClose,
}: {
  job: JobFeedItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const matchScore = job.match?.matchScore ?? 0;
  const visa = job.analysis?.visaSponsorship ?? false;

  const { data: documents } = useQuery<GeneratedDocumentDto[]>({
    queryKey: ['documents', job.id],
    queryFn: () => apiGet(`/documents/job/${job.id}`),
  });

  const { data: application } = useQuery<ApplicationDto[]>({
    queryKey: ['job-application', job.id],
    queryFn: async () => {
      const apps: ApplicationDto[] = await apiGet('/tracker/applications');
      return apps.filter((a) => a.jobId === job.id);
    },
  });

  const app = application?.[0];
  const [previewDoc, setPreviewDoc] = useState<GeneratedDocumentDto | null>(null);
  const latestDoc = documents?.[0];

  const saveJob = useMutation({
    mutationFn: () => apiPost(`/jobs/${job.id}/save`),
    onSuccess: () => {
      toast.success('Saved to tracker');
      queryClient.invalidateQueries({ queryKey: ['job-application', job.id] });
    },
  });

  const { data: profiles } = useQuery<{ id: string; isDefault: boolean }[]>({
    queryKey: ['cv-profiles-brief'],
    queryFn: () => apiGet('/cv/profiles'),
    staleTime: 60000,
  });

  const generateDocs = useMutation({
    mutationFn: async () => {
      const profile = profiles?.find((p) => p.isDefault) || profiles?.[0];
      if (!profile) throw new Error('No CV profile — create one in CV Manager first');
      const countryCode = job.analysis?.countryCode || 'AU';
      await apiPost('/documents/generate', {
        jobId: job.id,
        jobDescription: job.description,
        jobTitle: job.title,
        company: job.company,
        cvProfileId: profile.id,
        countryCode,
      });
      await apiPost(`/jobs/${job.id}/save`);
    },
    onSuccess: () => {
      toast.success('Documents generated');
      queryClient.invalidateQueries({ queryKey: ['documents', job.id] });
      queryClient.invalidateQueries({ queryKey: ['job-feed'] });
    },
    onError: (err: any) => toast.error(err.message || 'Generation failed'),
  });

  const [notes, setNotes] = useState(app?.notes || '');

  const updateNotes = useMutation({
    mutationFn: (text: string) =>
      apiPut(`/tracker/applications/${app?.id}/notes`, { notes: text }),
  });

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const tierConfig: Record<string, { label: string; className: string }> = {
    confirmed: { label: 'Confirmed Sponsor', className: 'text-emerald-500' },
    likely: { label: 'Likely Sponsor', className: 'text-blue-500' },
    unknown: { label: 'Unknown', className: 'text-muted-foreground' },
    unlikely: { label: 'Unlikely', className: 'text-amber-500' },
    rejected: { label: 'No Visa', className: 'text-red-400' },
  };

  return (
    <div className="w-[min(420px,50vw)] min-w-[280px] border-l border-border flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground leading-tight break-words">
            {job.title}
          </h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">{job.company}</p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[12px]">
            <span className="text-muted-foreground">{job.location}</span>
            {job.salary && (
              <span className="font-medium text-emerald-500">{job.salary}</span>
            )}
            <span className="text-muted-foreground">{formatDatePosted(job.postedAt || job.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost" size="sm"
            className="h-7 text-[12px] text-muted-foreground"
            onClick={() => openUrl(job.url)}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Open
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 border-b border-border">
          <TabsList className="h-auto bg-transparent p-0 rounded-none">
            <TabsTrigger value="overview" className={tabClass}>Overview</TabsTrigger>
            <TabsTrigger value="description" className={tabClass}>Description</TabsTrigger>
            <TabsTrigger value="documents" className={tabClass}>Documents</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              {/* Match Score */}
              {job.match && (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Match Score</Label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          matchScore >= 75 ? 'bg-emerald-500' : matchScore >= 50 ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${matchScore}%` }}
                      />
                    </div>
                    <span className="text-[14px] font-bold text-foreground w-10 text-right">{matchScore}%</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed break-words">
                    {job.match.summary}
                  </p>
                </div>
              )}

              {/* Visa Status */}
              {job.analysis && (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Visa Sponsorship</Label>
                  <div className="flex items-start gap-2 mt-1.5">
                    {visa ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className={`text-[12px] font-medium ${tierConfig[job.analysis.sponsorTier || 'unknown']?.className}`}>
                        {tierConfig[job.analysis.sponsorTier || 'unknown']?.label}
                      </span>
                      <p className="text-[12px] text-foreground/80 leading-relaxed break-words mt-0.5">
                        {job.analysis.visaExplanation}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sponsor Feedback */}
              {job.analysis && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Is this correct?</span>
                  <Button
                    variant="outline" size="sm" className="h-6 text-[11px] px-2"
                    onClick={async () => {
                      await apiPost('/jobs/sponsor-feedback', {
                        company: job.company,
                        countryCode: job.analysis!.countryCode,
                        sponsors: true,
                      });
                      toast.success(`Marked ${job.company} as a sponsor`);
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Yes, sponsors
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-6 text-[11px] px-2"
                    onClick={async () => {
                      await apiPost('/jobs/sponsor-feedback', {
                        company: job.company,
                        countryCode: job.analysis!.countryCode,
                        sponsors: false,
                      });
                      toast.success(`Marked ${job.company} as non-sponsor`);
                    }}
                  >
                    <XCircle className="h-3 w-3 mr-1" /> No, doesn't
                  </Button>
                </div>
              )}

              {/* Skills */}
              {job.match && (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Skills</Label>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {job.match.matchedSkills.map((s) => (
                      <span key={s} className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-500 break-all">
                        {s}
                      </span>
                    ))}
                    {job.match.missingSkills.map((s) => (
                      <span key={s} className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-red-500/10 text-red-400 break-all">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Application Status */}
              {app && (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Application Status</Label>
                  <div className="mt-1.5 space-y-1.5">
                    {app.history.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-[12px]">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-foreground">
                          {APPLICATION_STATUSES.find((s) => s.value === h.status)?.label}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(h.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {app && (
                <div>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => updateNotes.mutate(notes)}
                    className="w-full h-20 mt-1.5 bg-muted/50 border border-border rounded-lg p-2.5 text-[12px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Add notes about this application..."
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {!app && (
                  <Button size="sm" className="h-8 text-[12px]" onClick={() => saveJob.mutate()}>
                    <Bookmark className="h-3 w-3 mr-1.5" />
                    Save to Tracker
                  </Button>
                )}
                <Button
                  variant={latestDoc ? 'outline' : 'default'}
                  size="sm"
                  className="h-8 text-[12px]"
                  onClick={() => generateDocs.mutate()}
                  disabled={generateDocs.isPending}
                >
                  {generateDocs.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3 mr-1.5" />
                  )}
                  {latestDoc ? 'Regenerate Documents' : 'Generate CV & Cover Letter'}
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => openUrl(job.url)}>
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  View Original
                </Button>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Description Tab */}
        <TabsContent value="description" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Job metadata */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-foreground">{job.title}</h3>
                </div>
                <div className="text-[13px] space-y-1">
                  <p><span className="text-muted-foreground">Company:</span> <span className="font-medium">{job.company}</span></p>
                  <p><span className="text-muted-foreground">Location:</span> {job.location}</p>
                  {job.salary && <p><span className="text-muted-foreground">Salary:</span> <span className="text-emerald-500 font-medium">{job.salary}</span></p>}
                  <p><span className="text-muted-foreground">Source:</span> {job.source}</p>
                  {job.postedAt && <p><span className="text-muted-foreground">Posted:</span> {new Date(job.postedAt).toLocaleDateString()}</p>}
                  <p><span className="text-muted-foreground">Found:</span> {new Date(job.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Open original link */}
              <Button variant="outline" size="sm" className="h-8 text-[12px] w-full" onClick={() => openUrl(job.url)}>
                <ExternalLink className="h-3 w-3 mr-1.5" />
                View Full Job Posting
              </Button>

              {/* Re-analyze button — always available */}
              <ReanalyzeButton jobId={job.id} queryClient={queryClient} />

              {/* Description */}
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Description</Label>
                {job.description.length > 100 ? (
                  <div className="mt-1.5 text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                    {job.description}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[13px] text-muted-foreground">
                    <p>Limited description available from {job.source}.</p>
                    <p className="mt-1">Click "Fetch Full Description & Re-analyze" above to get the complete job details.</p>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              {latestDoc ? (
                <div className="space-y-4">
                  {/* Preview & Edit */}
                  <Button
                    className="w-full h-10 text-[13px]"
                    onClick={() => setPreviewDoc(latestDoc)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Preview, Edit & Download
                  </Button>

                  {/* CV Section */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                      <span className="text-[12px] font-semibold">CV / Resume</span>
                      <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => copyText(latestDoc.cvText, 'CV')}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <div className="px-3 py-2.5 text-[12px] text-muted-foreground leading-relaxed line-clamp-4">
                      {latestDoc.cvText.slice(0, 200)}...
                    </div>
                  </div>

                  {/* Cover Letter Section */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                      <span className="text-[12px] font-semibold">Cover Letter</span>
                      <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => copyText(latestDoc.coverLetter, 'Cover letter')}>
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <div className="px-3 py-2.5 text-[12px] text-muted-foreground leading-relaxed line-clamp-4">
                      {latestDoc.coverLetter.slice(0, 200)}...
                    </div>
                  </div>

                  {/* Regenerate */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-[12px]"
                    onClick={() => generateDocs.mutate()}
                    disabled={generateDocs.isPending}
                  >
                    {generateDocs.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <FileText className="h-3 w-3 mr-1.5" />}
                    {generateDocs.isPending ? 'Regenerating...' : 'Regenerate Documents'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-[13px] text-muted-foreground">No documents generated yet.</p>
                  <p className="text-[12px] text-muted-foreground">Click "Generate" on the job card to create a tailored CV and cover letter.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Document preview modal */}
      {previewDoc && (
        <DocumentPreview
          document={previewDoc}
          company={job.company}
          onClose={() => setPreviewDoc(null)}
          onUpdated={(updated) => setPreviewDoc(updated)}
        />
      )}
    </div>
  );
}

function ReanalyzeButton({ jobId, queryClient }: { jobId: string; queryClient: any }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-[12px] w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        toast.info('Re-analyzing job...');
        try {
          await apiPost(`/jobs/${jobId}/enrich-and-reanalyze`);
          toast.success('Job queued for re-analysis');
          queryClient.invalidateQueries({ queryKey: ['job-feed'] });
        } catch {
          toast.error('Re-analysis failed');
        }
        setLoading(false);
      }}
    >
      {loading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
      {loading ? 'Re-analyzing...' : 'Re-analyze Job'}
    </Button>
  );
}
