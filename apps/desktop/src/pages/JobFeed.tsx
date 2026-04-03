import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bookmark,
  ExternalLink,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  RefreshCw,
  CheckSquare,
  Square as SquareIcon,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_COUNTRIES } from '@greenseer/shared';
import type { JobFeedItem, JobProcessingStatus } from '@greenseer/shared';
import { JobDetailPanel } from '@/components/JobDetailPanel';

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

function formatDatePosted(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface FeedResponse {
  jobs: JobFeedItem[];
  total: number;
  counts: Record<string, number>;
}

const STATUS_TABS: { value: string; label: string; badgeColor: string }[] = [
  { value: 'all', label: 'All', badgeColor: 'bg-foreground/10 text-foreground' },
  { value: 'matched', label: 'Matched', badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  { value: 'eligible', label: 'Eligible', badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  { value: 'pending', label: 'Pending', badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  { value: 'ineligible', label: 'Ineligible', badgeColor: 'bg-red-500/15 text-red-600 dark:text-red-400' },
];

export function JobFeed() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<JobFeedItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const perPage = 25;

  // Reset to page 1 when filters change
  const setStatusFilterAndReset = (v: string) => { setStatusFilter(v); setPage(1); };
  const setCountryFilterAndReset = (v: string) => { setCountryFilter(v); setPage(1); };
  const setSourceFilterAndReset = (v: string) => { setSourceFilter(v); setPage(1); };
  const setSortByAndReset = (v: string) => { setSortBy(v); setPage(1); };

  const { data, isLoading } = useQuery<FeedResponse>({
    placeholderData: (previousData) => previousData,
    queryKey: ['job-feed', statusFilter, countryFilter, sortBy, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('statusFilter', statusFilter);
      if (countryFilter !== 'all') params.set('countryCode', countryFilter);
      params.set('sortBy', sortBy);
      params.set('sortOrder', 'desc');
      params.set('page', String(page));
      params.set('limit', String(perPage));
      return apiGet<FeedResponse>(`/jobs/feed?${params}`);
    },
    refetchInterval: 5000,
  });

  const saveJob = useMutation({
    mutationFn: (jobId: string) => apiPost(`/jobs/${jobId}/save`),
    onSuccess: () => {
      toast.success('Job saved to tracker');
      queryClient.invalidateQueries({ queryKey: ['job-feed'] });
    },
  });

  const { data: profiles } = useQuery<{ id: string; isDefault: boolean }[]>({
    queryKey: ['cv-profiles-brief'],
    queryFn: () => apiGet('/cv/profiles'),
    staleTime: 60000,
  });

  const generateDocs = useMutation({
    mutationFn: async (job: JobFeedItem) => {
      const profile = profiles?.find((p) => p.isDefault) || profiles?.[0];
      if (!profile) throw new Error('No CV profile — create one in CV Manager first');
      const countryCode = job.analysis?.countryCode || 'AU';
      toast.info(`Generating documents for ${job.company}...`);
      await apiPost('/documents/generate', {
        jobId: job.id,
        jobDescription: job.description,
        jobTitle: job.title,
        company: job.company,
        cvProfileId: profile.id,
        countryCode,
      });
      // Also save to tracker as ready_to_apply
      await apiPost(`/jobs/${job.id}/save`);
    },
    onSuccess: () => {
      toast.success('Documents generated — check the job detail panel');
      queryClient.invalidateQueries({ queryKey: ['job-feed'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Generation failed — check your Anthropic API key');
    },
  });

  const batchReanalyze = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await apiPost(`/jobs/${id}/enrich-and-reanalyze`);
      }
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} jobs queued for re-analysis`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['job-feed'] });
    },
    onError: () => toast.error('Batch re-analysis failed'),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const jobs = data?.jobs || [];
  const total = data?.total || 0;
  const counts = data?.counts || {};
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Client-side filters (search + source)
  const filteredJobs = jobs.filter((j) => {
    if (sourceFilter !== 'all' && j.source !== sourceFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !j.title.toLowerCase().includes(q) &&
        !j.company.toLowerCase().includes(q) &&
        !j.location.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const selectAll = () => {
    if (selectedIds.size === filteredJobs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredJobs.map((j) => j.id)));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Status tabs + filters — full width, horizontally scrollable */}
      <div className="flex-shrink-0 overflow-x-auto border-b border-border">
        <div className="flex items-center gap-x-2 px-5 min-w-max">
          <div className="flex items-center" role="tablist" aria-label="Job status filter">
            {STATUS_TABS.map(({ value, label, badgeColor }) => {
              const count = value === 'all' ? counts.all : counts[value];
              const isActive = statusFilter === value;
              return (
                <button
                  key={value}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusFilterAndReset(value)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badgeColor}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs..."
                className="w-44 h-7 text-[12px] pl-7"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilterAndReset}>
              <SelectTrigger className="w-28 h-7 text-[12px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="adzuna">Adzuna</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="seek">Seek</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countryFilter} onValueChange={setCountryFilterAndReset}>
              <SelectTrigger className="w-32 h-7 text-[12px]">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortByAndReset}>
              <SelectTrigger className="w-28 h-7 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Newest</SelectItem>
                <SelectItem value="matchScore">Best Match</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Batch action bar — also full width */}
      {selectedIds.size > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b border-border bg-muted/30">
          <button onClick={selectAll} className="text-[12px] text-muted-foreground hover:text-foreground">
            {selectedIds.size === filteredJobs.length ? 'Deselect all' : 'Select all'}
          </button>
          <span className="text-[12px] font-medium text-foreground">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline" size="sm" className="h-7 text-[12px]"
              onClick={() => batchReanalyze.mutate()}
              disabled={batchReanalyze.isPending}
            >
              {batchReanalyze.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Re-analyze ({selectedIds.size})
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 text-[12px] text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Content: job list + detail panel side by side */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Job List */}
          <ScrollArea className="flex-1">
            <div>
              {isLoading ? (
                <LoadingState />
              ) : filteredJobs.length === 0 ? (
                <EmptyState status={searchQuery ? 'search' : statusFilter} />
              ) : (
                filteredJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isSelected={selectedJob?.id === job.id}
                    isChecked={selectedIds.has(job.id)}
                    onToggleCheck={() => toggleSelect(job.id)}
                    onSelect={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                    onSave={() => saveJob.mutate(job.id)}
                    onGenerate={() => generateDocs.mutate(job)}
                    isGenerating={generateDocs.isPending && (generateDocs.variables as any)?.id === job.id}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 flex items-center justify-between border-t border-border px-5 h-[49px]">
              <span className="text-[12px] text-muted-foreground">
                {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px] px-2.5"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 7) {
                    pageNum = i + 1;
                  } else if (page <= 4) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 3) {
                    pageNum = totalPages - 6 + i;
                  } else {
                    pageNum = page - 3 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 w-7 text-[12px] p-0"
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[12px] px-2.5"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {selectedJob && (
          <JobDetailPanel job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-[13px] text-muted-foreground">Loading jobs...</p>
    </div>
  );
}

function EmptyState({ status }: { status: string }) {
  const messages: Record<string, { title: string; desc: string }> = {
    all: { title: 'No jobs yet', desc: 'Click "Run Search" in the sidebar to find jobs.' },
    pending: { title: 'No pending jobs', desc: 'All jobs have been processed by AI.' },
    eligible: { title: 'No eligible jobs awaiting match', desc: 'Jobs will appear here after passing visa verification.' },
    matched: { title: 'No matched jobs yet', desc: 'Jobs will appear here after CV matching completes.' },
    ineligible: { title: 'No ineligible jobs', desc: 'Good news — all analyzed jobs passed visa check so far.' },
    search: { title: 'No matching jobs', desc: 'Try a different search term — you can search by company, title, or location.' },
  };
  const msg = messages[status] || messages.all;

  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center" role="status">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center" aria-hidden="true">
        <Briefcase className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[14px] font-medium text-foreground">{msg.title}</p>
        <p className="text-[13px] text-muted-foreground mt-0.5">{msg.desc}</p>
      </div>
    </div>
  );
}

/**
 * Shows a pill badge for non-matched processing states (pending, eligible, ineligible, error).
 * Returns null for the 'matched' status — MatchScoreBadge is used instead.
 */
function StatusBadge({ status }: { status: JobProcessingStatus }) {
  switch (status) {
    case 'pending':
    case 'analyzing':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground flex-shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Pending
        </span>
      );
    case 'eligible':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-500/10 text-blue-500 flex-shrink-0">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Matching
        </span>
      );
    case 'ineligible':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-500/10 text-red-400 flex-shrink-0">
          <XCircle className="h-3 w-3" aria-hidden="true" />
          No Visa
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-500 flex-shrink-0">
          Error
        </span>
      );
    default:
      return null;
  }
}

/**
 * Pill badge showing the visa sponsor confidence tier for a job.
 * Only shown once the job has been analyzed (analysis is non-null).
 */
function SponsorTierBadge({ tier }: { tier: string }) {
  const config: Record<string, { label: string; className: string }> = {
    confirmed: { label: 'Confirmed Sponsor', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    likely:    { label: 'Likely Sponsor',    className: 'bg-blue-500/10 text-blue-500' },
    unknown:   { label: 'Visa Unknown',      className: 'bg-muted text-muted-foreground' },
    unlikely:  { label: 'Unlikely Sponsor',  className: 'bg-amber-500/10 text-amber-500' },
    rejected:  { label: 'No Visa',           className: 'bg-red-500/10 text-red-400' },
  };
  const c = config[tier] ?? config.unknown;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium flex-shrink-0 ${c.className}`}>
      {c.label}
    </span>
  );
}

/**
 * Pill badge showing the numeric CV match score with a colour ramp:
 * red < 50, amber 50–74, emerald >= 75.
 */
function MatchScoreBadge({ score }: { score: number }) {
  let color = 'bg-red-500/10 text-red-400';
  if (score >= 75) color = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  else if (score >= 50) color = 'bg-amber-500/10 text-amber-500';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold flex-shrink-0 ${color}`}
      aria-label={`Match score: ${score}%`}
    >
      {score}%
    </span>
  );
}

/** Props for the JobCard component. */
interface JobCardProps {
  job: JobFeedItem;
  /** Whether this card is the currently selected / detail-open card. */
  isSelected: boolean;
  /** Whether this card is checked in the multi-select batch. */
  isChecked: boolean;
  onToggleCheck: () => void;
  onSelect: () => void;
  onSave: () => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

/**
 * A single job listing card. Handles all interactive states — checked, selected,
 * saved, generating, pending, ineligible, and expanded description.
 *
 * Layout (top-to-bottom):
 *  1. Title row  — checkbox + job title + source badge
 *  2. Meta row   — company · location · salary · date (wraps on narrow widths)
 *  3. Badge row  — status/score + sponsor tier + saved (wraps, never competes with title)
 *  4. Verdict    — single icon + single-line truncated explanation
 *  5. Skills     — matched (green, max 5) + missing (red, max 3), wraps naturally
 *  6. Expanded   — full description (toggle)
 *  7. Actions    — Save · Generate & Apply · Dismiss · Open + expand toggle (wraps if narrow)
 */
function JobCard({
  job,
  isSelected,
  isChecked,
  onToggleCheck,
  onSelect,
  onSave,
  onGenerate,
  isGenerating,
}: JobCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isSaved = !!job.applicationStatus;
  const [justSaved, setJustSaved] = useState(false);
  const saved = isSaved || justSaved;
  const matchScore = job.match?.matchScore ?? 0;
  const isPending = job.processingStatus === 'pending' || job.processingStatus === 'analyzing';
  const isIneligible = job.processingStatus === 'ineligible';
  const isMatched = job.processingStatus === 'matched' && !!job.match;
  const sponsorTier = job.analysis?.sponsorTier ?? 'unknown';

  // Single-sentence verdict shown below the meta row — always truncated to one line.
  let verdict = '';
  if (isPending) {
    verdict = 'Analyzing visa eligibility and CV match...';
  } else if (job.processingStatus === 'eligible') {
    verdict = 'Visa eligible — matching against your CV...';
  } else if (job.processingStatus === 'ineligible') {
    verdict = job.analysis?.visaExplanation?.split('.')[0] ?? 'No visa sponsorship found';
  } else if (isMatched && job.analysis) {
    const strength = matchScore >= 75 ? 'Strong match' : matchScore >= 50 ? 'Moderate match' : 'Weak match';
    const visaNote = job.analysis.visaExplanation?.split('.')[0];
    verdict = visaNote ? `${strength} — ${visaNote}` : strength;
  } else if (job.processingStatus === 'error') {
    verdict = 'Processing error — you can re-analyze this job from the batch toolbar.';
  }

  // Verdict icon: spinner while pending, check/cross once analyzed.
  const verdictIcon = isPending ? (
    <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-muted-foreground" aria-hidden="true" />
  ) : job.processingStatus === 'eligible' ? (
    <Clock className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" aria-hidden="true" />
  ) : job.analysis?.visaSponsorship ? (
    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
  ) : job.analysis ? (
    <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" aria-hidden="true" />
  ) : null;

  const hasSkills =
    job.match && (job.match.matchedSkills.length > 0 || job.match.missingSkills.length > 0);

  return (
    <div
      className={`border-b border-border px-5 py-2.5 cursor-pointer transition-colors overflow-hidden ${
        isSelected ? 'bg-muted/30' : 'hover:bg-muted/10'
      } ${isPending ? 'opacity-60' : ''} ${isIneligible ? 'opacity-50' : ''}`}
      onClick={onSelect}
    >
      <div className="flex gap-3 min-w-0">
        {/* Checkbox — aligned with title row */}
        <div className="flex-shrink-0 self-start flex items-center h-[20px]">
          <button
            className="text-muted-foreground/60 hover:text-foreground rounded-sm"
            onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
            aria-pressed={isChecked}
          >
            {isChecked ? <CheckSquare className="h-3.5 w-3.5 text-foreground" strokeWidth={1.5} /> : <SquareIcon className="h-3.5 w-3.5" strokeWidth={1.5} />}
          </button>
        </div>

        {/* Content — fills available space */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0 h-[20px]">
            <h3 className="text-[13px] font-medium text-foreground truncate min-w-0">{job.title}</h3>
            {isMatched && <MatchScoreBadge score={matchScore} />}
            {!isMatched && <StatusBadge status={job.processingStatus} />}
            {job.analysis && <SponsorTierBadge tier={sponsorTier} />}
            {saved && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary flex-shrink-0">Saved</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] mt-0.5 overflow-hidden">
            <span className="text-foreground/80 font-medium">{job.company}</span>
            <span className="text-muted-foreground/40" aria-hidden>·</span>
            <span className="text-muted-foreground truncate">{job.location}</span>
            {job.salary && (<><span className="text-muted-foreground/40" aria-hidden>·</span><span className="text-emerald-600 dark:text-emerald-400 font-medium">{job.salary}</span></>)}
            <span className="text-muted-foreground/40" aria-hidden>·</span>
            <span className="text-muted-foreground">{formatDatePosted(job.postedAt || job.createdAt)}</span>
          </div>
          {verdict && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5 min-w-0 overflow-hidden">
              {verdictIcon}
              <span className="truncate">{verdict}</span>
            </div>
          )}
          {hasSkills && (
            <div className="flex flex-wrap gap-1 mt-1 overflow-hidden">
              {job.match!.matchedSkills.slice(0, 4).map((s) => (
                <span key={s} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 truncate max-w-[160px]">{s}</span>
              ))}
              {job.match!.missingSkills.slice(0, 2).map((s) => (
                <span key={s} className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 truncate max-w-[160px]">{s}</span>
              ))}
            </div>
          )}
          {expanded && (
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {job.description}
            </div>
          )}
        </div>

        {/* Right: source top-right, actions bottom-right */}
        <div className="flex-shrink-0 flex flex-col items-end justify-between self-stretch" onClick={(e) => e.stopPropagation()}>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">{job.source}</Badge>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${saved ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`} onClick={() => { onSave(); setJustSaved(true); }} disabled={saved} aria-label="Save">
              <Bookmark className={`h-3.5 w-3.5 ${saved ? 'fill-current' : ''}`} strokeWidth={1.5} />
            </Button>
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${saved ? 'text-blue-500' : 'text-muted-foreground hover:text-blue-500'}`} onClick={saved ? onSelect : onGenerate} disabled={isGenerating || isPending} aria-label={saved ? 'View docs' : 'Generate'}>
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} /> : <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-emerald-500" onClick={() => openUrl(job.url)} aria-label="Open">
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${expanded ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setExpanded((v) => !v)} aria-label="Expand">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
