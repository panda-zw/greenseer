import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Search,
  Loader2,
  Building2,
  Trash2,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Info,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_COUNTRIES } from '@greenseer/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sponsor {
  id: string;
  company: string;
  countryCode: string;
  source: string;
  createdAt: string;
}

interface SponsorsResponse {
  sponsors: Sponsor[];
  total: number;
  lastUpdated: string | null;
}

interface SponsorStats {
  total: number;
  byCountry: Record<string, number>;
  lastUpdated: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

/** Countries that have a publicly downloadable official register. */
const FETCHABLE_COUNTRIES: { code: string; label: string; description: string }[] = [
  {
    code: 'UK',
    label: 'UK Skilled Worker Register',
    description: 'Home Office · ~50,000 licensed sponsors · updated quarterly',
  },
];

/** Helper to build the sidecar base URL (mirrors the unexported logic in api.ts). */
function sidecarUrl(path: string): string {
  // The port defaults to 11434 in api.ts; we mirror that here for raw fetch calls.
  return `http://127.0.0.1:11434/api${path}`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/** Sponsors page — browse, search, add, and import known visa-sponsor companies. */
export function Sponsors() {
  const queryClient = useQueryClient();

  // Filter / pagination state
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Add-sponsor form state
  const [newCompany, setNewCompany] = useState('');
  const [newCountry, setNewCountry] = useState('UK');

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: stats } = useQuery<SponsorStats>({
    queryKey: ['sponsor-stats'],
    queryFn: () => apiGet('/sponsors/stats'),
  });

  const { data, isLoading, isFetching } = useQuery<SponsorsResponse>({
    queryKey: ['sponsors', countryFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (countryFilter !== 'all') params.set('countryCode', countryFilter);
      if (search) params.set('search', search);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      return apiGet(`/sponsors?${params}`);
    },
    placeholderData: (prev) => prev,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const addSponsor = useMutation({
    mutationFn: () =>
      apiPost('/sponsors', { company: newCompany.trim(), countryCode: newCountry }),
    onSuccess: () => {
      toast.success(`Added "${newCompany.trim()}" to sponsor list`);
      setNewCompany('');
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
      queryClient.invalidateQueries({ queryKey: ['sponsor-stats'] });
    },
    onError: () => toast.error('Failed to add sponsor'),
  });

  const removeSponsor = useMutation({
    mutationFn: (s: Sponsor) =>
      fetch(sidecarUrl('/sponsors'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: s.company, countryCode: s.countryCode }),
      }),
    onSuccess: () => {
      toast.success('Sponsor removed');
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
      queryClient.invalidateQueries({ queryKey: ['sponsor-stats'] });
    },
    onError: () => toast.error('Failed to remove sponsor'),
  });

  // One-click fetch — fire-and-forget so navigating away doesn't cancel it.
  // The sidecar processes in the background; we poll stats to detect completion.
  const [fetchingCountry, setFetchingCountry] = useState<string | null>(null);

  const fetchRegister = useMutation({
    mutationFn: async (countryCode: string) => {
      setFetchingCountry(countryCode);
      // Fire the request but don't await the full response — it can take 30+ seconds
      fetch(sidecarUrl(`/sponsors/fetch-register?countryCode=${countryCode}`), {
        method: 'POST',
      }).then(async (res) => {
        setFetchingCountry(null);
        if (res.ok) {
          const result = await res.json();
          const country = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode)?.name ?? countryCode;
          toast.success(`Imported ${result.imported.toLocaleString()} sponsors from the ${country} register`);
        } else {
          toast.error('Failed to fetch register — check Activity log');
        }
        queryClient.invalidateQueries({ queryKey: ['sponsors'] });
        queryClient.invalidateQueries({ queryKey: ['sponsor-stats'] });
      }).catch(() => {
        setFetchingCountry(null);
        toast.error('Failed to fetch register — check your connection');
      });
      // Return immediately so mutation completes
      toast.info('Fetching UK register — this may take a minute. You can navigate away.');
    },
  });

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const sponsors = data?.sponsors ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sortedCountryStats = stats
    ? Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1])
    : [];

  const formattedLastUpdated = stats?.lastUpdated
    ? new Date(stats.lastUpdated).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCountryFilter(code: string) {
    setCountryFilter(code);
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleAddKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && newCompany.trim()) addSponsor.mutate();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-shrink-0 flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Known Sponsors</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {stats
              ? `${stats.total.toLocaleString()} companies across ${sortedCountryStats.length} ${sortedCountryStats.length === 1 ? 'country' : 'countries'}`
              : 'Loading…'}
            {formattedLastUpdated && (
              <span className="text-muted-foreground"> · Updated {formattedLastUpdated}</span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[12px] text-muted-foreground"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['sponsors'] });
            queryClient.invalidateQueries({ queryKey: ['sponsor-stats'] });
          }}
          aria-label="Refresh sponsor list"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Country filter pills                                                 */}
      {/* ------------------------------------------------------------------ */}
      {sortedCountryStats.length > 0 && (
        <div
          className="flex-shrink-0 flex items-center gap-1.5 px-5 py-2 border-b border-border overflow-x-auto"
          role="group"
          aria-label="Filter by country"
        >
          <button
            onClick={() => handleCountryFilter('all')}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              countryFilter === 'all'
                ? 'bg-foreground/10 text-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={countryFilter === 'all'}
          >
            All
            <span className="opacity-60">{stats?.total.toLocaleString()}</span>
          </button>

          {sortedCountryStats.map(([code, count]) => {
            const name = SUPPORTED_COUNTRIES.find((c) => c.code === code)?.name ?? code;
            const active = countryFilter === code;
            return (
              <button
                key={code}
                onClick={() => handleCountryFilter(code)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-foreground/10 text-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={active}
              >
                {name}
                <span className="opacity-60">{count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Toolbar — search + add form                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-border">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search companies…"
            className="h-7 text-[12px] pl-7"
            aria-label="Search sponsors"
          />
        </div>

        {isFetching && !isLoading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <Separator orientation="vertical" className="h-4 mx-1" />

          {/* Manual add form */}
          <Input
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Company name"
            className="h-7 text-[12px] w-40"
            aria-label="New sponsor company name"
          />
          <Select value={newCountry} onValueChange={setNewCountry}>
            <SelectTrigger className="h-7 w-[72px] text-[12px]" aria-label="Country for new sponsor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code} className="text-[12px]">
                  {c.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => addSponsor.mutate()}
            disabled={!newCompany.trim() || addSponsor.isPending}
            aria-label="Add sponsor manually"
          >
            {addSponsor.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            Add
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Official register import panel                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-shrink-0 border-b border-border px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Import Official Registers
        </p>
        <div className="flex flex-wrap items-start gap-3">
          {/* Fetchable countries */}
          {FETCHABLE_COUNTRIES.map(({ code, label, description }) => {
            const isPending = fetchingCountry === code;
            return (
              <div
                key={code}
                className="flex items-center justify-between gap-4 rounded-lg border border-border px-3.5 py-2.5 min-w-[320px] flex-1"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground leading-snug">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px] flex-shrink-0 text-emerald-600 border-emerald-600/40 hover:bg-emerald-500/10 hover:text-emerald-600"
                  onClick={() => fetchRegister.mutate(code)}
                  disabled={isPending}
                  aria-label={`Fetch ${label}`}
                >
                  {isPending ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3 mr-1.5" />
                  )}
                  {isPending ? 'Fetching…' : 'Fetch Register'}
                </Button>
              </div>
            );
          })}

          {/* CSV upload for any country */}
          <CsvUploadCard
            onImported={() => {
              queryClient.invalidateQueries({ queryKey: ['sponsors'] });
              queryClient.invalidateQueries({ queryKey: ['sponsor-stats'] });
            }}
          />

          {/* Info note */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 min-w-[240px] flex-1">
            <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              AU, CA, US, DE etc. don't publish a register. Use CSV upload with your own list, or add companies manually.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sponsor list                                                         */}
      {/* ------------------------------------------------------------------ */}
      {/* Column header — outside ScrollArea so it stays fixed */}
      {!isLoading && sponsors.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b border-border bg-card">
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Company
          </span>
          <span className="w-28 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
            Country
          </span>
          <span className="w-24 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
            Source
          </span>
          <span className="w-6" />
        </div>
      )}

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40" aria-label="Loading sponsors">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sponsors.length === 0 ? (
          <EmptyState search={search} countryFilter={countryFilter} />
        ) : (
          <div role="list" aria-label="Sponsor list">

            {sponsors.map((s) => (
              <SponsorRow
                key={s.id}
                sponsor={s}
                onRemove={() => removeSponsor.mutate(s)}
                isRemoving={removeSponsor.isPending && removeSponsor.variables?.id === s.id}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-shrink-0 flex items-center justify-between border-t border-border px-5 h-[44px]">
        <span className="text-[12px] text-muted-foreground">
          {total > 0
            ? `${((page - 1) * PAGE_SIZE + 1).toLocaleString()}–${Math.min(page * PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`
            : '0 results'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[12px] text-muted-foreground px-1 tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SponsorRowProps {
  sponsor: Sponsor;
  onRemove: () => void;
  isRemoving: boolean;
}

/** A single row in the sponsor list. */
function SponsorRow({ sponsor, onRemove, isRemoving }: SponsorRowProps) {
  const countryName =
    SUPPORTED_COUNTRIES.find((c) => c.code === sponsor.countryCode)?.name ?? sponsor.countryCode;

  return (
    <div
      role="listitem"
      className="flex items-center gap-3 px-5 py-2 border-b border-border last:border-0 hover:bg-muted/20 group transition-colors"
    >
      <span className="flex-1 text-[13px] font-medium text-foreground truncate capitalize">
        {sponsor.company}
      </span>
      <span className="w-28 flex-shrink-0 text-right">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
          {countryName}
        </Badge>
      </span>
      <span className="w-24 text-[11px] text-muted-foreground truncate flex-shrink-0 text-right">
        {sponsor.source}
      </span>
      <div className="w-6 flex-shrink-0 flex items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          onClick={onRemove}
          disabled={isRemoving}
          aria-label={`Remove ${sponsor.company}`}
        >
          {isRemoving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  search: string;
  countryFilter: string;
}

/** Empty state shown when the sponsor list is empty. */
function EmptyState({ search, countryFilter }: EmptyStateProps) {
  const countryName =
    SUPPORTED_COUNTRIES.find((c) => c.code === countryFilter)?.name ?? countryFilter;

  let message = 'No sponsors in the database yet.';
  if (search && countryFilter !== 'all') {
    message = `No sponsors matching "${search}" in ${countryName}.`;
  } else if (search) {
    message = `No sponsors matching "${search}".`;
  } else if (countryFilter !== 'all') {
    message = `No sponsors added for ${countryName} yet.`;
  }

  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-5">
      <Building2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      <p className="text-[13px] text-muted-foreground max-w-xs">{message}</p>
      {!search && (
        <p className="text-[12px] text-muted-foreground">
          Use "Fetch Register" above to import the UK official register, or add companies manually.
        </p>
      )}
    </div>
  );
}

/** CSV upload card for importing sponsor lists for any country. */
function CsvUploadCard({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCountry, setUploadCountry] = useState('AU');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('countryCode', uploadCountry);
      const res = await fetch(sidecarUrl('/sponsors/import'), {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      toast.success(`Imported ${data.imported.toLocaleString()} sponsors for ${uploadCountry}`);
      onImported();
    } catch {
      toast.error('CSV import failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3.5 py-2.5 min-w-[280px] flex-1">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground leading-snug">Upload CSV</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">Import a list of companies for any country</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleUpload} />
        <Select value={uploadCountry} onValueChange={setUploadCountry}>
          <SelectTrigger className="h-7 w-[72px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-[12px]">{c.code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-3 w-3 mr-1.5" />
          )}
          {uploading ? 'Importing…' : 'Upload'}
        </Button>
      </div>
    </div>
  );
}
